# Sidebar

A Claude Code plugin that adds a live sidebar pane: chat title, context usage and cost, working-tree changes, commits, MCP servers and the skills used in the session.

The pane opens at session start and can be toggled with `/sidebar`.

## Install

From the `mceck` marketplace:

```bash
/plugin install sidebar@mceck
```

For local development, from the repository root:

```bash
claude --plugin-dir plugins/sidebar
```

## Development

```bash
claude plugin validate plugins/sidebar
```
