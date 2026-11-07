# mceck plugins

Mattia Cecchini's Claude Code and OpenCode plugins: engineering skills and a live sidebar.

## Install

```bash
/plugin marketplace add mceck/skills
/plugin install mceck-skills@mceck
/plugin install sidebar@mceck
```

The marketplace lists two independent plugins. Install either one or both.

### OpenCode

The OpenCode TUI sidebar lives in `plugins/opencode-sidebar`:

```sh
opencode plugin add 'github:mceck/skills#main::path:plugins/opencode-sidebar'
```

## What is inside

- **mceck-skills**: agent skills for real engineering — `init-workflow`, `write-spec`, `write-task`, `implement`, `tdd`, `task-review`, `find-bugs`, `security-check`, `write-docs`, `domain-modeling`, `grilling`, `grill-me`, `monade-manutenzione`.
- **sidebar**: a pane showing chat title, context usage and cost, working-tree changes, commits, MCP servers and skills used. It opens at session start; toggle it with `/sidebar`.
- **opencode-sidebar**: the OpenCode TUI counterpart of the sidebar, installed with the command above.

## Local development

Link the skills into your local harness directories with `scripts/link-skills.sh`, and check the marketplace and plugins with:

```bash
claude plugin validate .
claude plugin validate plugins/sidebar
```
