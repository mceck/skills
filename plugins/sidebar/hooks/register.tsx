import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type {
  ChangeRow,
  ChangesInfo,
  CommitRow,
  ContextInfo,
  GitInfo,
  McpInfo,
  Sections,
  SkillsInfo,
} from '../types'

const PLUGIN = 'sidebar'
const PANE_BASE = 'sidebar'
// Bump this to test a new default width: a fresh pane id has no remembered
// size, so `columns` applies again. Also closes the previous pane.
const PANE_VERSION = 2
const PANE = `${PANE_BASE}-${PANE_VERSION}`

const CHANGES_LIMIT = 10
const GIT_STEP = 10
const PANE_COLUMNS = 40

const titleAtom = atom({ plugin: 'sidebar', key: 'title' } as const, 'Chat', {
  shape: 'title-1',
})

const contextAtom = atom(
  { plugin: 'sidebar', key: 'context' } as const,
  { tokens: null, percent: null, usd: null } as ContextInfo,
  { shape: 'context-1' },
)

const changesAtom = atom(
  { plugin: 'sidebar', key: 'changes' } as const,
  { rows: [], isExpanded: false } as ChangesInfo,
  { shape: 'changes-1' },
)

const gitAtom = atom(
  { plugin: 'sidebar', key: 'git' } as const,
  { isRepo: true, branch: '', commits: [], visible: GIT_STEP } as GitInfo,
  { shape: 'git-1' },
)

const mcpAtom = atom(
  { plugin: 'sidebar', key: 'mcp' } as const,
  { rows: [], isExpanded: false } as McpInfo,
  { shape: 'mcp-1' },
)

const skillsAtom = atom(
  { plugin: 'sidebar', key: 'skills' } as const,
  { names: [], total: 0, isExpanded: false } as SkillsInfo,
  { shape: 'skills-1' },
)

const usedSkillsAtom = atom(
  { plugin: 'sidebar', key: 'usedSkills' } as const,
  [] as string[],
  { shape: 'used-skills-1' },
)

const sectionsAtom = atom(
  { plugin: 'sidebar', key: 'sections' } as const,
  { changes: true, git: true, mcp: true, skills: true } as Sections,
  { shape: 'sections-1' },
)

let timer: { cancel: () => void } | null = null
let isRefreshingGit = false
let isRefreshingUsage = false
let hasSessionTitle = false
let repoRoot = ''

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return `${tokens}`
}

function parseStatus(raw: string): ChangeRow[] {
  const tokens = raw.split('\0')
  const rows: ChangeRow[] = []

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (!token || token.length < 4) continue

    const code = token.slice(0, 2)
    const path = token.slice(3)
    rows.push({ code: code.trim() || '?', path })

    // A rename or copy carries its original path as the next field.
    if (code.includes('R') || code.includes('C')) i += 1
    if (rows.length >= 200) break
  }

  return rows
}

function parseLog(raw: string): CommitRow[] {
  const commits: CommitRow[] = []

  for (const record of raw.split('\x1e')) {
    const line = record.trim()
    if (!line) continue

    const [short, hash, subject] = line.split('\x1f')
    if (!hash) continue

    commits.push({
      short: short || hash.slice(0, 7),
      hash,
      subject: subject || '',
      isPushed: false,
    })
  }

  return commits
}

async function refreshUsage($: any): Promise<void> {
  if (isRefreshingUsage) return
  isRefreshingUsage = true

  try {
    const usage = await $.session.usage({ breakdown: 'summary', columns: 80 })
    const context = usage.context

    await update($, contextAtom, () => ({
      tokens: context.tokens ?? null,
      percent: context.percent ?? null,
      usd: usage.cost?.usd ?? null,
    }))

    const breakdown = context.breakdown
    if (!breakdown) return

    const servers = new Map<string, { tools: number; loaded: number }>()
    for (const tool of breakdown.mcpTools) {
      const entry = servers.get(tool.serverName) ?? { tools: 0, loaded: 0 }
      entry.tools += 1
      if (tool.isLoaded) entry.loaded += 1
      servers.set(tool.serverName, entry)
    }

    await update($, mcpAtom, state => ({
      ...state,
      rows: [...servers.entries()].map(([name, entry]) => ({
        name,
        isLoaded: entry.loaded > 0,
        tools: entry.tools,
      })),
    }))

    if (breakdown.skills) {
      const names = breakdown.skills.skillFrontmatter.map(skill => skill.name)
      const total = breakdown.skills.totalSkills
      await update($, skillsAtom, state => ({ ...state, names, total }))
    }
  } catch {
    // A session not bound yet, or a breakdown the engine could not make.
  } finally {
    isRefreshingUsage = false
  }
}

