---
name: write-task
description: "Write a task in docs/tasks: a detailed unit of work with problem statement, solution, user stories, decisions and acceptance criteria. Use when the user asks to write, create or plan a task, or to turn the current conversation or plan into a task."
---

A task describes one unit of work in enough detail that it can be implemented without further questions. Tasks live in `docs/tasks/`, and the `implement` skill works from them.

## Scope

Write one task per user request, even a large one: a task can cover a whole feature end to end. Split a request into several tasks only when it is genuinely complex and made of parts that can be delivered and verified independently. Each of those tasks is then self-contained and names the tasks it depends on in its Further Notes.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Read `docs/CONTEXT.md` and the specs in `docs/specs/` for the areas the work touches, and use the glossary vocabulary throughout the task.

2. Sketch out the seams at which you're going to test the work. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

3. The task should be comprehensive and cover every aspect of the work. It should be written so that a developer can implement it without needing to ask any questions. If there are any ambiguities, clarify them with the user before writing the task.

4. Write the task to `docs/tasks/YYYY-MM-DD-<slug>.md` (today's date, kebab-case title) using the template below, with `status: to-do`.

5. Call the Skill tool with "write-spec" to bring the affected specs in line with the behaviour and decisions in the task, and link them in the task's Specs section. Lasting knowledge (behaviour, rules, architecture, decisions) belongs in the specs; the task keeps what matters to deliver this piece of work.

6. Once the task and specs are written, ask the user whether to start the implementation now with the "implement" skill. Do not start it until they say yes.

## Status

The `status` in the frontmatter is one of:

- `to-do`: written, not started.
- `in-progress`: being implemented.
- `done`: implemented, reviewed and committed.

Whoever works on the task updates the status as soon as it changes.

## Template

See [example.md](example.md) for a complete task written with this template.

<task-template>

---
status: to-do
---

# {Task title}

## Specs

Links to the specs this task creates or updates, e.g.
[Authentication](../specs/authentication.md)

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the work.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- The seams agreed with the user, and what each one covers
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Acceptance Criteria

A checklist of verifiable criteria the work must meet to be considered complete. The implementer ticks each one as it is met.

- [ ] {criterion}

## Out of Scope

A description of the things that are out of scope for this task.

## Further Notes

Any further notes about the work, including the tasks this one depends on.

</task-template>
