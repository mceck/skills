import type { McpServer, SessionMessageInfo, SkillInfo, VcsFileStatus } from "@opencode/client"
import { Plugin, usePlugin } from "@opencode/plugin/tui"
import type { MouseEvent as TuiMouseEvent } from "@opentui/core"
import { spawn } from "node:child_process"
import { ErrorBoundary, For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
const MAX_CHANGES = 12
const MAX_SKILL_ROWS = 3
const MAX_MCP_ROWS = 3
const MAX_COMMITS = 10
const COMMIT_STEP = 10

function formatTokens(tokens: number): string {
  if (tokens >= 999_950) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return String(tokens)
}

/** Same scale without the redundant `.0`, for narrow inline labels. */
function shortTokens(tokens: number): string {
  return formatTokens(tokens).replace(/\.0([KM])$/, "$1")
}

const GUI_EDITORS = new Set([
  "android-studio",
  "atom",
  "bbedit",
  "clion",
  "code",
  "code-insiders",
  "codium",
  "cursor",
  "datagrip",
  "fleet",
  "goland",
  "idea",
  "kiro",
  "mate",
  "nova",
  "phpstorm",
  "pycharm",
  "rider",
  "rubymine",
  "subl",
  "trae",
  "webstorm",
  "windsurf",
  "xcode",
  "zed",
])

type Usage = {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}

/**
 * Mirrors the built-in context computation: the newest assistant message with
 * usage after the last completed compaction, bounded by the revert marker.
 */
function lastAssistantWithUsage(messages: readonly SessionMessageInfo[], boundary?: string) {
  const boundaryIndex = boundary ? messages.findIndex((message) => message.id === boundary) : -1
  if (boundary && boundaryIndex === -1) return undefined
  const end = boundaryIndex === -1 ? messages.length : boundaryIndex

  let compactionIndex = -1
  for (let index = end - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.type === "compaction" && message.status === "completed") {
      compactionIndex = index
      break
    }
  }

  for (let index = end - 1; index > compactionIndex; index--) {
    const message = messages[index]
    if (message?.type === "assistant" && message.tokens) return message
  }
  return undefined
}

function usedTokens(tokens: Usage): number {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}

/** Skills show up as a user attachment, a skill message, or a `skill` tool call. */
function collectUsedSkills(messages: readonly SessionMessageInfo[], into: Set<string>) {
  for (const message of messages) {
    if (message.type === "skill") {
      into.add(message.skill)
      into.add(message.name)
      continue
    }
    if (message.type === "user") {
      for (const skill of message.skills ?? []) {
        into.add(skill.id)
        into.add(skill.name)
      }
      continue
    }
    if (message.type !== "assistant") continue

    for (const part of message.content) {
      if (part.type !== "tool" || part.name !== "skill") continue
      const input = part.state.input
      if (typeof input === "string") {
        const match = input.match(/"(?:id|name)"\s*:\s*"([^"]+)"/)
        if (match?.[1]) into.add(match[1])
        continue
      }
      const id = (input as Record<string, unknown>).id
      const name = (input as Record<string, unknown>).name
      if (typeof id === "string") into.add(id)
      if (typeof name === "string") into.add(name)
    }
  }
}

function splitFile(file: string): { name: string; dir: string } {
  const index = file.lastIndexOf("/")
  if (index < 0) return { name: file, dir: "" }
  return { name: file.slice(index + 1), dir: file.slice(0, index) }
}

const TAGS: Record<string, string> = {
  ts: "TS",
  tsx: "TX",
  js: "JS",
  jsx: "JX",
  mjs: "JS",
  cjs: "JS",
  py: "PY",
  go: "GO",
  rs: "RS",
  java: "JV",
  kt: "KT",
  rb: "RB",
  json: "{}",
  md: "MD",
  mdx: "MD",
  css: "CS",
  scss: "SC",
  html: "HT",
  yml: "YM",
  yaml: "YM",
  toml: "TM",
  sh: "SH",
  sql: "SQ",
  swift: "SW",
  dart: "DA",
  php: "PH",
}

function fileTag(file: string): string {
  const name = file.slice(file.lastIndexOf("/") + 1)
  const dot = name.lastIndexOf(".")
  if (dot <= 0) return "··"
  const extension = name.slice(dot + 1).toLowerCase()
  return TAGS[extension] ?? extension.slice(0, 2).toUpperCase()
}