async function refreshGit($: any): Promise<void> {
  if (isRefreshingGit) return
  isRefreshingGit = true

  try {
    const status = await $.process.run(
      ['git', 'status', '--porcelain=v1', '-z', '--untracked-files=all'],
      { timeoutMs: 8000 },
    )

    if (status.exitCode !== 0) {
      await update($, gitAtom, state => ({
        ...state,
        isRepo: false,
        branch: '',
        commits: [],
      }))
      await update($, changesAtom, state => ({ ...state, rows: [] }))
      return
    }

    const rows = parseStatus(status.stdout)

    const branchResult = await $.process.run(
      ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
      { timeoutMs: 8000 },
    )
    const branch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : ''

    const rootResult = await $.process.run(['git', 'rev-parse', '--show-toplevel'], {
      timeoutMs: 8000,
    })
    if (rootResult.exitCode === 0) repoRoot = rootResult.stdout.trim()

    const logResult = await $.process.run(
      ['git', 'log', '-n', '100', '--format=%h%x1f%H%x1f%s%x1e'],
      { timeoutMs: 8000 },
    )
    const commits = parseLog(logResult.exitCode === 0 ? logResult.stdout : '')

    const upstream = await $.process.run(
      ['git', 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
      { timeoutMs: 8000 },
    )

    let unpushed: Set<string> | null = null
    if (upstream.exitCode === 0 && upstream.stdout.trim()) {
      const log = await $.process.run(['git', 'log', '--format=%H', '@{u}..HEAD'], {
        timeoutMs: 8000,
      })
      if (log.exitCode === 0) {
        unpushed = new Set(
          log.stdout
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean),
        )
      }
    }

    const withPush = commits.map(commit => ({
      ...commit,
      isPushed: unpushed ? !unpushed.has(commit.hash) : false,
    }))

    await update($, changesAtom, state => ({ ...state, rows }))
    await update($, gitAtom, state => ({
      ...state,
      isRepo: true,
      branch,
      commits: withPush,
    }))
  } catch {
    await update($, gitAtom, state => ({ ...state, isRepo: false }))
  } finally {
    isRefreshingGit = false
  }
}

