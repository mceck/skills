# OpenCode Sidebar

The OpenCode TUI counterpart of [`plugins/sidebar`](../sidebar), which is the
Claude Code plugin. It shows the session title, the model and effort in use,
context usage and cost, subagents, working-tree changes, commits, MCP servers
and skills.

## Install

```sh
opencode plugin add 'github:mceck/skills#main::path:plugins/opencode-sidebar'
```

`::path:plugins/opencode-sidebar` selects the plugin package inside the
repository; without it OpenCode would install the repository root.

Verify the installation with:

```sh
opencode plugin list
```

If you prefer to keep the plugin CLI-only, add the same spec to
`~/.config/opencode/cli.json` instead:

```json
{
  "plugins": [
    "-opencode.sidebar.context",
    "-opencode.sidebar.mcp",
    "github:mceck/skills#main::path:plugins/opencode-sidebar"
  ]
}
```

OpenCode resolves `@opencode/plugin/tui` at runtime, so the plugin needs no
`node_modules` of its own.

## Development

Edit `tui.tsx` and reload the configuration:

```sh
opencode reload
```

The plugin entrypoint is the `./tui` export in `package.json`.
