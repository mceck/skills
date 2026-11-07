import { jsx, jsxs } from "@opentui/solid/jsx-runtime";
import { Plugin, usePlugin } from "@opencode/plugin/tui";
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const MAX_CHANGES = 12;
const MAX_SKILL_ROWS = 3;
const MAX_MCP_ROWS = 3;
const MAX_COMMITS = 10;
const COMMIT_STEP = 10;
function debug(...args) {
  try {
    appendFileSync(
      "/private/var/folders/wl/w51s1qts5n1f6kq31bb3w_g00000gn/T/opencode/sidebar-debug.log",
      `${(/* @__PURE__ */ new Date()).toISOString()} ${args.map((value) => typeof value === "string" ? value : JSON.stringify(value)).join(" ")}
`
    );
  } catch {
  }
}
function formatTokens(tokens) {
  if (tokens >= 999950) return `${(tokens / 1e6).toFixed(1)}M`;
  if (tokens >= 1e3) return `${(tokens / 1e3).toFixed(1)}K`;
  return String(tokens);
}
function shortTokens(tokens) {
  return formatTokens(tokens).replace(/\.0([KM])$/, "$1");
}
const GUI_EDITORS = /* @__PURE__ */ new Set([
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
  "zed"
]);
function lastAssistantWithUsage(messages, boundary) {
  const boundaryIndex = boundary ? messages.findIndex((message) => message.id === boundary) : -1;
  if (boundary && boundaryIndex === -1) return void 0;
  const end = boundaryIndex === -1 ? messages.length : boundaryIndex;
  let compactionIndex = -1;
  for (let index = end - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.type === "compaction" && message.status === "completed") {
      compactionIndex = index;
      break;
    }
  }
  for (let index = end - 1; index > compactionIndex; index--) {
    const message = messages[index];
    if (message?.type === "assistant" && message.tokens) return message;
  }
  return void 0;
}
function usedTokens(tokens) {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;
}
function collectUsedSkills(messages, into) {
  for (const message of messages) {
    if (message.type === "skill") {
      into.add(message.skill);
      into.add(message.name);
      continue;
    }
    if (message.type === "user") {
      for (const skill of message.skills ?? []) {
        into.add(skill.id);
        into.add(skill.name);
      }
      continue;
    }
    if (message.type !== "assistant") continue;
    for (const part of message.content) {
      if (part.type !== "tool" || part.name !== "skill") continue;
      const input = part.state.input;
      if (typeof input === "string") {
        const match = input.match(/"(?:id|name)"\s*:\s*"([^"]+)"/);
        if (match?.[1]) into.add(match[1]);
        continue;
      }
      const id = input.id;
      const name = input.name;
      if (typeof id === "string") into.add(id);
      if (typeof name === "string") into.add(name);
    }
  }
}
function splitFile(file) {
  const index = file.lastIndexOf("/");
  if (index < 0) return { name: file, dir: "" };
  return { name: file.slice(index + 1), dir: file.slice(0, index) };
}
const TAGS = {
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
  php: "PH"
};
function fileTag(file) {
  const name = file.slice(file.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "\xB7\xB7";
  const extension = name.slice(dot + 1).toLowerCase();
  return TAGS[extension] ?? extension.slice(0, 2).toUpperCase();
}
function runGit(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `git ${args.join(" ")} exited with ${code}`));
    });
  });
}
async function loadGit(cwd, limit) {
  try {
    let branch = (await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    if (branch === "HEAD") {
      branch = (await runGit(cwd, ["rev-parse", "--short", "HEAD"])).trim();
    }
    if (!branch) return void 0;
    const [log, unpushed] = await Promise.all([
      runGit(cwd, ["log", "-n", String(limit + 1), "--format=%H%x1f%s"]),
      runGit(cwd, ["rev-list", "@{upstream}..HEAD"]).catch(() => void 0)
    ]);
    const ahead = unpushed === void 0 ? void 0 : new Set(unpushed.split("\n").filter(Boolean));
    const commits = log.split("\n").filter(Boolean).map((line) => {
      const separator = line.indexOf("");
      const hash = separator === -1 ? line : line.slice(0, separator);
      return {
        hash,
        subject: separator === -1 ? "" : line.slice(separator + 1),
        pushed: ahead !== void 0 && !ahead.has(hash)
      };
    });
    return { branch, commits, hasMore: commits.length > limit };
  } catch (error) {
    debug("loadGit failed", cwd, String(error));
    return void 0;
  }
}
function Sidebar(props) {
  const context = usePlugin();
  const theme = context.theme;
  const session = createMemo(() => context.data.session.get(props.sessionID));
  const directory = createMemo(() => {
    const value = session()?.location.directory ?? context.location?.directory ?? context.data.location.default().directory;
    debug("directory", value, "sessionLocation", session()?.location, "contextLocation", context.location);
    return value;
  });
  const usage = createMemo(() => {
    const messages = context.data.session.message.list(props.sessionID);
    const last = lastAssistantWithUsage(messages, session()?.revert?.messageID);
    if (!last?.tokens) return;
    const tokens = usedTokens(last.tokens);
    if (tokens <= 0) return;
    const model = context.data.location.model.list({ directory: directory() })?.find(
      (item) => item.providerID === last.model.providerID && item.id === last.model.id
    );
    return {
      tokens,
      percent: model?.limit.context ? Math.round(tokens / model.limit.context * 100) : void 0
    };
  });
  const cost = createMemo(() => context.data.session.cost(props.sessionID));
  const modelLine = createMemo(() => {
    const selected = context.ui.model.current();
    const ref = session()?.model ?? (selected ? {
      id: selected.modelID,
      providerID: selected.providerID,
      variant: selected.variant
    } : void 0);
    if (!ref) return void 0;
    const model = context.data.location.model.list({ directory: directory() })?.find(
      (item) => item.providerID === ref.providerID && (item.id === ref.id || item.modelID === ref.id)
    );
    const name = model?.name ?? ref.id;
    return ref.variant ? `${name} (${ref.variant})` : name;
  });
  const contextLine = createMemo(() => {
    const parts = ["Context:"];
    const value = usage();
    if (value) parts.push(`${formatTokens(value.tokens)} tokens`);
    if (cost() > 0) parts.push(MONEY.format(cost()));
    return parts.join(" ");
  });
  const contextPercent = createMemo(() => {
    const percent = usage()?.percent;
    if (percent === void 0) return void 0;
    return Math.max(0, Math.min(100, percent));
  });
  const subagents = createMemo(() => {
    if (session()?.parentID) return [];
    return context.data.session.family(props.sessionID).filter(
      (id) => id !== props.sessionID && context.data.session.status(id) === "running"
    ).map((id) => ({ id, info: context.data.session.get(id) }));
  });
  const mcp = createMemo(
    () => context.data.location.mcp.server.list({ directory: directory() }) ?? []
  );
  const [mcpExpanded, setMcpExpanded] = createSignal(false);
  const [mcpMoreHovered, setMcpMoreHovered] = createSignal(false);
  const [mcpView, updateMcpView] = context.storage.store("mcp", {
    initial: { open: true }
  });
  const mcpRows = createMemo(() => {
    const list = mcp();
    const rows = [];
    for (let index = 0; index < list.length; index += 2) {
      rows.push(list.slice(index, index + 2));
    }
    return rows;
  });
  const visibleMcpRows = createMemo(
    () => mcpExpanded() ? mcpRows() : mcpRows().slice(0, MAX_MCP_ROWS)
  );
  const hiddenMcp = createMemo(
    () => mcpRows().slice(MAX_MCP_ROWS).reduce((total, row) => total + row.length, 0)
  );
  const skills = createMemo(
    () => context.data.location.skill.list({ directory: directory() }) ?? []
  );
  const [remoteUsedSkills, setRemoteUsedSkills] = createSignal(/* @__PURE__ */ new Set());
  const usedSkills = createMemo(() => {
    const messages = context.data.session.message.list(props.sessionID);
    const boundary = session()?.revert?.messageID;
    const boundaryIndex = boundary ? messages.findIndex((message) => message.id === boundary) : -1;
    if (boundary && boundaryIndex === -1) return new Set(remoteUsedSkills());
    const end = boundaryIndex === -1 ? messages.length : boundaryIndex;
    let start = 0;
    for (let index = end - 1; index >= 0; index--) {
      const message = messages[index];
      if (message?.type === "compaction" && message.status === "completed") {
        start = index + 1;
        break;
      }
    }
    const used = new Set(remoteUsedSkills());
    collectUsedSkills(messages.slice(start, end), used);
    return used;
  });
  let usedSkillsRequest = 0;
  const refreshUsedSkills = async () => {
    const request = ++usedSkillsRequest;
    const sessionID = props.sessionID;
    try {
      const response = await context.client.session.context({ sessionID });
      if (request !== usedSkillsRequest) return;
      const used = /* @__PURE__ */ new Set();
      collectUsedSkills(response.data, used);
      setRemoteUsedSkills(used);
    } catch {
    }
  };
  createEffect(() => {
    props.sessionID;
    setRemoteUsedSkills(/* @__PURE__ */ new Set());
    void refreshUsedSkills();
  });
  const [skillsExpanded, setSkillsExpanded] = createSignal(false);
  const [skillsMoreHovered, setSkillsMoreHovered] = createSignal(false);
  const [skillsView, updateSkillsView] = context.storage.store("skills", {
    initial: { open: true }
  });
  const skillRows = createMemo(() => {
    const used = usedSkills();
    const list = [...skills()].sort((left, right) => {
      const leftUsed = used.has(left.id) || used.has(left.name) ? 0 : 1;
      const rightUsed = used.has(right.id) || used.has(right.name) ? 0 : 1;
      return leftUsed - rightUsed || left.name.localeCompare(right.name);
    });
    const rows = [];
    for (let index = 0; index < list.length; index += 2) {
      rows.push(list.slice(index, index + 2));
    }
    return rows;
  });
  const visibleSkillRows = createMemo(
    () => skillsExpanded() ? skillRows() : skillRows().slice(0, MAX_SKILL_ROWS)
  );
  const hiddenSkills = createMemo(
    () => skillRows().slice(MAX_SKILL_ROWS).reduce((total, row) => total + row.length, 0)
  );
  const [changes, setChanges] = createSignal([]);
  const [hovered, setHovered] = createSignal();
  const [hoveredFile, setHoveredFile] = createSignal();
  const [expanded, setExpanded] = createSignal(false);
  const [moreHovered, setMoreHovered] = createSignal(false);
  const [changesView, updateChangesView] = context.storage.store("changes", {
    initial: { open: true }
  });
  const [subagentTokens, setSubagentTokens] = createSignal({});
  let subagentRefresh = 0;
  const refreshSubagentTokens = async () => {
    const items = subagents();
    if (items.length === 0) return;
    const sequence = ++subagentRefresh;
    const entries = await Promise.all(
      items.map(async (item) => {
        try {
          await context.data.session.message.sync(item.id);
          const info = context.data.session.get(item.id);
          const messages = context.data.session.message.list(item.id);
          const last = lastAssistantWithUsage(messages, info?.revert?.messageID);
          const tokens = last?.tokens ? usedTokens(last.tokens) : void 0;
          return [item.id, tokens && tokens > 0 ? tokens : void 0];
        } catch {
          return [item.id, void 0];
        }
      })
    );
    if (sequence !== subagentRefresh) return;
    setSubagentTokens(Object.fromEntries(entries));
  };
  createEffect(() => {
    if (subagents().length === 0) return;
    void refreshSubagentTokens();
  });
  const visibleChanges = createMemo(
    () => expanded() ? changes() : changes().slice(0, MAX_CHANGES)
  );
  const [git, setGit] = createSignal();
  const [commitLimit, setCommitLimit] = createSignal(MAX_COMMITS);
  const [gitMoreHovered, setGitMoreHovered] = createSignal(false);
  const [gitLessHovered, setGitLessHovered] = createSignal(false);
  const [gitView, updateGitView] = context.storage.store("git", {
    initial: { open: true }
  });
  let gitRequest = 0;
  const refreshGit = async () => {
    const request = ++gitRequest;
    const state = await loadGit(directory(), commitLimit());
    if (request !== gitRequest) return;
    debug("git", directory(), JSON.stringify(state));
    setGit(state);
  };
  createEffect(() => {
    props.sessionID;
    setCommitLimit(MAX_COMMITS);
  });
  createEffect(() => {
    directory();
    commitLimit();
    void refreshGit();
  });
  onMount(() => {
    let disposed = false;
    let refreshing = false;
    let debounce;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const result = await context.client.vcs.status({
          location: { directory: directory() }
        });
        debug("vcs.status", directory(), JSON.stringify(result));
        if (!disposed) setChanges(result.data);
      } catch (error) {
        if (!disposed) setChanges([]);
        debug("vcs.status failed", directory(), String(error));
      } finally {
        refreshing = false;
      }
    };
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = void 0;
        void refresh();
        void refreshGit();
      }, 400);
    };
    void refresh();
    void refreshGit();
    void context.data.location.model.sync({ directory: directory() });
    void context.data.location.mcp.server.sync({ directory: directory() });
    void context.data.location.skill.sync({ directory: directory() });
    const stopFiles = context.data.on("filesystem.changed", (event) => {
      if (event.location?.directory && event.location.directory !== directory()) return;
      schedule();
    });
    const stopBranch = context.data.on("vcs.branch.updated", schedule);
    const stopMcp = context.data.on("mcp.status.changed", () => {
      void context.data.location.mcp.server.sync({ directory: directory() });
    });
    const stopUsage = context.data.on("session.usage.updated", (event) => {
      if (!subagents().some((item) => item.id === event.data.sessionID)) return;
      void refreshSubagentTokens();
    });
    const stopSkill = context.data.on("session.skill.activated", (event) => {
      if (event.data.sessionID !== props.sessionID) return;
      setRemoteUsedSkills(
        (current) => /* @__PURE__ */ new Set([...current, event.data.id, event.data.name])
      );
    });
    const stopCompaction = context.data.on("session.compaction.ended", (event) => {
      if (event.data.sessionID !== props.sessionID) return;
      void refreshUsedSkills();
    });
    const interval = setInterval(() => {
      void refresh();
      void refreshGit();
    }, 15e3);
    onCleanup(() => {
      disposed = true;
      stopFiles();
      stopBranch();
      stopMcp();
      stopUsage();
      stopSkill();
      stopCompaction();
      clearInterval(interval);
      if (debounce) clearTimeout(debounce);
    });
  });
  const statusLetter = (status) => status === "added" ? "A" : status === "deleted" ? "D" : "M";
  const statusColor = (status) => status === "added" ? theme.text.feedback.success.base : status === "deleted" ? theme.text.feedback.error.base : theme.text.feedback.warning.base;
  const openFile = async (file) => {
    const directory2 = session()?.location.directory ?? context.data.location.default().directory;
    const absolute = `${directory2}/${file}`;
    const editor = process.env.VISUAL || process.env.EDITOR;
    if (!editor) {
      const [command2, args] = process.platform === "darwin" ? ["open", [absolute]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", absolute]] : ["xdg-open", [absolute]];
      spawn(command2, args, { cwd: directory2, detached: true, stdio: "ignore" }).unref();
      return;
    }
    const parts = editor.split(/\s+/).filter(Boolean);
    const command = parts[0];
    if (!command) return;
    const executable = command.split("/").pop() ?? command;
    if (GUI_EDITORS.has(executable)) {
      spawn(command, [...parts.slice(1), absolute], {
        cwd: directory2,
        detached: true,
        stdio: "ignore"
      }).unref();
      return;
    }
    await context.renderer.suspend();
    try {
      await new Promise((resolve) => {
        const child = spawn(command, [...parts.slice(1), absolute], {
          cwd: directory2,
          stdio: "inherit",
          shell: process.platform === "win32"
        });
        child.on("error", () => resolve());
        child.on("exit", () => resolve());
      });
    } finally {
      await context.renderer.resume();
    }
  };
  const mcpColor = (server) => {
    if (server.status.status === "connected") return theme.text.feedback.success.base;
    if (server.status.status === "failed") return theme.text.feedback.error.base;
    if (server.status.status === "needs_auth") return theme.text.feedback.warning.base;
    return theme.text.muted;
  };
  const contextColor = (percent) => percent >= 90 ? theme.text.feedback.error.base : percent >= 70 ? theme.text.feedback.warning.base : theme.text.feedback.success.base;
  return /* @__PURE__ */ jsxs("box", { flexDirection: "column", gap: 1, width: "100%", children: [
    /* @__PURE__ */ jsx(Show, { when: modelLine() || usage() || cost() > 0, children: /* @__PURE__ */ jsxs("box", { flexDirection: "column", width: "100%", children: [
      /* @__PURE__ */ jsx(Show, { when: modelLine(), children: /* @__PURE__ */ jsx("text", { fg: theme.text.muted, wrapMode: "none", truncate: true, children: modelLine() }) }),
      /* @__PURE__ */ jsxs(Show, { when: usage() || cost() > 0, children: [
        /* @__PURE__ */ jsx("text", { fg: theme.text.muted, wrapMode: "none", truncate: true, children: contextLine() }),
        /* @__PURE__ */ jsx(Show, { when: contextPercent() !== void 0, children: /* @__PURE__ */ jsx("box", { width: "100%", height: 1, backgroundColor: theme.background.raised.high, children: /* @__PURE__ */ jsx(
          "box",
          {
            width: `${contextPercent() ?? 0}%`,
            height: 1,
            backgroundColor: contextColor(contextPercent() ?? 0)
          }
        ) }) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(Show, { when: subagents().length > 0, children: /* @__PURE__ */ jsxs("box", { children: [
      /* @__PURE__ */ jsxs("box", { flexDirection: "row", gap: 1, children: [
        /* @__PURE__ */ jsx("text", { fg: theme.text.base, children: /* @__PURE__ */ jsx("b", { children: "Subagents" }) }),
        /* @__PURE__ */ jsx("text", { fg: theme.text.muted, children: subagents().length })
      ] }),
      /* @__PURE__ */ jsx(For, { each: subagents(), children: (item) => /* @__PURE__ */ jsxs(
        "box",
        {
          flexDirection: "row",
          minWidth: 0,
          backgroundColor: hovered() === item.id ? theme.background.raised.high : void 0,
          onMouseDown: () => context.ui.router.navigate({ type: "session", sessionID: item.id }),
          onMouseOver: () => setHovered(item.id),
          onMouseOut: () => setHovered(void 0),
          children: [
            /* @__PURE__ */ jsxs("text", { fg: theme.text.feedback.warning.base, flexShrink: 0, children: [
              "\u25CF",
              " "
            ] }),
            /* @__PURE__ */ jsx(
              "text",
              {
                fg: theme.text.base,
                wrapMode: "none",
                truncate: true,
                flexShrink: 1,
                minWidth: 0,
                children: item.info?.title ?? item.id
              }
            ),
            /* @__PURE__ */ jsx(Show, { when: subagentTokens()[item.id], children: (value) => /* @__PURE__ */ jsxs("text", { fg: theme.text.muted, flexShrink: 0, wrapMode: "none", children: [
              " ",
              "(",
              shortTokens(value()),
              ")"
            ] }) })
          ]
        }
      ) })
    ] }) }),
    /* @__PURE__ */ jsx(Show, { when: changes().length > 0, children: /* @__PURE__ */ jsxs("box", { children: [
      /* @__PURE__ */ jsxs(
        "box",
        {
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 1,
          onMouseDown: () => {
            void updateChangesView((draft) => {
              draft.open = !draft.open;
            }).catch(() => {
            });
          },
          children: [
            /* @__PURE__ */ jsxs("box", { flexDirection: "row", gap: 1, children: [
              /* @__PURE__ */ jsx("text", { fg: theme.text.base, children: changesView.open ? "\u25BC" : "\u25B6" }),
              /* @__PURE__ */ jsx("text", { fg: theme.text.base, children: /* @__PURE__ */ jsx("b", { children: "Changes" }) })
            ] }),
            /* @__PURE__ */ jsx("text", { fg: theme.text.muted, children: changes().length })
          ]
        }
      ),
      /* @__PURE__ */ jsxs(Show, { when: changesView.open, children: [
        /* @__PURE__ */ jsx(For, { each: visibleChanges(), children: (file) => {
          const parts = splitFile(file.file);
          return /* @__PURE__ */ jsxs(
            "box",
            {
              flexDirection: "row",
              gap: 1,
              minWidth: 0,
              backgroundColor: hoveredFile() === file.file ? theme.background.raised.high : void 0,
              onMouseOver: () => setHoveredFile(file.file),
              onMouseOut: () => setHoveredFile(void 0),
              onMouseDown: (event) => {
                const modifier = event.modifiers.ctrl;
                if (event.button !== 2 && !(event.button === 0 && modifier)) return;
                event.preventDefault();
                event.stopPropagation();
                void openFile(file.file);
              },
              children: [
                /* @__PURE__ */ jsx("text", { fg: theme.text.feedback.info.base, width: 2, flexShrink: 0, children: fileTag(file.file) }),
                /* @__PURE__ */ jsx("text", { fg: theme.text.base, flexShrink: 0, wrapMode: "none", truncate: true, children: parts.name }),
                /* @__PURE__ */ jsx(
                  "text",
                  {
                    fg: theme.text.faint,
                    flexGrow: 1,
                    flexShrink: 1,
                    minWidth: 0,
                    wrapMode: "none",
                    truncate: true,
                    children: parts.dir
                  }
                ),
                /* @__PURE__ */ jsx("text", { fg: statusColor(file.status), flexShrink: 0, wrapMode: "none", children: statusLetter(file.status) })
              ]
            }
          );
        } }),
        /* @__PURE__ */ jsx(Show, { when: changes().length > MAX_CHANGES, children: /* @__PURE__ */ jsx(
          "box",
          {
            flexDirection: "row",
            onMouseDown: () => setExpanded((value) => !value),
            onMouseOver: () => setMoreHovered(true),
            onMouseOut: () => setMoreHovered(false),
            children: /* @__PURE__ */ jsx("text", { fg: moreHovered() ? theme.text.base : theme.text.feedback.info.base, children: expanded() ? "\u2212 show less" : `+${changes().length - MAX_CHANGES} more` })
          }
        ) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(Show, { when: git(), children: (state) => /* @__PURE__ */ jsxs("box", { children: [
      /* @__PURE__ */ jsx(
        "box",
        {
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 1,
          onMouseDown: () => {
            void updateGitView((draft) => {
              draft.open = !draft.open;
            }).catch(() => {
            });
          },
          children: /* @__PURE__ */ jsxs("box", { flexDirection: "row", gap: 1, minWidth: 0, children: [
            /* @__PURE__ */ jsx("text", { fg: theme.text.base, flexShrink: 0, children: gitView.open ? "\u25BC" : "\u25B6" }),
            /* @__PURE__ */ jsx("text", { fg: theme.text.base, flexShrink: 0, children: /* @__PURE__ */ jsx("b", { children: "Git" }) }),
            /* @__PURE__ */ jsx(
              "text",
              {
                fg: theme.text.feedback.info.base,
                wrapMode: "none",
                truncate: true,
                flexShrink: 1,
                minWidth: 0,
                children: state().branch
              }
            )
          ] })
        }
      ),
      /* @__PURE__ */ jsxs(Show, { when: gitView.open, children: [
        /* @__PURE__ */ jsx(For, { each: state().commits.slice(0, commitLimit()), children: (commit) => /* @__PURE__ */ jsxs("box", { flexDirection: "row", gap: 1, minWidth: 0, children: [
          /* @__PURE__ */ jsx(
            "text",
            {
              fg: commit.pushed ? theme.text.faint : theme.text.feedback.success.base,
              flexShrink: 0,
              children: commit.pushed ? "\u25CB" : "\u25CF"
            }
          ),
          /* @__PURE__ */ jsx(
            "text",
            {
              fg: theme.text.base,
              wrapMode: "none",
              truncate: true,
              flexShrink: 1,
              minWidth: 0,
              children: commit.subject
            }
          )
        ] }) }),
        /* @__PURE__ */ jsx(Show, { when: state().hasMore || commitLimit() > MAX_COMMITS, children: /* @__PURE__ */ jsxs("box", { flexDirection: "row", gap: 2, children: [
          /* @__PURE__ */ jsx(Show, { when: state().hasMore, children: /* @__PURE__ */ jsx(
            "box",
            {
              flexDirection: "row",
              onMouseDown: () => setCommitLimit((value) => value + COMMIT_STEP),
              onMouseOver: () => setGitMoreHovered(true),
              onMouseOut: () => setGitMoreHovered(false),
              children: /* @__PURE__ */ jsxs(
                "text",
                {
                  fg: gitMoreHovered() ? theme.text.base : theme.text.feedback.info.base,
                  children: [
                    "+",
                    COMMIT_STEP,
                    " more"
                  ]
                }
              )
            }
          ) }),
          /* @__PURE__ */ jsx(Show, { when: commitLimit() > MAX_COMMITS, children: /* @__PURE__ */ jsx(
            "box",
            {
              flexDirection: "row",
              onMouseDown: () => setCommitLimit(MAX_COMMITS),
              onMouseOver: () => setGitLessHovered(true),
              onMouseOut: () => setGitLessHovered(false),
              children: /* @__PURE__ */ jsx(
                "text",
                {
                  fg: gitLessHovered() ? theme.text.base : theme.text.feedback.info.base,
                  children: "\u2212 show less"
                }
              )
            }
          ) })
        ] }) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(Show, { when: mcp().length > 0, children: /* @__PURE__ */ jsxs("box", { children: [
      /* @__PURE__ */ jsxs(
        "box",
        {
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 1,
          onMouseDown: () => {
            void updateMcpView((draft) => {
              draft.open = !draft.open;
            }).catch(() => {
            });
          },
          children: [
            /* @__PURE__ */ jsxs("box", { flexDirection: "row", gap: 1, children: [
              /* @__PURE__ */ jsx("text", { fg: theme.text.base, children: mcpView.open ? "\u25BC" : "\u25B6" }),
              /* @__PURE__ */ jsx("text", { fg: theme.text.base, children: /* @__PURE__ */ jsx("b", { children: "MCP" }) })
            ] }),
            /* @__PURE__ */ jsx("text", { fg: theme.text.muted, children: mcp().length })
          ]
        }
      ),
      /* @__PURE__ */ jsxs(Show, { when: mcpView.open, children: [
        /* @__PURE__ */ jsx(For, { each: visibleMcpRows(), children: (row) => /* @__PURE__ */ jsxs("box", { flexDirection: "row", gap: 1, children: [
          /* @__PURE__ */ jsx(For, { each: row, children: (server) => /* @__PURE__ */ jsxs("box", { flexDirection: "row", gap: 1, flexGrow: 1, flexBasis: 0, minWidth: 0, children: [
            /* @__PURE__ */ jsx("text", { fg: mcpColor(server), flexShrink: 0, children: "\u25CF" }),
            /* @__PURE__ */ jsx(
              "text",
              {
                fg: theme.text.base,
                wrapMode: "none",
                truncate: true,
                flexShrink: 1,
                minWidth: 0,
                children: server.name
              }
            )
          ] }) }),
          /* @__PURE__ */ jsx(Show, { when: row.length === 1, children: /* @__PURE__ */ jsx("box", { flexGrow: 1, flexBasis: 0 }) })
        ] }) }),
        /* @__PURE__ */ jsx(Show, { when: mcpRows().length > MAX_MCP_ROWS, children: /* @__PURE__ */ jsx(
          "box",
          {
            flexDirection: "row",
            onMouseDown: () => setMcpExpanded((value) => !value),
            onMouseOver: () => setMcpMoreHovered(true),
            onMouseOut: () => setMcpMoreHovered(false),
            children: /* @__PURE__ */ jsx(
              "text",
              {
                fg: mcpMoreHovered() ? theme.text.base : theme.text.feedback.info.base,
                children: mcpExpanded() ? "\u2212 show less" : `+${hiddenMcp()} more`
              }
            )
          }
        ) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(Show, { when: skills().length > 0, children: /* @__PURE__ */ jsxs("box", { children: [
      /* @__PURE__ */ jsxs(
        "box",
        {
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 1,
          onMouseDown: () => {
            void updateSkillsView((draft) => {
              draft.open = !draft.open;
            }).catch(() => {
            });
          },
          children: [
            /* @__PURE__ */ jsxs("box", { flexDirection: "row", gap: 1, children: [
              /* @__PURE__ */ jsx("text", { fg: theme.text.base, children: skillsView.open ? "\u25BC" : "\u25B6" }),
              /* @__PURE__ */ jsx("text", { fg: theme.text.base, children: /* @__PURE__ */ jsx("b", { children: "Skills" }) })
            ] }),
            /* @__PURE__ */ jsx("text", { fg: theme.text.muted, children: skills().length })
          ]
        }
      ),
      /* @__PURE__ */ jsxs(Show, { when: skillsView.open, children: [
        /* @__PURE__ */ jsx(For, { each: visibleSkillRows(), children: (row) => /* @__PURE__ */ jsxs("box", { flexDirection: "row", gap: 1, children: [
          /* @__PURE__ */ jsx(For, { each: row, children: (skill) => {
            const used = () => usedSkills().has(skill.id) || usedSkills().has(skill.name);
            return /* @__PURE__ */ jsxs("box", { flexDirection: "row", gap: 1, flexGrow: 1, flexBasis: 0, minWidth: 0, children: [
              /* @__PURE__ */ jsx(
                "text",
                {
                  fg: used() ? theme.text.feedback.success.base : theme.text.base,
                  flexShrink: 0,
                  children: used() ? "\u25CF" : "\u25CB"
                }
              ),
              /* @__PURE__ */ jsx(
                "text",
                {
                  fg: theme.text.base,
                  wrapMode: "none",
                  truncate: true,
                  flexShrink: 1,
                  minWidth: 0,
                  children: skill.name
                }
              )
            ] });
          } }),
          /* @__PURE__ */ jsx(Show, { when: row.length === 1, children: /* @__PURE__ */ jsx("box", { flexGrow: 1, flexBasis: 0 }) })
        ] }) }),
        /* @__PURE__ */ jsx(Show, { when: skillRows().length > MAX_SKILL_ROWS, children: /* @__PURE__ */ jsx(
          "box",
          {
            flexDirection: "row",
            onMouseDown: () => setSkillsExpanded((value) => !value),
            onMouseOver: () => setSkillsMoreHovered(true),
            onMouseOut: () => setSkillsMoreHovered(false),
            children: /* @__PURE__ */ jsx(
              "text",
              {
                fg: skillsMoreHovered() ? theme.text.base : theme.text.feedback.info.base,
                children: skillsExpanded() ? "\u2212 show less" : `+${hiddenSkills()} more`
              }
            )
          }
        ) })
      ] })
    ] }) })
  ] });
}
var tui_default = Plugin.define({
  id: "sidebar.plus.debug2",
  setup(context) {
    return context.ui.slot({
      append: "sidebar.content",
      render: ({ sessionID }) => /* @__PURE__ */ jsx(Sidebar, { sessionID })
    });
  }
});
export {
  tui_default as default
};
