import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { Plugin, usePlugin } from "@opencode/plugin/tui";
import { spawn } from "node:child_process";
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});
const MAX_CHANGES = 12;
const MAX_SKILL_ROWS = 3;
const MAX_MCP_ROWS = 3;
const MAX_COMMITS = 10;
const COMMIT_STEP = 10;
function formatTokens(tokens) {
  if (tokens >= 999_950) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

/** Same scale without the redundant `.0`, for narrow inline labels. */
function shortTokens(tokens) {
  return formatTokens(tokens).replace(/\.0([KM])$/, "$1");
}
const GUI_EDITORS = new Set(["android-studio", "atom", "bbedit", "clion", "code", "code-insiders", "codium", "cursor", "datagrip", "fleet", "goland", "idea", "kiro", "mate", "nova", "phpstorm", "pycharm", "rider", "rubymine", "subl", "trae", "webstorm", "windsurf", "xcode", "zed"]);
/**
 * Mirrors the built-in context computation: the newest assistant message with
 * usage after the last completed compaction, bounded by the revert marker.
 */
function lastAssistantWithUsage(messages, boundary) {
  const boundaryIndex = boundary ? messages.findIndex(message => message.id === boundary) : -1;
  if (boundary && boundaryIndex === -1) return undefined;
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
  return undefined;
}
function usedTokens(tokens) {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;
}

/** Skills show up as a user attachment, a skill message, or a `skill` tool call. */
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
  if (index < 0) return {
    name: file,
    dir: ""
  };
  return {
    name: file.slice(index + 1),
    dir: file.slice(0, index)
  };
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
  if (dot <= 0) return "··";
  const extension = name.slice(dot + 1).toLowerCase();
  return TAGS[extension] ?? extension.slice(0, 2).toUpperCase();
}
/** Run git in the session directory without blocking the renderer. */
function runGit(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", chunk => {
      stdout += chunk;
    });
    child.stderr?.on("data", chunk => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve(stdout);else reject(new Error(stderr.trim() || `git ${args.join(" ")} exited with ${code}`));
    });
  });
}

