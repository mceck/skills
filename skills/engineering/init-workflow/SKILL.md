---
name: init-workflow
description: Set up a repository for the spec/task workflow, creating docs/specs, docs/tasks, docs/CONTEXT.md and the agent instructions. On an existing project, derives the specs and glossary from the code.
disable-model-invocation: true
---

Prepare this repository for the spec/task workflow, which keeps three kinds of documents:

- `docs/specs/`: the living specs, one per area of the system (see the `write-spec` skill).
- `docs/tasks/`: one task per unit of work, with its status (see the `write-task` skill).
- `docs/CONTEXT.md`: the domain glossary (see the `domain-modeling` skill).

Inspect what exists before writing anything, and fill only the gaps: running this again on a set-up repository updates what is there and leaves the rest as it is.

## 1. Survey the repository

Work out:

- Whether the project already has application code, or is new.
- The stack, the package manager, and the commands to install, run, build, typecheck, lint and test (single file and full suite). Confirm each command exists (package scripts, Makefile, task runner) before relying on it.
- The agent instructions files at the root: `AGENTS.md`, `CLAUDE.md`.
- Existing documentation that plays the role of specs, tasks, decisions or glossary: `docs/specs/`, `docs/spec/`, `specs/`, `docs/adr/`, a root `CONTEXT.md`, design documents, PRDs, feature write-ups.

## 2. Create the folders

Create `docs/specs/` and `docs/tasks/` when missing, each with a `.gitkeep` so git tracks it while it is empty.

## 3. Agent instructions

Add the workflow section below to the agent instructions, or bring it up to date if it is already there:

- `AGENTS.md` exists: add the section to `AGENTS.md`.
- Only `CLAUDE.md` exists: add the section to `CLAUDE.md`.
- Neither exists: create `AGENTS.md` with a project guide followed by the workflow section, and create `CLAUDE.md` containing only `@AGENTS.md`.

A new `AGENTS.md` is compact and concrete: what someone needs to start working on the project, written as short bullets.

- What the project is, in one or two sentences.
- Stack and key dependencies.
- Commands: install, run, build, typecheck, lint, test (single file and full suite).
- Layout: the top-level directories and what lives in each.
- Conventions the code follows that tooling and config don't already make obvious.

For a new project with no code yet, write only what is already known; the guide grows with the project.

The workflow section:

```md
## Workflow

This project is developed spec-first with the `write-spec`, `write-task`, `grill-with-task` and `implement` skills.

- `docs/specs/`: living specs, one per area of the system, describing in detail what it does and the architectural decisions behind it. Every change to behaviour or architecture updates the affected specs in the same change, using the `write-spec` skill.
- `docs/tasks/`: one file per unit of work. Keep the `status` in its frontmatter (`to-do`, `in-progress`, `done`) current while working on it.
- `docs/CONTEXT.md`: the domain glossary. Use its terms in code, specs and tasks.
```

## 4. Glossary

On an existing project without `docs/CONTEXT.md`:

- If a `CONTEXT.md` exists elsewhere in the repo, move it to `docs/CONTEXT.md`.
- Otherwise write `docs/CONTEXT.md` from the code: the domain terms found in models, schemas, API names, UI copy and existing docs, using the format of the `domain-modeling` skill. Where the code uses several names for one concept, pick the canonical one, list the others under `_Avoid_`, and point it out in the final report.

The glossary comes before the specs, so the specs are written in its terms. A new project starts without a glossary: `docs/CONTEXT.md` is created when the first term is settled.

## 5. Specs

On an existing project, look at what the survey found.

**No specs.** Derive them from the code:

1. Map the system into areas, each broad enough for its own spec (see the `write-spec` skill). Show the user the proposed list of spec files, one line each, and adjust it to their feedback.
2. Call the Skill tool with "write-spec" and write each spec from a thorough reading of its area: entry points, routes and handlers, domain models, schemas and migrations, background jobs, configuration, integrations, and the tests, which often state intended behaviour most clearly. Capture the concrete rules, limits, states, permissions and decisions the code embodies, in full detail. When the intent behind some behaviour is unclear, describe the behaviour as implemented and collect the question for the final report.
3. On a large codebase, hand areas to parallel sub-agents, giving each one its area, the path to the `write-spec` skill, and `docs/CONTEXT.md`.

**Specs in a different format** (another folder, per-feature documents, ADRs, design docs). Show the user what you found and ask whether to rewrite them in the `write-spec` format. If they agree:

- Rewrite them into area specs in `docs/specs/`, merging documents that cover the same area and carrying over every piece of lasting information.
- Per-feature documents with user stories or acceptance criteria are tasks in disguise: fold their lasting content (behaviour, rules, decisions) into the area specs.
- Fold each ADR into the Decisions section of the spec it concerns.
- Check the rewritten specs against the code, and report where they disagree.
- Ask the user before deleting the originals.

If they decline, leave the existing documents as they are; new specs go to `docs/specs/`.

**Specs already in `docs/specs/` in this format.** Leave them as they are, and report any disagreement with the code you notice along the way.

## 6. Report

Summarise what was created and updated, the specs written, the glossary conflicts found, and the open questions collected along the way.