type GitCommit = {
  hash: string
  subject: string
  pushed: boolean
}

type GitState = {
  branch: string
  commits: GitCommit[]
  hasMore: boolean
}

/** Run git in the session directory without blocking the renderer. */
function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr?.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr.trim() || `git ${args.join(" ")} exited with ${code}`))
    })
  })
}

/** Branch plus the newest commits, marking the ones that are not on the upstream. */
async function loadGit(cwd: string, limit: number): Promise<GitState | undefined> {
  try {
    let branch = (await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()
    if (branch === "HEAD") {
      branch = (await runGit(cwd, ["rev-parse", "--short", "HEAD"])).trim()
    }
    if (!branch) return undefined

    const [log, unpushed] = await Promise.all([
      runGit(cwd, ["log", "-n", String(limit + 1), "--format=%H%x1f%s"]),
      runGit(cwd, ["rev-list", "@{upstream}..HEAD"]).catch(() => undefined),
    ])

    // Without an upstream every commit still lives only on this machine.
    const ahead =
      unpushed === undefined ? undefined : new Set(unpushed.split("\n").filter(Boolean))
    const commits = log
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("\x1f")
        const hash = separator === -1 ? line : line.slice(0, separator)
        return {
          hash,
          subject: separator === -1 ? "" : line.slice(separator + 1),
          pushed: ahead !== undefined && !ahead.has(hash),
        }
      })

    return { branch, commits, hasMore: commits.length > limit }
  } catch {
    return undefined
  }
}