/** Branch plus the newest commits, marking the ones that are not on the upstream. */
async function loadGit(cwd, limit) {
  try {
    let branch = (await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    if (branch === "HEAD") {
      branch = (await runGit(cwd, ["rev-parse", "--short", "HEAD"])).trim();
    }
    if (!branch) return undefined;
    const [log, unpushed] = await Promise.all([runGit(cwd, ["log", "-n", String(limit + 1), "--format=%H%x1f%s"]), runGit(cwd, ["rev-list", "@{upstream}..HEAD"]).catch(() => undefined)]);

    // Without an upstream every commit still lives only on this machine.
    const ahead = unpushed === undefined ? undefined : new Set(unpushed.split("\n").filter(Boolean));
    const commits = log.split("\n").filter(Boolean).map(line => {
      const separator = line.indexOf("\x1f");
      const hash = separator === -1 ? line : line.slice(0, separator);
      return {
        hash,
        subject: separator === -1 ? "" : line.slice(separator + 1),
        pushed: ahead !== undefined && !ahead.has(hash)
      };
    });
    return {
      branch,
      commits,
      hasMore: commits.length > limit
    };
  } catch {
    return undefined;
  }
}
function Sidebar(props) {
  const context = usePlugin();
  const theme = context.theme;
  const session = createMemo(() => context.data.session.get(props.sessionID));
  const directory = createMemo(() => session()?.location.directory ?? context.location?.directory ?? context.data.location.default().directory);
  const usage = createMemo(() => {
    const messages = context.data.session.message.list(props.sessionID);
    const last = lastAssistantWithUsage(messages, session()?.revert?.messageID);
    if (!last?.tokens) return;
    const tokens = usedTokens(last.tokens);
    if (tokens <= 0) return;
    const model = context.data.location.model.list({
      directory: directory()
    })?.find(item => item.providerID === last.model.providerID && item.id === last.model.id);
    return {
      tokens,
      percent: model?.limit.context ? Math.round(tokens / model.limit.context * 100) : undefined
    };
  });
  const cost = createMemo(() => context.data.session.cost(props.sessionID));
  const modelLine = createMemo(() => {
    const selected = context.ui.model.current();
    const ref = session()?.model ?? (selected ? {
      id: selected.modelID,
      providerID: selected.providerID,
      variant: selected.variant
    } : undefined);
    if (!ref) return undefined;
    const model = context.data.location.model.list({
      directory: directory()
    })?.find(item => item.providerID === ref.providerID && (item.id === ref.id || item.modelID === ref.id));
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
    if (percent === undefined) return undefined;
    return Math.max(0, Math.min(100, percent));
  });
  const subagents = createMemo(() => {
    if (session()?.parentID) return [];
    return context.data.session.family(props.sessionID).filter(id => id !== props.sessionID && context.data.session.status(id) === "running").map(id => ({
      id,
      info: context.data.session.get(id)
    }));
  });
  const mcp = createMemo(() => context.data.location.mcp.server.list({
    directory: directory()
  }) ?? []);
  const [mcpExpanded, setMcpExpanded] = createSignal(false);
  const [mcpMoreHovered, setMcpMoreHovered] = createSignal(false);
  const [mcpView, updateMcpView] = context.storage.store("mcp", {
    initial: {
      open: true
    }
  });
  const mcpRows = createMemo(() => {
    const list = mcp();
    const rows = [];
    for (let index = 0; index < list.length; index += 2) {
      rows.push(list.slice(index, index + 2));
    }
    return rows;
  });
  const visibleMcpRows = createMemo(() => mcpExpanded() ? mcpRows() : mcpRows().slice(0, MAX_MCP_ROWS));
  const hiddenMcp = createMemo(() => mcpRows().slice(MAX_MCP_ROWS).reduce((total, row) => total + row.length, 0));
  const skills = createMemo(() => context.data.location.skill.list({
    directory: directory()
  }) ?? []);
  const [remoteUsedSkills, setRemoteUsedSkills] = createSignal(new Set());
  const usedSkills = createMemo(() => {
    const messages = context.data.session.message.list(props.sessionID);
    const boundary = session()?.revert?.messageID;
    const boundaryIndex = boundary ? messages.findIndex(message => message.id === boundary) : -1;
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
      const response = await context.client.session.context({
        sessionID
      });
      if (request !== usedSkillsRequest) return;
      const used = new Set();
      collectUsedSkills(response.data, used);
      setRemoteUsedSkills(used);
    } catch {
      // Keep the locally scanned set when the context cannot be fetched.
    }
  };
  createEffect(() => {
    props.sessionID;
    setRemoteUsedSkills(new Set());
    void refreshUsedSkills();
  });
  const [skillsExpanded, setSkillsExpanded] = createSignal(false);
  const [skillsMoreHovered, setSkillsMoreHovered] = createSignal(false);
  const [skillsView, updateSkillsView] = context.storage.store("skills", {
    initial: {
      open: true
    }
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
  const visibleSkillRows = createMemo(() => skillsExpanded() ? skillRows() : skillRows().slice(0, MAX_SKILL_ROWS));
  const hiddenSkills = createMemo(() => skillRows().slice(MAX_SKILL_ROWS).reduce((total, row) => total + row.length, 0));
  const [changes, setChanges] = createSignal([]);
  const [hovered, setHovered] = createSignal();
  const [hoveredFile, setHoveredFile] = createSignal();
  const [expanded, setExpanded] = createSignal(false);
  const [moreHovered, setMoreHovered] = createSignal(false);
  const [changesView, updateChangesView] = context.storage.store("changes", {
    initial: {
      open: true
    }
  });
  const [subagentTokens, setSubagentTokens] = createSignal({});
  let subagentRefresh = 0;
  const refreshSubagentTokens = async () => {
    const items = subagents();
    if (items.length === 0) return;
    const sequence = ++subagentRefresh;
    const entries = await Promise.all(items.map(async item => {
      try {
        await context.data.session.message.sync(item.id);
        const info = context.data.session.get(item.id);
        const messages = context.data.session.message.list(item.id);
        const last = lastAssistantWithUsage(messages, info?.revert?.messageID);
        const tokens = last?.tokens ? usedTokens(last.tokens) : undefined;
        return [item.id, tokens && tokens > 0 ? tokens : undefined];
      } catch {
        return [item.id, undefined];
      }
    }));
    if (sequence !== subagentRefresh) return;
    setSubagentTokens(Object.fromEntries(entries));
  };
  createEffect(() => {
    if (subagents().length === 0) return;
    void refreshSubagentTokens();
  });
  const visibleChanges = createMemo(() => expanded() ? changes() : changes().slice(0, MAX_CHANGES));
  const [git, setGit] = createSignal();
  const [commitLimit, setCommitLimit] = createSignal(MAX_COMMITS);
  const [gitMoreHovered, setGitMoreHovered] = createSignal(false);
  const [gitLessHovered, setGitLessHovered] = createSignal(false);
  const [gitView, updateGitView] = context.storage.store("git", {
    initial: {
      open: true
    }
  });
  let gitRequest = 0;
  const refreshGit = async () => {
    const request = ++gitRequest;
    const state = await loadGit(directory(), commitLimit());
    if (request !== gitRequest) return;
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
          location: {
            directory: directory()
          }
        });
        if (!disposed) setChanges(result.data);
      } catch {
        if (!disposed) setChanges([]);
      } finally {
        refreshing = false;
      }
    };
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = undefined;
        void refresh();
        void refreshGit();
      }, 400);
    };
    void refresh();
    void refreshGit();
    void context.data.location.model.sync({
      directory: directory()
    });
    void context.data.location.mcp.server.sync({
      directory: directory()
    });
    void context.data.location.skill.sync({
      directory: directory()
    });
    const stopFiles = context.data.on("filesystem.changed", event => {
      if (event.location?.directory && event.location.directory !== directory()) return;
      schedule();
    });
    const stopBranch = context.data.on("vcs.branch.updated", schedule);
    const stopMcp = context.data.on("mcp.status.changed", () => {
      void context.data.location.mcp.server.sync({
        directory: directory()
      });
    });
    const stopUsage = context.data.on("session.usage.updated", event => {
      if (!subagents().some(item => item.id === event.data.sessionID)) return;
      void refreshSubagentTokens();
    });
    const stopSkill = context.data.on("session.skill.activated", event => {
      if (event.data.sessionID !== props.sessionID) return;
      setRemoteUsedSkills(current => new Set([...current, event.data.id, event.data.name]));
    });
    const stopCompaction = context.data.on("session.compaction.ended", event => {
      if (event.data.sessionID !== props.sessionID) return;
      void refreshUsedSkills();
    });
    const interval = setInterval(() => {
      void refresh();
      void refreshGit();
    }, 15_000);
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
  const statusLetter = status => status === "added" ? "A" : status === "deleted" ? "D" : "M";
  const statusColor = status => status === "added" ? theme.text.feedback.success.base : status === "deleted" ? theme.text.feedback.error.base : theme.text.feedback.warning.base;
  const openFile = async file => {
    const directory = session()?.location.directory ?? context.data.location.default().directory;
    const absolute = `${directory}/${file}`;
    const editor = process.env.VISUAL || process.env.EDITOR;
    if (!editor) {
      const [command, args] = process.platform === "darwin" ? ["open", [absolute]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", absolute]] : ["xdg-open", [absolute]];
      spawn(command, args, {
        cwd: directory,
        detached: true,
        stdio: "ignore"
      }).unref();
      return;
    }
    const parts = editor.split(/\s+/).filter(Boolean);
    const command = parts[0];
    if (!command) return;
    const executable = command.split("/").pop() ?? command;
    if (GUI_EDITORS.has(executable)) {
      spawn(command, [...parts.slice(1), absolute], {
        cwd: directory,
        detached: true,
        stdio: "ignore"
      }).unref();
      return;
    }
    await context.renderer.suspend();
    try {
      await new Promise(resolve => {
        const child = spawn(command, [...parts.slice(1), absolute], {
          cwd: directory,
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
  const mcpColor = server => {
    if (server.status.status === "connected") return theme.text.feedback.success.base;
    if (server.status.status === "failed") return theme.text.feedback.error.base;
    if (server.status.status === "needs_auth") return theme.text.feedback.warning.base;
    return theme.text.muted;
  };
  const contextColor = percent => percent >= 90 ? theme.text.feedback.error.base : percent >= 70 ? theme.text.feedback.warning.base : theme.text.feedback.success.base;
  return (() => {
    var _el$ = _$createElement("box");
    _$setProp(_el$, "flexDirection", "column");
    _$setProp(_el$, "gap", 1);
    _$setProp(_el$, "width", "100%");
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return modelLine() || usage() || cost() > 0;
      },
      get children() {
        var _el$2 = _$createElement("box");
        _$setProp(_el$2, "flexDirection", "column");
        _$setProp(_el$2, "width", "100%");
        _$insert(_el$2, _$createComponent(Show, {
          get when() {
            return modelLine();
          },
          get children() {
            var _el$3 = _$createElement("text");
            _$setProp(_el$3, "wrapMode", "none");
            _$setProp(_el$3, "truncate", true);
            _$insert(_el$3, modelLine);
            _$effect(_$p => _$setProp(_el$3, "fg", theme.text.muted, _$p));
            return _el$3;
          }
        }), null);
        _$insert(_el$2, _$createComponent(Show, {
          get when() {
            return usage() || cost() > 0;
          },
          get children() {
            return [(() => {
              var _el$4 = _$createElement("text");
              _$setProp(_el$4, "wrapMode", "none");
              _$setProp(_el$4, "truncate", true);
              _$insert(_el$4, contextLine);
              _$effect(_$p => _$setProp(_el$4, "fg", theme.text.muted, _$p));
              return _el$4;
            })(), _$createComponent(Show, {
              get when() {
                return contextPercent() !== undefined;
              },
              get children() {
                var _el$5 = _$createElement("box"),
                  _el$6 = _$createElement("box");
                _$insertNode(_el$5, _el$6);
                _$setProp(_el$5, "width", "100%");
                _$setProp(_el$5, "height", 1);
                _$setProp(_el$6, "height", 1);
                _$effect(_p$ => {
                  var _v$ = theme.background.raised.high,
                    _v$2 = `${contextPercent() ?? 0}%`,
                    _v$3 = contextColor(contextPercent() ?? 0);
                  _v$ !== _p$.e && (_p$.e = _$setProp(_el$5, "backgroundColor", _v$, _p$.e));
                  _v$2 !== _p$.t && (_p$.t = _$setProp(_el$6, "width", _v$2, _p$.t));
                  _v$3 !== _p$.a && (_p$.a = _$setProp(_el$6, "backgroundColor", _v$3, _p$.a));
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined,
                  a: undefined
                });
                return _el$5;
              }
            })];
          }
        }), null);
        return _el$2;
      }
    }), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return subagents().length > 0;
      },
      get children() {
        var _el$7 = _$createElement("box"),
          _el$8 = _$createElement("box"),
          _el$9 = _$createElement("text"),
          _el$0 = _$createElement("b"),
          _el$10 = _$createElement("text");
        _$insertNode(_el$7, _el$8);
        _$insertNode(_el$8, _el$9);
        _$insertNode(_el$8, _el$10);
        _$setProp(_el$8, "flexDirection", "row");
        _$setProp(_el$8, "gap", 1);
        _$insertNode(_el$9, _el$0);
        _$insertNode(_el$0, _$createTextNode(`Subagents`));
        _$insert(_el$10, () => subagents().length);
        _$insert(_el$7, _$createComponent(For, {
          get each() {
            return subagents();
          },
          children: item => (() => {
            var _el$41 = _$createElement("box"),
              _el$42 = _$createElement("text"),
              _el$43 = _$createTextNode(`● `),
              _el$45 = _$createElement("text");
            _$insertNode(_el$41, _el$42);
            _$insertNode(_el$41, _el$45);
            _$setProp(_el$41, "flexDirection", "row");
            _$setProp(_el$41, "minWidth", 0);
            _$setProp(_el$41, "onMouseDown", () => context.ui.router.navigate({
              type: "session",
              sessionID: item.id
            }));
            _$setProp(_el$41, "onMouseOver", () => setHovered(item.id));
            _$setProp(_el$41, "onMouseOut", () => setHovered(undefined));
            _$insertNode(_el$42, _el$43);
            _$setProp(_el$42, "flexShrink", 0);
            _$setProp(_el$45, "wrapMode", "none");
            _$setProp(_el$45, "truncate", true);
            _$setProp(_el$45, "flexShrink", 1);
            _$setProp(_el$45, "minWidth", 0);
            _$insert(_el$45, () => item.info?.title ?? item.id);
            _$insert(_el$41, _$createComponent(Show, {
              get when() {
                return subagentTokens()[item.id];
              },
              children: value => (() => {
                var _el$46 = _$createElement("text"),
                  _el$47 = _$createTextNode(` (`),
                  _el$49 = _$createTextNode(`)`);
                _$insertNode(_el$46, _el$47);
                _$insertNode(_el$46, _el$49);
                _$setProp(_el$46, "flexShrink", 0);
                _$setProp(_el$46, "wrapMode", "none");
                _$insert(_el$46, () => shortTokens(value()), _el$49);
                _$effect(_$p => _$setProp(_el$46, "fg", theme.text.muted, _$p));
                return _el$46;
              })()
            }), null);
            _$effect(_p$ => {
              var _v$13 = hovered() === item.id ? theme.background.raised.high : undefined,
                _v$14 = theme.text.feedback.warning.base,
                _v$15 = theme.text.base;
              _v$13 !== _p$.e && (_p$.e = _$setProp(_el$41, "backgroundColor", _v$13, _p$.e));
              _v$14 !== _p$.t && (_p$.t = _$setProp(_el$42, "fg", _v$14, _p$.t));
              _v$15 !== _p$.a && (_p$.a = _$setProp(_el$45, "fg", _v$15, _p$.a));
              return _p$;
            }, {
              e: undefined,
              t: undefined,
              a: undefined
            });
            return _el$41;
          })()
        }), null);
        _$effect(_p$ => {
          var _v$4 = theme.text.base,
            _v$5 = theme.text.muted;
          _v$4 !== _p$.e && (_p$.e = _$setProp(_el$9, "fg", _v$4, _p$.e));
          _v$5 !== _p$.t && (_p$.t = _$setProp(_el$10, "fg", _v$5, _p$.t));
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$7;
      }
    }), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return changes().length > 0;
      },
      get children() {
        var _el$11 = _$createElement("box"),
          _el$12 = _$createElement("box"),
          _el$13 = _$createElement("box"),
          _el$14 = _$createElement("text"),
          _el$15 = _$createElement("text"),
          _el$16 = _$createElement("b"),
          _el$18 = _$createElement("text");
        _$insertNode(_el$11, _el$12);
        _$insertNode(_el$12, _el$13);
        _$insertNode(_el$12, _el$18);
        _$setProp(_el$12, "flexDirection", "row");
        _$setProp(_el$12, "justifyContent", "space-between");
        _$setProp(_el$12, "gap", 1);
        _$setProp(_el$12, "onMouseDown", () => {
          void updateChangesView(draft => {
            draft.open = !draft.open;
          }).catch(() => {});
        });
        _$insertNode(_el$13, _el$14);
        _$insertNode(_el$13, _el$15);
        _$setProp(_el$13, "flexDirection", "row");
        _$setProp(_el$13, "gap", 1);
        _$insert(_el$14, () => changesView.open ? "▼" : "▶");
        _$insertNode(_el$15, _el$16);
        _$insertNode(_el$16, _$createTextNode(`Changes`));
        _$insert(_el$18, () => changes().length);
        _$insert(_el$11, _$createComponent(Show, {
          get when() {
            return changesView.open;
          },
          get children() {
            return [_$createComponent(For, {
              get each() {
                return visibleChanges();
              },
              children: file => {
                const parts = splitFile(file.file);
                return (() => {
                  var _el$50 = _$createElement("box"),
                    _el$51 = _$createElement("text"),
                    _el$52 = _$createElement("text"),
                    _el$53 = _$createElement("text"),
                    _el$54 = _$createElement("text");
                  _$insertNode(_el$50, _el$51);
                  _$insertNode(_el$50, _el$52);
                  _$insertNode(_el$50, _el$53);
                  _$insertNode(_el$50, _el$54);
                  _$setProp(_el$50, "flexDirection", "row");
                  _$setProp(_el$50, "gap", 1);
                  _$setProp(_el$50, "minWidth", 0);
                  _$setProp(_el$50, "onMouseOver", () => setHoveredFile(file.file));
                  _$setProp(_el$50, "onMouseOut", () => setHoveredFile(undefined));
                  _$setProp(_el$50, "onMouseDown", event => {
                    const modifier = event.modifiers.ctrl;
                    if (event.button !== 2 && !(event.button === 0 && modifier)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    void openFile(file.file);
                  });
                  _$setProp(_el$51, "width", 2);
                  _$setProp(_el$51, "flexShrink", 0);
                  _$insert(_el$51, () => fileTag(file.file));
                  _$setProp(_el$52, "flexShrink", 0);
                  _$setProp(_el$52, "wrapMode", "none");
                  _$setProp(_el$52, "truncate", true);
                  _$insert(_el$52, () => parts.name);
                  _$setProp(_el$53, "flexGrow", 1);
                  _$setProp(_el$53, "flexShrink", 1);
                  _$setProp(_el$53, "minWidth", 0);
                  _$setProp(_el$53, "wrapMode", "none");
                  _$setProp(_el$53, "truncate", true);
                  _$insert(_el$53, () => parts.dir);
                  _$setProp(_el$54, "flexShrink", 0);
                  _$setProp(_el$54, "wrapMode", "none");
                  _$insert(_el$54, () => statusLetter(file.status));
                  _$effect(_p$ => {
                    var _v$16 = hoveredFile() === file.file ? theme.background.raised.high : undefined,
                      _v$17 = theme.text.feedback.info.base,
                      _v$18 = theme.text.base,
                      _v$19 = theme.text.faint,
                      _v$20 = statusColor(file.status);
                    _v$16 !== _p$.e && (_p$.e = _$setProp(_el$50, "backgroundColor", _v$16, _p$.e));
                    _v$17 !== _p$.t && (_p$.t = _$setProp(_el$51, "fg", _v$17, _p$.t));
                    _v$18 !== _p$.a && (_p$.a = _$setProp(_el$52, "fg", _v$18, _p$.a));
                    _v$19 !== _p$.o && (_p$.o = _$setProp(_el$53, "fg", _v$19, _p$.o));
                    _v$20 !== _p$.i && (_p$.i = _$setProp(_el$54, "fg", _v$20, _p$.i));
                    return _p$;
                  }, {
                    e: undefined,
                    t: undefined,
                    a: undefined,
                    o: undefined,
                    i: undefined
                  });
                  return _el$50;
                })();
              }
            }), _$createComponent(Show, {
              get when() {
                return changes().length > MAX_CHANGES;
              },
              get children() {
                var _el$19 = _$createElement("box"),
                  _el$20 = _$createElement("text");
                _$insertNode(_el$19, _el$20);
                _$setProp(_el$19, "flexDirection", "row");
                _$setProp(_el$19, "onMouseDown", () => setExpanded(value => !value));
                _$setProp(_el$19, "onMouseOver", () => setMoreHovered(true));
                _$setProp(_el$19, "onMouseOut", () => setMoreHovered(false));
                _$insert(_el$20, (() => {
                  var _c$ = _$memo(() => !!expanded());
                  return () => _c$() ? "− show less" : `+${changes().length - MAX_CHANGES} more`;
                })());
                _$effect(_$p => _$setProp(_el$20, "fg", moreHovered() ? theme.text.base : theme.text.feedback.info.base, _$p));
                return _el$19;
              }
            })];
          }
        }), null);
        _$effect(_p$ => {
          var _v$6 = theme.text.base,
            _v$7 = theme.text.base,
            _v$8 = theme.text.muted;
          _v$6 !== _p$.e && (_p$.e = _$setProp(_el$14, "fg", _v$6, _p$.e));
          _v$7 !== _p$.t && (_p$.t = _$setProp(_el$15, "fg", _v$7, _p$.t));
          _v$8 !== _p$.a && (_p$.a = _$setProp(_el$18, "fg", _v$8, _p$.a));
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined
        });
        return _el$11;
      }
    }), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return git();
      },
      children: state => (() => {
        var _el$55 = _$createElement("box"),
          _el$56 = _$createElement("box"),
          _el$57 = _$createElement("box"),
          _el$58 = _$createElement("text"),
          _el$59 = _$createElement("text"),
          _el$60 = _$createElement("b"),
          _el$62 = _$createElement("text");
        _$insertNode(_el$55, _el$56);
        _$insertNode(_el$56, _el$57);
        _$setProp(_el$56, "flexDirection", "row");
        _$setProp(_el$56, "justifyContent", "space-between");
        _$setProp(_el$56, "gap", 1);
        _$setProp(_el$56, "onMouseDown", () => {
          void updateGitView(draft => {
            draft.open = !draft.open;
          }).catch(() => {});
        });
        _$insertNode(_el$57, _el$58);
        _$insertNode(_el$57, _el$59);
        _$insertNode(_el$57, _el$62);
        _$setProp(_el$57, "flexDirection", "row");
        _$setProp(_el$57, "gap", 1);
        _$setProp(_el$57, "minWidth", 0);
        _$setProp(_el$58, "flexShrink", 0);
        _$insert(_el$58, () => gitView.open ? "▼" : "▶");
        _$insertNode(_el$59, _el$60);
        _$setProp(_el$59, "flexShrink", 0);
        _$insertNode(_el$60, _$createTextNode(`Git`));
        _$setProp(_el$62, "wrapMode", "none");
        _$setProp(_el$62, "truncate", true);
        _$setProp(_el$62, "flexShrink", 1);
        _$setProp(_el$62, "minWidth", 0);
        _$insert(_el$62, () => state().branch);
        _$insert(_el$55, _$createComponent(Show, {
          get when() {
            return gitView.open;
          },
          get children() {
            return [_$createComponent(For, {
              get each() {
                return state().commits.slice(0, commitLimit());
              },
              children: commit => (() => {
                var _el$72 = _$createElement("box"),
                  _el$73 = _$createElement("text"),
                  _el$74 = _$createElement("text");
                _$insertNode(_el$72, _el$73);
                _$insertNode(_el$72, _el$74);
                _$setProp(_el$72, "flexDirection", "row");
                _$setProp(_el$72, "gap", 1);
                _$setProp(_el$72, "minWidth", 0);
                _$setProp(_el$73, "flexShrink", 0);
                _$insert(_el$73, () => commit.pushed ? "○" : "●");
                _$setProp(_el$74, "wrapMode", "none");
                _$setProp(_el$74, "truncate", true);
                _$setProp(_el$74, "flexShrink", 1);
                _$setProp(_el$74, "minWidth", 0);
                _$insert(_el$74, () => commit.subject);
                _$effect(_p$ => {
                  var _v$24 = commit.pushed ? theme.text.faint : theme.text.feedback.success.base,
                    _v$25 = theme.text.base;
                  _v$24 !== _p$.e && (_p$.e = _$setProp(_el$73, "fg", _v$24, _p$.e));
                  _v$25 !== _p$.t && (_p$.t = _$setProp(_el$74, "fg", _v$25, _p$.t));
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined
                });
                return _el$72;
              })()
            }), _$createComponent(Show, {
              get when() {
                return state().hasMore || commitLimit() > MAX_COMMITS;
              },
              get children() {
                var _el$63 = _$createElement("box");
                _$setProp(_el$63, "flexDirection", "row");
                _$setProp(_el$63, "gap", 2);
                _$insert(_el$63, _$createComponent(Show, {
                  get when() {
                    return state().hasMore;
                  },
                  get children() {
                    var _el$64 = _$createElement("box"),
                      _el$65 = _$createElement("text"),
                      _el$66 = _$createTextNode(`+10 more`);
                    _$insertNode(_el$64, _el$65);
                    _$setProp(_el$64, "flexDirection", "row");
                    _$setProp(_el$64, "onMouseDown", () => setCommitLimit(value => value + COMMIT_STEP));
                    _$setProp(_el$64, "onMouseOver", () => setGitMoreHovered(true));
                    _$setProp(_el$64, "onMouseOut", () => setGitMoreHovered(false));
                    _$insertNode(_el$65, _el$66);
                    _$effect(_$p => _$setProp(_el$65, "fg", gitMoreHovered() ? theme.text.base : theme.text.feedback.info.base, _$p));
                    return _el$64;
                  }
                }), null);
                _$insert(_el$63, _$createComponent(Show, {
                  get when() {
                    return commitLimit() > MAX_COMMITS;
                  },
                  get children() {
                    var _el$69 = _$createElement("box"),
                      _el$70 = _$createElement("text");
                    _$insertNode(_el$69, _el$70);
                    _$setProp(_el$69, "flexDirection", "row");
                    _$setProp(_el$69, "onMouseDown", () => setCommitLimit(MAX_COMMITS));
                    _$setProp(_el$69, "onMouseOver", () => setGitLessHovered(true));
                    _$setProp(_el$69, "onMouseOut", () => setGitLessHovered(false));
                    _$insertNode(_el$70, _$createTextNode(`− show less`));
                    _$effect(_$p => _$setProp(_el$70, "fg", gitLessHovered() ? theme.text.base : theme.text.feedback.info.base, _$p));
                    return _el$69;
                  }
                }), null);
                return _el$63;
              }
            })];
          }
        }), null);
        _$effect(_p$ => {
          var _v$21 = theme.text.base,
            _v$22 = theme.text.base,
            _v$23 = theme.text.feedback.info.base;
          _v$21 !== _p$.e && (_p$.e = _$setProp(_el$58, "fg", _v$21, _p$.e));
          _v$22 !== _p$.t && (_p$.t = _$setProp(_el$59, "fg", _v$22, _p$.t));
          _v$23 !== _p$.a && (_p$.a = _$setProp(_el$62, "fg", _v$23, _p$.a));
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined
        });
        return _el$55;
      })()
    }), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return mcp().length > 0;
      },
      get children() {
        var _el$21 = _$createElement("box"),
          _el$22 = _$createElement("box"),
          _el$23 = _$createElement("box"),
          _el$24 = _$createElement("text"),
          _el$25 = _$createElement("text"),
          _el$26 = _$createElement("b"),
          _el$28 = _$createElement("text");
        _$insertNode(_el$21, _el$22);
        _$insertNode(_el$22, _el$23);
        _$insertNode(_el$22, _el$28);
        _$setProp(_el$22, "flexDirection", "row");
        _$setProp(_el$22, "justifyContent", "space-between");
        _$setProp(_el$22, "gap", 1);
        _$setProp(_el$22, "onMouseDown", () => {
          void updateMcpView(draft => {
            draft.open = !draft.open;
          }).catch(() => {});
        });
        _$insertNode(_el$23, _el$24);
        _$insertNode(_el$23, _el$25);
        _$setProp(_el$23, "flexDirection", "row");
        _$setProp(_el$23, "gap", 1);
        _$insert(_el$24, () => mcpView.open ? "▼" : "▶");
        _$insertNode(_el$25, _el$26);
        _$insertNode(_el$26, _$createTextNode(`MCP`));
        _$insert(_el$28, () => mcp().length);
        _$insert(_el$21, _$createComponent(Show, {
          get when() {
            return mcpView.open;
          },
          get children() {
            return [_$createComponent(For, {
              get each() {
                return visibleMcpRows();
              },
              children: row => (() => {
                var _el$75 = _$createElement("box");
                _$setProp(_el$75, "flexDirection", "row");
                _$setProp(_el$75, "gap", 1);
                _$insert(_el$75, _$createComponent(For, {
                  each: row,
                  children: server => (() => {
                    var _el$77 = _$createElement("box"),
                      _el$78 = _$createElement("text"),
                      _el$80 = _$createElement("text");
                    _$insertNode(_el$77, _el$78);
                    _$insertNode(_el$77, _el$80);
                    _$setProp(_el$77, "flexDirection", "row");
                    _$setProp(_el$77, "gap", 1);
                    _$setProp(_el$77, "flexGrow", 1);
                    _$setProp(_el$77, "flexBasis", 0);
                    _$setProp(_el$77, "minWidth", 0);
                    _$insertNode(_el$78, _$createTextNode(`●`));
                    _$setProp(_el$78, "flexShrink", 0);
                    _$setProp(_el$80, "wrapMode", "none");
                    _$setProp(_el$80, "truncate", true);
                    _$setProp(_el$80, "flexShrink", 1);
                    _$setProp(_el$80, "minWidth", 0);
                    _$insert(_el$80, () => server.name);
                    _$effect(_p$ => {
                      var _v$26 = mcpColor(server),
                        _v$27 = theme.text.base;
                      _v$26 !== _p$.e && (_p$.e = _$setProp(_el$78, "fg", _v$26, _p$.e));
                      _v$27 !== _p$.t && (_p$.t = _$setProp(_el$80, "fg", _v$27, _p$.t));
                      return _p$;
                    }, {
                      e: undefined,
                      t: undefined
                    });
                    return _el$77;
                  })()
                }), null);
                _$insert(_el$75, _$createComponent(Show, {
                  get when() {
                    return row.length === 1;
                  },
                  get children() {
                    var _el$76 = _$createElement("box");
                    _$setProp(_el$76, "flexGrow", 1);
                    _$setProp(_el$76, "flexBasis", 0);
                    return _el$76;
                  }
                }), null);
                return _el$75;
              })()
            }), _$createComponent(Show, {
              get when() {
                return mcpRows().length > MAX_MCP_ROWS;
              },
              get children() {
                var _el$29 = _$createElement("box"),
                  _el$30 = _$createElement("text");
                _$insertNode(_el$29, _el$30);
                _$setProp(_el$29, "flexDirection", "row");
                _$setProp(_el$29, "onMouseDown", () => setMcpExpanded(value => !value));
                _$setProp(_el$29, "onMouseOver", () => setMcpMoreHovered(true));
                _$setProp(_el$29, "onMouseOut", () => setMcpMoreHovered(false));
                _$insert(_el$30, (() => {
                  var _c$2 = _$memo(() => !!mcpExpanded());
                  return () => _c$2() ? "− show less" : `+${hiddenMcp()} more`;
                })());
                _$effect(_$p => _$setProp(_el$30, "fg", mcpMoreHovered() ? theme.text.base : theme.text.feedback.info.base, _$p));
                return _el$29;
              }
            })];
          }
        }), null);
        _$effect(_p$ => {
          var _v$9 = theme.text.base,
            _v$0 = theme.text.base,
            _v$1 = theme.text.muted;
          _v$9 !== _p$.e && (_p$.e = _$setProp(_el$24, "fg", _v$9, _p$.e));
          _v$0 !== _p$.t && (_p$.t = _$setProp(_el$25, "fg", _v$0, _p$.t));
          _v$1 !== _p$.a && (_p$.a = _$setProp(_el$28, "fg", _v$1, _p$.a));
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined
        });
        return _el$21;
      }
    }), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return skills().length > 0;
      },
      get children() {
        var _el$31 = _$createElement("box"),
          _el$32 = _$createElement("box"),
          _el$33 = _$createElement("box"),
          _el$34 = _$createElement("text"),
          _el$35 = _$createElement("text"),
          _el$36 = _$createElement("b"),
          _el$38 = _$createElement("text");
        _$insertNode(_el$31, _el$32);
        _$insertNode(_el$32, _el$33);
        _$insertNode(_el$32, _el$38);
        _$setProp(_el$32, "flexDirection", "row");
        _$setProp(_el$32, "justifyContent", "space-between");
        _$setProp(_el$32, "gap", 1);
        _$setProp(_el$32, "onMouseDown", () => {
          void updateSkillsView(draft => {
            draft.open = !draft.open;
          }).catch(() => {});
        });
        _$insertNode(_el$33, _el$34);
        _$insertNode(_el$33, _el$35);
        _$setProp(_el$33, "flexDirection", "row");
        _$setProp(_el$33, "gap", 1);
        _$insert(_el$34, () => skillsView.open ? "▼" : "▶");
        _$insertNode(_el$35, _el$36);
        _$insertNode(_el$36, _$createTextNode(`Skills`));
        _$insert(_el$38, () => skills().length);
        _$insert(_el$31, _$createComponent(Show, {
          get when() {
            return skillsView.open;
          },
          get children() {
            return [_$createComponent(For, {
              get each() {
                return visibleSkillRows();
              },
              children: row => (() => {
                var _el$81 = _$createElement("box");
                _$setProp(_el$81, "flexDirection", "row");
                _$setProp(_el$81, "gap", 1);
                _$insert(_el$81, _$createComponent(For, {
                  each: row,
                  children: skill => {
                    const used = () => usedSkills().has(skill.id) || usedSkills().has(skill.name);
                    return (() => {
                      var _el$83 = _$createElement("box"),
                        _el$84 = _$createElement("text"),
                        _el$85 = _$createElement("text");
                      _$insertNode(_el$83, _el$84);
                      _$insertNode(_el$83, _el$85);
                      _$setProp(_el$83, "flexDirection", "row");
                      _$setProp(_el$83, "gap", 1);
                      _$setProp(_el$83, "flexGrow", 1);
                      _$setProp(_el$83, "flexBasis", 0);
                      _$setProp(_el$83, "minWidth", 0);
                      _$setProp(_el$84, "flexShrink", 0);
                      _$insert(_el$84, () => used() ? "●" : "○");
                      _$setProp(_el$85, "wrapMode", "none");
                      _$setProp(_el$85, "truncate", true);
                      _$setProp(_el$85, "flexShrink", 1);
                      _$setProp(_el$85, "minWidth", 0);
                      _$insert(_el$85, () => skill.name);
                      _$effect(_p$ => {
                        var _v$28 = used() ? theme.text.feedback.success.base : theme.text.base,
                          _v$29 = theme.text.base;
                        _v$28 !== _p$.e && (_p$.e = _$setProp(_el$84, "fg", _v$28, _p$.e));
                        _v$29 !== _p$.t && (_p$.t = _$setProp(_el$85, "fg", _v$29, _p$.t));
                        return _p$;
                      }, {
                        e: undefined,
                        t: undefined
                      });
                      return _el$83;
                    })();
                  }
                }), null);
                _$insert(_el$81, _$createComponent(Show, {
                  get when() {
                    return row.length === 1;
                  },
                  get children() {
                    var _el$82 = _$createElement("box");
                    _$setProp(_el$82, "flexGrow", 1);
                    _$setProp(_el$82, "flexBasis", 0);
                    return _el$82;
                  }
                }), null);
                return _el$81;
              })()
            }), _$createComponent(Show, {
              get when() {
                return skillRows().length > MAX_SKILL_ROWS;
              },
              get children() {
                var _el$39 = _$createElement("box"),
                  _el$40 = _$createElement("text");
                _$insertNode(_el$39, _el$40);
                _$setProp(_el$39, "flexDirection", "row");
                _$setProp(_el$39, "onMouseDown", () => setSkillsExpanded(value => !value));
                _$setProp(_el$39, "onMouseOver", () => setSkillsMoreHovered(true));
                _$setProp(_el$39, "onMouseOut", () => setSkillsMoreHovered(false));
                _$insert(_el$40, (() => {
                  var _c$3 = _$memo(() => !!skillsExpanded());
                  return () => _c$3() ? "− show less" : `+${hiddenSkills()} more`;
                })());
                _$effect(_$p => _$setProp(_el$40, "fg", skillsMoreHovered() ? theme.text.base : theme.text.feedback.info.base, _$p));
                return _el$39;
              }
            })];
          }
        }), null);
        _$effect(_p$ => {
          var _v$10 = theme.text.base,
            _v$11 = theme.text.base,
            _v$12 = theme.text.muted;
          _v$10 !== _p$.e && (_p$.e = _$setProp(_el$34, "fg", _v$10, _p$.e));
          _v$11 !== _p$.t && (_p$.t = _$setProp(_el$35, "fg", _v$11, _p$.t));
          _v$12 !== _p$.a && (_p$.a = _$setProp(_el$38, "fg", _v$12, _p$.a));
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined
        });
        return _el$31;
      }
    }), null);
    return _el$;
  })();
}
export default Plugin.define({
  id: "sidebar.plus",
  setup(context) {
    return context.ui.slot({
      append: "sidebar.content",
      render: ({
        sessionID
      }) => _$createComponent(Sidebar, {
        sessionID: sessionID
      })
    });
  }
});