function refreshAll($: any): void {
  void refreshGit($)
  void refreshUsage($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: PLUGIN,
      description: 'Sidebar: context, changes, git, MCP e skills',
    })

    for (const open of await $.ui.panes()) {
      if (open.id !== PANE && open.id.startsWith(`${PANE_BASE}-`)) {
        await $.ui.close({ id: open.id }).catch(() => {})
      }
    }

    void $.ui.open({ id: PANE, title: 'Sidebar', columns: PANE_COLUMNS })

    const started = await next(e)
    refreshAll($)

    timer?.cancel()
    timer = $.clock.every(5000, () => refreshAll($))

    return started
  })

  on('command.run', { command: PLUGIN }, async $ => {
    const panes = await $.ui.panes()
    const pane = panes.find(open => open.id === PANE)

    if (pane?.isPlaced) {
      await $.ui.close({ id: PANE })
      return { text: 'Sidebar chiusa.' }
    }

    const opened = await $.ui.open({
      id: PANE,
      title: 'Sidebar',
      columns: PANE_COLUMNS,
    })
    return {
      text: opened.isPlaced
        ? 'Sidebar aperta.'
        : `Sidebar non mostrata: ${opened.reason}`,
    }
  }).catch(() => ({ text: 'Sidebar: errore imprevisto.' }))

  on('session.measure', async ($, e, next) => {
    await update($, contextAtom, () => ({
      tokens: e.context.tokens ?? null,
      percent: e.context.percent ?? null,
      usd: e.cost?.usd ?? null,
    }))
    void refreshUsage($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    void refreshGit($)
    return next(e)
  })

  on('skill.prompt', async ($, e, next) => {
    const name = e.skill
    await update($, usedSkillsAtom, list =>
      list.includes(name) ? list : [...list, name],
    )
    return next(e)
  })

  on('ui.message', { element: 'changes-list' }, async ($, e, next) => {
    const data = e.data as { open?: unknown } | null
    if (data && typeof data.open === 'string' && data.open) {
      void $.process
        .run(['open', data.open], {
          cwd: repoRoot || undefined,
          timeoutMs: 10000,
        })
        .then(result => {
          if (result.exitCode !== 0) void $.ui.toast('Impossibile aprire il file')
        })
        .catch(() => {
          void $.ui.toast('open non disponibile')
        })
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!hasSessionTitle && !e.command && e.text.trim()) {
      const short = e.text.trim().replace(/\s+/g, ' ').slice(0, 60)
      await update($, titleAtom, current => (current === 'Chat' ? short : current))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.SessionStart', async ($, e, next) => {
    if (e.session_title) {
      hasSessionTitle = true
      await update($, titleAtom, () => e.session_title as string)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.UserPromptSubmit', async ($, e, next) => {
    if (e.session_title) {
      hasSessionTitle = true
      await update($, titleAtom, () => e.session_title as string)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Client } = $.ui.resolve(e)

    const [title, context, changes, git, mcp, skills, used, sections] =
      await Promise.all([
        read($, titleAtom),
        read($, contextAtom),
        read($, changesAtom),
        read($, gitAtom),
        read($, mcpAtom),
        read($, skillsAtom),
        read($, usedSkillsAtom),
        read($, sectionsAtom),
      ])

    const width = Math.max(12, e.props.bodyColumns - 2)
    const gridColumns = width >= 34 ? 2 : 1
    const cellWidth =
      gridColumns === 1 ? width : Math.floor((width - 1) / gridColumns)
    const gridLimit = 3 * gridColumns
    const usedSet = new Set(used)

    const filledCells = Math.max(
      0,
      Math.min(width, Math.round(((context.percent ?? 0) / 100) * width)),
    )
    const emptyCells = Math.max(0, width - filledCells)

    const contextTokens =
      context.tokens === null ? '—' : formatTokens(context.tokens)
    const contextCost =
      context.usd === null ? '' : ` $${context.usd.toFixed(2)}`
    const contextLine = `Context: ${contextTokens} tokens${contextCost}`

    const hint =
      changes.rows.length > 0
        ? 'alt+click apre il file · ctrl+x tab per interagire'
        : 'ctrl+x tab per interagire'

    const toggle = (key: keyof Sections) => () => {
      void update($, sectionsAtom, state => ({
        ...state,
        [key]: !state[key],
      }))
    }

    const grid = (
      items: Array<{ key: string; isOn: boolean; label: string }>,
      prefix: string,
    ) => {
      const out = []

      for (let i = 0; i < items.length; i += gridColumns) {
        const cells = []

        for (let j = 0; j < gridColumns; j += 1) {
          const item = items[i + j]
          if (!item) continue

          cells.push(
            <Box
              key={`${prefix}-${i}-${j}`}
              width={cellWidth}
              flexDirection="row"
            >
              <Text color={item.isOn ? 'success' : 'inactive'}>
                {item.isOn ? '●' : '○'}
              </Text>
              <Text dimColor={!item.isOn} wrap="truncate-end">
                {' '}
                {item.label}
              </Text>
            </Box>,
          )
        }

        out.push(
          <Box key={`${prefix}-${i}`} flexDirection="row">
            {cells}
          </Box>,
        )
      }

      return out
    }

    const mcpItems = mcp.rows.map(row => ({
      key: row.name,
      isOn: row.isLoaded,
      label: row.name,
    }))
    const mcpShown = mcp.isExpanded ? mcpItems : mcpItems.slice(0, gridLimit)

    const skillItems = skills.names
      .map(name => ({ key: name, isOn: usedSet.has(name), label: name }))
      .sort((a, b) => Number(b.isOn) - Number(a.isOn))
    const skillShown = skills.isExpanded
      ? skillItems
      : skillItems.slice(0, gridLimit)

    const changeShown = changes.isExpanded
      ? changes.rows
      : changes.rows.slice(0, CHANGES_LIMIT)

    const commitShown = git.commits.slice(0, git.visible)
    const skillCount = skills.total || skills.names.length

    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold wrap="truncate-end">
          {title || 'Chat'}
        </Text>

        <Text dimColor>{contextLine}</Text>

        <Box flexDirection="row">
          {filledCells > 0 ? (
            <Text color="success">{'█'.repeat(filledCells)}</Text>
          ) : null}
          {emptyCells > 0 ? (
            <Text color="#2b2b2b">{'█'.repeat(emptyCells)}</Text>
          ) : null}
        </Box>

        <Text> </Text>

        <Box flexDirection="row">
          <Button key="h-changes" plain onPress={toggle('changes')}>
            {`${sections.changes ? '▼' : '▶'} Changes`}
          </Button>
          <Box flexGrow={1} />
          <Text dimColor>{changes.rows.length}</Text>
        </Box>
        {sections.changes
          ? changes.rows.length === 0
            ? (
                <Text dimColor>Clean</Text>
              )
            : [
                <Client
                  key="changes-list"
                  module="./changes-list.tsx"
                  props={{ rows: changeShown }}
                  width={width}
                  height={Math.max(1, changeShown.length)}
                />,
                changes.rows.length > CHANGES_LIMIT ? (
                  <Button
                    key="changes-more"
                    plain
                    onPress={() => {
                      void update($, changesAtom, state => ({
                        ...state,
                        isExpanded: !state.isExpanded,
                      }))
                    }}
                  >
                    <Text color="suggestion">
                      {changes.isExpanded
                        ? 'show less'
                        : `+${changes.rows.length - CHANGES_LIMIT} more`}
                    </Text>
                  </Button>
                ) : null,
              ]
          : null}

        <Text> </Text>

        <Box flexDirection="row">
          <Button key="h-git" plain onPress={toggle('git')}>
            {`${sections.git ? '▼' : '▶'} Git`}
            {git.branch ? <Text dimColor> {git.branch}</Text> : null}
          </Button>
        </Box>
        {sections.git
          ? !git.isRepo
            ? (
                <Text dimColor>Not a git repository</Text>
              )
            : git.commits.length === 0
              ? (
                  <Text dimColor>No commits</Text>
                )
              : [
                  ...commitShown.map((commit, index) => (
                    <Box key={`c-${index}`} flexDirection="row">
                      <Text color={commit.isPushed ? 'inactive' : 'success'}>
                        {commit.isPushed ? '○ ' : '● '}
                      </Text>
                      <Text wrap="truncate-end">{commit.subject}</Text>
                    </Box>
                  )),
                  git.visible < git.commits.length ? (
                    <Button
                      key="git-more"
                      plain
                      onPress={() => {
                        void update($, gitAtom, state => ({
                          ...state,
                          visible: state.visible + GIT_STEP,
                        }))
                      }}
                    >
                      <Text color="suggestion">
                        +{Math.min(GIT_STEP, git.commits.length - git.visible)} more
                      </Text>
                    </Button>
                  ) : null,
                  git.visible > GIT_STEP ? (
                    <Button
                      key="git-less"
                      plain
                      onPress={() => {
                        void update($, gitAtom, state => ({
                          ...state,
                          visible: GIT_STEP,
                        }))
                      }}
                    >
                      <Text color="suggestion">show less</Text>
                    </Button>
                  ) : null,
                ]
          : null}

        <Text> </Text>

        <Box flexDirection="row">
          <Button key="h-mcp" plain onPress={toggle('mcp')}>
            {`${sections.mcp ? '▼' : '▶'} MCP`}
          </Button>
          <Box flexGrow={1} />
          <Text dimColor>{mcp.rows.length}</Text>
        </Box>
        {sections.mcp
          ? mcpItems.length === 0
            ? (
                <Text dimColor>No MCP servers</Text>
              )
            : [
                ...grid(mcpShown, 'mcp'),
                mcpItems.length > gridLimit ? (
                  <Button
                    key="mcp-more"
                    plain
                    onPress={() => {
                      void update($, mcpAtom, state => ({
                        ...state,
                        isExpanded: !state.isExpanded,
                      }))
                    }}
                  >
                    <Text color="suggestion">
                      {mcp.isExpanded
                        ? 'show less'
                        : `+${mcpItems.length - gridLimit} more`}
                    </Text>
                  </Button>
                ) : null,
              ]
          : null}

        <Text> </Text>

        <Box flexDirection="row">
          <Button key="h-skills" plain onPress={toggle('skills')}>
            {`${sections.skills ? '▼' : '▶'} Skills`}
          </Button>
          <Box flexGrow={1} />
          <Text dimColor>{skillCount}</Text>
        </Box>
        {sections.skills
          ? skillItems.length === 0
            ? (
                <Text dimColor>No skills</Text>
              )
            : [
                ...grid(skillShown, 'skill'),
                skillItems.length > gridLimit ? (
                  <Button
                    key="skills-more"
                    plain
                    onPress={() => {
                      void update($, skillsAtom, state => ({
                        ...state,
                        isExpanded: !state.isExpanded,
                      }))
                    }}
                  >
                    <Text color="suggestion">
                      {skills.isExpanded
                        ? 'show less'
                        : `+${skillItems.length - gridLimit} more`}
                    </Text>
                  </Button>
                ) : null,
              ]
          : null}

        {e.props.isFocused ? null : (
          <>
            <Text> </Text>
            <Text dimColor>{hint}</Text>
          </>
        )}
      </Box>
    )
  })
}