function Sidebar(props: { sessionID: string }) {
  const context = usePlugin()
  const theme = context.theme

  const session = createMemo(() => context.data.session.get(props.sessionID))
  const directory = createMemo(
    () =>
      session()?.location.directory ??
      context.location?.directory ??
      context.data.location.default().directory,
  )

  const usage = createMemo(() => {
    const messages = context.data.session.message.list(props.sessionID)
    const last = lastAssistantWithUsage(messages, session()?.revert?.messageID)
    if (!last?.tokens) return
    const tokens = usedTokens(last.tokens)
    if (tokens <= 0) return
    const model = context.data.location.model
      .list({ directory: directory() })
      ?.find(
        (item) => item.providerID === last.model.providerID && item.id === last.model.id,
      )
    return {
      tokens,
      percent: model?.limit.context ? Math.round((tokens / model.limit.context) * 100) : undefined,
    }
  })

  const cost = createMemo(() => context.data.session.cost(props.sessionID))

  const modelLine = createMemo(() => {
    const selected = context.ui.model.current()
    const ref =
      session()?.model ??
      (selected
        ? {
            id: selected.modelID,
            providerID: selected.providerID,
            variant: selected.variant,
          }
        : undefined)
    if (!ref) return undefined

    const model = context.data.location.model
      .list({ directory: directory() })
      ?.find(
        (item) =>
          item.providerID === ref.providerID &&
          (item.id === ref.id || item.modelID === ref.id),
      )
    const name = model?.name ?? ref.id
    return ref.variant ? `${name} (${ref.variant})` : name
  })

  const contextLine = createMemo(() => {
    const parts = ["Context:"]
    const value = usage()
    if (value) parts.push(`${formatTokens(value.tokens)} tokens`)
    if (cost() > 0) parts.push(MONEY.format(cost()))
    return parts.join(" ")
  })

  const contextPercent = createMemo(() => {
    const percent = usage()?.percent
    if (percent === undefined) return undefined
    return Math.max(0, Math.min(100, percent))
  })

  const subagents = createMemo(() => {
    if (session()?.parentID) return []
    return context.data.session
      .family(props.sessionID)
      .filter(
        (id) =>
          id !== props.sessionID &&
          context.data.session.status(id) === "running",
      )
      .map((id) => ({ id, info: context.data.session.get(id) }))
  })

  const mcp = createMemo(
    () => context.data.location.mcp.server.list({ directory: directory() }) ?? [],
  )

  const [mcpExpanded, setMcpExpanded] = createSignal(false)
  const [mcpMoreHovered, setMcpMoreHovered] = createSignal(false)
  const [mcpView, updateMcpView] = context.storage.store("mcp", {
    initial: { open: true },
  })

  const mcpRows = createMemo(() => {
    const list = mcp()
    const rows: McpServer[][] = []
    for (let index = 0; index < list.length; index += 2) {
      rows.push(list.slice(index, index + 2))
    }
    return rows
  })

  const visibleMcpRows = createMemo(() =>
    mcpExpanded() ? mcpRows() : mcpRows().slice(0, MAX_MCP_ROWS),
  )

  const hiddenMcp = createMemo(() =>
    mcpRows()
      .slice(MAX_MCP_ROWS)
      .reduce((total, row) => total + row.length, 0),
  )

  const skills = createMemo(
    () => context.data.location.skill.list({ directory: directory() }) ?? [],
  )

  const [remoteUsedSkills, setRemoteUsedSkills] = createSignal<Set<string>>(new Set())

  const usedSkills = createMemo(() => {
    const messages = context.data.session.message.list(props.sessionID)
    const boundary = session()?.revert?.messageID
    const boundaryIndex = boundary ? messages.findIndex((message) => message.id === boundary) : -1
    if (boundary && boundaryIndex === -1) return new Set<string>(remoteUsedSkills())
    const end = boundaryIndex === -1 ? messages.length : boundaryIndex

    let start = 0
    for (let index = end - 1; index >= 0; index--) {
      const message = messages[index]
      if (message?.type === "compaction" && message.status === "completed") {
        start = index + 1
        break
      }
    }

    const used = new Set<string>(remoteUsedSkills())
    collectUsedSkills(messages.slice(start, end), used)
    return used
  })

  let usedSkillsRequest = 0

  const refreshUsedSkills = async () => {
    const request = ++usedSkillsRequest
    const sessionID = props.sessionID
    try {
      const response = await context.client.session.context({ sessionID })
      if (request !== usedSkillsRequest) return
      const used = new Set<string>()
      collectUsedSkills(response.data, used)
      setRemoteUsedSkills(used)
    } catch {
      // Keep the locally scanned set when the context cannot be fetched.
    }
  }

  createEffect(() => {
    props.sessionID
    setRemoteUsedSkills(new Set<string>())
    void refreshUsedSkills()
  })

  const [skillsExpanded, setSkillsExpanded] = createSignal(false)
  const [skillsMoreHovered, setSkillsMoreHovered] = createSignal(false)
  const [skillsView, updateSkillsView] = context.storage.store("skills", {
    initial: { open: true },
  })

  const skillRows = createMemo(() => {
    const used = usedSkills()
    const list = [...skills()].sort((left, right) => {
      const leftUsed = used.has(left.id) || used.has(left.name) ? 0 : 1
      const rightUsed = used.has(right.id) || used.has(right.name) ? 0 : 1
      return leftUsed - rightUsed || left.name.localeCompare(right.name)
    })
    const rows: SkillInfo[][] = []
    for (let index = 0; index < list.length; index += 2) {
      rows.push(list.slice(index, index + 2))
    }
    return rows
  })

  const visibleSkillRows = createMemo(() =>
    skillsExpanded() ? skillRows() : skillRows().slice(0, MAX_SKILL_ROWS),
  )

  const hiddenSkills = createMemo(() =>
    skillRows()
      .slice(MAX_SKILL_ROWS)
      .reduce((total, row) => total + row.length, 0),
  )

  const [changes, setChanges] = createSignal<VcsFileStatus[]>([])
  const [hovered, setHovered] = createSignal<string | undefined>()
  const [hoveredFile, setHoveredFile] = createSignal<string | undefined>()
  const [expanded, setExpanded] = createSignal(false)
  const [moreHovered, setMoreHovered] = createSignal(false)
  const [changesView, updateChangesView] = context.storage.store("changes", {
    initial: { open: true },
  })

  const [subagentTokens, setSubagentTokens] = createSignal<Record<string, number | undefined>>({})
  let subagentRefresh = 0

  const refreshSubagentTokens = async () => {
    const items = subagents()
    if (items.length === 0) return
    const sequence = ++subagentRefresh
    const entries = await Promise.all(
      items.map(async (item) => {
        try {
          await context.data.session.message.sync(item.id)
          const info = context.data.session.get(item.id)
          const messages = context.data.session.message.list(item.id)
          const last = lastAssistantWithUsage(messages, info?.revert?.messageID)
          const tokens = last?.tokens ? usedTokens(last.tokens) : undefined
          return [item.id, tokens && tokens > 0 ? tokens : undefined] as const
        } catch {
          return [item.id, undefined] as const
        }
      }),
    )
    if (sequence !== subagentRefresh) return
    setSubagentTokens(Object.fromEntries(entries))
  }

  createEffect(() => {
    if (subagents().length === 0) return
    void refreshSubagentTokens()
  })

  const visibleChanges = createMemo(() =>
    expanded() ? changes() : changes().slice(0, MAX_CHANGES),
  )

  const [git, setGit] = createSignal<GitState>()
  const [commitLimit, setCommitLimit] = createSignal(MAX_COMMITS)
  const [gitMoreHovered, setGitMoreHovered] = createSignal(false)
  const [gitLessHovered, setGitLessHovered] = createSignal(false)
  const [gitView, updateGitView] = context.storage.store("git", {
    initial: { open: true },
  })

  let gitRequest = 0

  const refreshGit = async () => {
    const request = ++gitRequest
    const state = await loadGit(directory(), commitLimit())
    if (request !== gitRequest) return
    setGit(state)
  }

  createEffect(() => {
    props.sessionID
    setCommitLimit(MAX_COMMITS)
  })

  createEffect(() => {
    directory()
    commitLimit()
    void refreshGit()
  })

  onMount(() => {
    let disposed = false
    let refreshing = false
    let debounce: ReturnType<typeof setTimeout> | undefined

    const refresh = async () => {
      if (refreshing) return
      refreshing = true
      try {
        const result = await context.client.vcs.status({
          location: { directory: directory() },
        })
        if (!disposed) setChanges(result.data)
      } catch {
        if (!disposed) setChanges([])
      } finally {
        refreshing = false
      }
    }

    const schedule = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        debounce = undefined
        void refresh()
        void refreshGit()
      }, 400)
    }

    void refresh()
    void refreshGit()
    void context.data.location.model.sync({ directory: directory() })
    void context.data.location.mcp.server.sync({ directory: directory() })
    void context.data.location.skill.sync({ directory: directory() })

    const stopFiles = context.data.on("filesystem.changed", (event) => {
      if (event.location?.directory && event.location.directory !== directory()) return
      schedule()
    })
    const stopBranch = context.data.on("vcs.branch.updated", schedule)
    const stopMcp = context.data.on("mcp.status.changed", () => {
      void context.data.location.mcp.server.sync({ directory: directory() })
    })
    const stopUsage = context.data.on("session.usage.updated", (event) => {
      if (!subagents().some((item) => item.id === event.data.sessionID)) return
      void refreshSubagentTokens()
    })
    const stopSkill = context.data.on("session.skill.activated", (event) => {
      if (event.data.sessionID !== props.sessionID) return
      setRemoteUsedSkills(
        (current) => new Set([...current, event.data.id, event.data.name]),
      )
    })
    const stopCompaction = context.data.on("session.compaction.ended", (event) => {
      if (event.data.sessionID !== props.sessionID) return
      void refreshUsedSkills()
    })
    const interval = setInterval(() => {
      void refresh()
      void refreshGit()
    }, 15_000)

    onCleanup(() => {
      disposed = true
      stopFiles()
      stopBranch()
      stopMcp()
      stopUsage()
      stopSkill()
      stopCompaction()
      clearInterval(interval)
      if (debounce) clearTimeout(debounce)
    })
  })

  const statusLetter = (status: VcsFileStatus["status"]) =>
    status === "added" ? "A" : status === "deleted" ? "D" : "M"

  const statusColor = (status: VcsFileStatus["status"]) =>
    status === "added"
      ? theme.text.feedback.success.base
      : status === "deleted"
        ? theme.text.feedback.error.base
        : theme.text.feedback.warning.base

  const openFile = async (file: string) => {
    const directory = session()?.location.directory ?? context.data.location.default().directory
    const absolute = `${directory}/${file}`
    const editor = process.env.VISUAL || process.env.EDITOR

    if (!editor) {
      const [command, args]: [string, string[]] =
        process.platform === "darwin"
          ? ["open", [absolute]]
          : process.platform === "win32"
            ? ["cmd", ["/c", "start", "", absolute]]
            : ["xdg-open", [absolute]]
      spawn(command, args, { cwd: directory, detached: true, stdio: "ignore" }).unref()
      return
    }

    const parts = editor.split(/\s+/).filter(Boolean)
    const command = parts[0]
    if (!command) return
    const executable = command.split("/").pop() ?? command

    if (GUI_EDITORS.has(executable)) {
      spawn(command, [...parts.slice(1), absolute], {
        cwd: directory,
        detached: true,
        stdio: "ignore",
      }).unref()
      return
    }

    await context.renderer.suspend()
    try {
      await new Promise<void>((resolve) => {
        const child = spawn(command, [...parts.slice(1), absolute], {
          cwd: directory,
          stdio: "inherit",
          shell: process.platform === "win32",
        })
        child.on("error", () => resolve())
        child.on("exit", () => resolve())
      })
    } finally {
      await context.renderer.resume()
    }
  }

  const mcpColor = (server: McpServer) => {
    if (server.status.status === "connected") return theme.text.feedback.success.base
    if (server.status.status === "failed") return theme.text.feedback.error.base
    if (server.status.status === "needs_auth") return theme.text.feedback.warning.base
    return theme.text.muted
  }

  const contextColor = (percent: number) =>
    percent >= 90
      ? theme.text.feedback.error.base
      : percent >= 70
        ? theme.text.feedback.warning.base
        : theme.text.feedback.success.base

  return (
    <box flexDirection="column" gap={1} width="100%">
      <Show when={modelLine() || usage() || cost() > 0}>
        <box flexDirection="column" width="100%">
          <Show when={modelLine()}>
            <text fg={theme.text.muted} wrapMode="none" truncate>
              {modelLine()}
            </text>
          </Show>
          <Show when={usage() || cost() > 0}>
            <text fg={theme.text.muted} wrapMode="none" truncate>
              {contextLine()}
            </text>
            <Show when={contextPercent() !== undefined}>
              <box width="100%" height={1} backgroundColor={theme.background.raised.high}>
                <box
                  width={`${contextPercent() ?? 0}%`}
                  height={1}
                  backgroundColor={contextColor(contextPercent() ?? 0)}
                />
              </box>
            </Show>
          </Show>
        </box>
      </Show>

      <Show when={subagents().length > 0}>
        <box>
          <box flexDirection="row" gap={1}>
            <text fg={theme.text.base}>
              <b>Subagents</b>
            </text>
            <text fg={theme.text.muted}>{subagents().length}</text>
          </box>
          <For each={subagents()}>
            {(item) => (
              <box
                flexDirection="row"
                minWidth={0}
                backgroundColor={hovered() === item.id ? theme.background.raised.high : undefined}
                onMouseDown={() =>
                  context.ui.router.navigate({ type: "session", sessionID: item.id })
                }
                onMouseOver={() => setHovered(item.id)}
                onMouseOut={() => setHovered(undefined)}
              >
                <text fg={theme.text.feedback.warning.base} flexShrink={0}>
                  ●{" "}
                </text>
                <text
                  fg={theme.text.base}
                  wrapMode="none"
                  truncate
                  flexShrink={1}
                  minWidth={0}
                >
                  {item.info?.title ?? item.id}
                </text>
                <Show when={subagentTokens()[item.id]}>
                  {(value) => (
                    <text fg={theme.text.muted} flexShrink={0} wrapMode="none">
                      {" "}
                      ({shortTokens(value())})
                    </text>
                  )}
                </Show>
              </box>
            )}
          </For>
        </box>
      </Show>

      <Show when={changes().length > 0}>
        <box>
          <box
            flexDirection="row"
            justifyContent="space-between"
            gap={1}
            onMouseDown={() => {
              void updateChangesView((draft) => {
                draft.open = !draft.open
              }).catch(() => {})
            }}
          >
            <box flexDirection="row" gap={1}>
              <text fg={theme.text.base}>{changesView.open ? "▼" : "▶"}</text>
              <text fg={theme.text.base}>
                <b>Changes</b>
              </text>
            </box>
            <text fg={theme.text.muted}>{changes().length}</text>
          </box>
          <Show when={changesView.open}>
            <For each={visibleChanges()}>
              {(file) => {
                const parts = splitFile(file.file)
                return (
                  <box
                    flexDirection="row"
                    gap={1}
                    minWidth={0}
                    backgroundColor={
                      hoveredFile() === file.file ? theme.background.raised.high : undefined
                    }
                    onMouseOver={() => setHoveredFile(file.file)}
                    onMouseOut={() => setHoveredFile(undefined)}
                    onMouseDown={(event: TuiMouseEvent) => {
                      const modifier = event.modifiers.ctrl
                      if (event.button !== 2 && !(event.button === 0 && modifier)) return
                      event.preventDefault()
                      event.stopPropagation()
                      void openFile(file.file)
                    }}
                  >
                    <text fg={theme.text.feedback.info.base} width={2} flexShrink={0}>
                      {fileTag(file.file)}
                    </text>
                    <text fg={theme.text.base} flexShrink={0} wrapMode="none" truncate>
                      {parts.name}
                    </text>
                    <text
                      fg={theme.text.faint}
                      flexGrow={1}
                      flexShrink={1}
                      minWidth={0}
                      wrapMode="none"
                      truncate
                    >
                      {parts.dir}
                    </text>
                    <text fg={statusColor(file.status)} flexShrink={0} wrapMode="none">
                      {statusLetter(file.status)}
                    </text>
                  </box>
                )
              }}
            </For>
            <Show when={changes().length > MAX_CHANGES}>
              <box
                flexDirection="row"
                onMouseDown={() => setExpanded((value) => !value)}
                onMouseOver={() => setMoreHovered(true)}
                onMouseOut={() => setMoreHovered(false)}
              >
                <text fg={moreHovered() ? theme.text.base : theme.text.feedback.info.base}>
                  {expanded() ? "− show less" : `+${changes().length - MAX_CHANGES} more`}
                </text>
              </box>
            </Show>
          </Show>
        </box>
      </Show>

      <Show when={git()}>
        {(state) => (
          <box>
            <box
              flexDirection="row"
              justifyContent="space-between"
              gap={1}
              onMouseDown={() => {
                void updateGitView((draft) => {
                  draft.open = !draft.open
                }).catch(() => {})
              }}
            >
              <box flexDirection="row" gap={1} minWidth={0}>
                <text fg={theme.text.base} flexShrink={0}>
                  {gitView.open ? "▼" : "▶"}
                </text>
                <text fg={theme.text.base} flexShrink={0}>
                  <b>Git</b>
                </text>
                <text
                  fg={theme.text.feedback.info.base}
                  wrapMode="none"
                  truncate
                  flexShrink={1}
                  minWidth={0}
                >
                  {state().branch}
                </text>
              </box>
            </box>
            <Show when={gitView.open}>
              <For each={state().commits.slice(0, commitLimit())}>
                {(commit) => (
                  <box flexDirection="row" gap={1} minWidth={0}>
                    <text
                      fg={
                        commit.pushed
                          ? theme.text.faint
                          : theme.text.feedback.success.base
                      }
                      flexShrink={0}
                    >
                      {commit.pushed ? "○" : "●"}
                    </text>
                    <text
                      fg={theme.text.base}
                      wrapMode="none"
                      truncate
                      flexShrink={1}
                      minWidth={0}
                    >
                      {commit.subject}
                    </text>
                  </box>
                )}
              </For>
              <Show when={state().hasMore || commitLimit() > MAX_COMMITS}>
                <box flexDirection="row" gap={2}>
                  <Show when={state().hasMore}>
                    <box
                      flexDirection="row"
                      onMouseDown={() =>
                        setCommitLimit((value) => value + COMMIT_STEP)
                      }
                      onMouseOver={() => setGitMoreHovered(true)}
                      onMouseOut={() => setGitMoreHovered(false)}
                    >
                      <text
                        fg={
                          gitMoreHovered()
                            ? theme.text.base
                            : theme.text.feedback.info.base
                        }
                      >
                        +{COMMIT_STEP} more
                      </text>
                    </box>
                  </Show>
                  <Show when={commitLimit() > MAX_COMMITS}>
                    <box
                      flexDirection="row"
                      onMouseDown={() => setCommitLimit(MAX_COMMITS)}
                      onMouseOver={() => setGitLessHovered(true)}
                      onMouseOut={() => setGitLessHovered(false)}
                    >
                      <text
                        fg={
                          gitLessHovered()
                            ? theme.text.base
                            : theme.text.feedback.info.base
                        }
                      >
                        − show less
                      </text>
                    </box>
                  </Show>
                </box>
              </Show>
            </Show>
          </box>
        )}
      </Show>

      <Show when={mcp().length > 0}>
        <box>
          <box
            flexDirection="row"
            justifyContent="space-between"
            gap={1}
            onMouseDown={() => {
              void updateMcpView((draft) => {
                draft.open = !draft.open
              }).catch(() => {})
            }}
          >
            <box flexDirection="row" gap={1}>
              <text fg={theme.text.base}>{mcpView.open ? "▼" : "▶"}</text>
              <text fg={theme.text.base}>
                <b>MCP</b>
              </text>
            </box>
            <text fg={theme.text.muted}>{mcp().length}</text>
          </box>
          <Show when={mcpView.open}>
            <For each={visibleMcpRows()}>
              {(row) => (
                <box flexDirection="row" gap={1}>
                  <For each={row}>
                    {(server) => (
                      <box flexDirection="row" gap={1} flexGrow={1} flexBasis={0} minWidth={0}>
                        <text fg={mcpColor(server)} flexShrink={0}>
                          ●
                        </text>
                        <text
                          fg={theme.text.base}
                          wrapMode="none"
                          truncate
                          flexShrink={1}
                          minWidth={0}
                        >
                          {server.name}
                        </text>
                      </box>
                    )}
                  </For>
                  <Show when={row.length === 1}>
                    <box flexGrow={1} flexBasis={0} />
                  </Show>
                </box>
              )}
            </For>
            <Show when={mcpRows().length > MAX_MCP_ROWS}>
              <box
                flexDirection="row"
                onMouseDown={() => setMcpExpanded((value) => !value)}
                onMouseOver={() => setMcpMoreHovered(true)}
                onMouseOut={() => setMcpMoreHovered(false)}
              >
                <text
                  fg={mcpMoreHovered() ? theme.text.base : theme.text.feedback.info.base}
                >
                  {mcpExpanded() ? "− show less" : `+${hiddenMcp()} more`}
                </text>
              </box>
            </Show>
          </Show>
        </box>
      </Show>

      <Show when={skills().length > 0}>
        <box>
          <box
            flexDirection="row"
            justifyContent="space-between"
            gap={1}
            onMouseDown={() => {
              void updateSkillsView((draft) => {
                draft.open = !draft.open
              }).catch(() => {})
            }}
          >
            <box flexDirection="row" gap={1}>
              <text fg={theme.text.base}>{skillsView.open ? "▼" : "▶"}</text>
              <text fg={theme.text.base}>
                <b>Skills</b>
              </text>
            </box>
            <text fg={theme.text.muted}>{skills().length}</text>
          </box>
          <Show when={skillsView.open}>
            <For each={visibleSkillRows()}>
              {(row) => (
                <box flexDirection="row" gap={1}>
                  <For each={row}>
                    {(skill) => {
                      const used = () =>
                        usedSkills().has(skill.id) || usedSkills().has(skill.name)
                      return (
                        <box flexDirection="row" gap={1} flexGrow={1} flexBasis={0} minWidth={0}>
                          <text
                            fg={used() ? theme.text.feedback.success.base : theme.text.base}
                            flexShrink={0}
                          >
                            {used() ? "●" : "○"}
                          </text>
                          <text
                            fg={theme.text.base}
                            wrapMode="none"
                            truncate
                            flexShrink={1}
                            minWidth={0}
                          >
                            {skill.name}
                          </text>
                        </box>
                      )
                    }}
                  </For>
                  <Show when={row.length === 1}>
                    <box flexGrow={1} flexBasis={0} />
                  </Show>
                </box>
              )}
            </For>
            <Show when={skillRows().length > MAX_SKILL_ROWS}>
              <box
                flexDirection="row"
                onMouseDown={() => setSkillsExpanded((value) => !value)}
                onMouseOver={() => setSkillsMoreHovered(true)}
                onMouseOut={() => setSkillsMoreHovered(false)}
              >
                <text
                  fg={
                    skillsMoreHovered() ? theme.text.base : theme.text.feedback.info.base
                  }
                >
                  {skillsExpanded() ? "− show less" : `+${hiddenSkills()} more`}
                </text>
              </box>
            </Show>
          </Show>
        </box>
      </Show>
    </box>
  )
}

export default Plugin.define({
  id: "sidebar.plus",
  setup(context) {
    return context.ui.slot({
      append: "sidebar.content",
      render: ({ sessionID }) => <Sidebar sessionID={sessionID} />,
    })
  },
})

