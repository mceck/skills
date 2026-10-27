---
name: write-spec
description: "Write or update the living specs in docs/specs. Use whenever a task is written, work is implemented, or a decision changes what the system does or how it is built, so the affected specs stay current. Also use when the user asks to write, update or document a spec."
---

A spec describes in detail what one area of the system does and the architectural decisions behind it. It is the shared, lasting understanding of the system: what anyone working on the project reads before touching an area, and what keeps every change consistent with the ones before it.

Specs are living documents. They describe the system as it is (or as the task being written will make it), and they are updated as the system changes, never rewritten from scratch per feature.

## Where specs live

Specs live in `docs/specs/`, one file per area, named after the area in kebab-case: `authentication.md`, `billing.md`, `notifications.md`.

An area is a part of the system broad enough to deserve its own document: a domain (billing, catalogue), a cross-cutting capability (authentication, search), or a major component (the sync engine, the public API).

- A change to an existing area updates that area's spec. A single change often touches several areas: update every affected spec, and create new ones where needed, all in the same change.
- A new spec is created when the work introduces an area that no existing spec covers and that is broad enough to stand on its own. A smaller addition becomes a new section in the closest spec.
- A spec that has grown to cover several unrelated concerns is split into one spec per concern, with links between them.

## Process

1. Read `docs/CONTEXT.md` and list `docs/specs/`. Read the specs of the areas the change touches, and the code where the spec and the change need checking against reality.
2. Map the change to areas: decide which specs it affects (often more than one), and which new ones it needs. Work through every affected spec, editing existing ones and adding new ones as required.
3. Edit in place. Rewrite the sections the change touches so each spec reads as one coherent description of the current system. Superseded statements are replaced, so the text always states the current truth; git keeps the history.
4. Record every architectural decision the change makes in the spec's Decisions section, with its rationale.
5. When a behaviour or decision is still open, ask the user before writing it down.
6. Use the glossary terms from `docs/CONTEXT.md` throughout. A new domain term goes into `docs/CONTEXT.md` (see the `domain-modeling` skill).
7. Link related specs to each other, including the ones touched by the same change.

## What belongs in a spec

- The purpose and responsibility of the area.
- Behaviour, in detail: capabilities, use cases, flows, business rules, roles and permissions, states and transitions, how each edge case is handled.
- Concrete values: limits, durations, formats, sizes, quotas.
- Architecture: the components involved, their responsibilities, how they interact, data flows, external integrations.
- The data model at the conceptual level: entities, key attributes, relationships, lifecycle.
- Non-functional requirements with concrete targets: performance, security, privacy, availability, observability.
- Architectural decisions with their rationale.
- Diagrams (Mermaid) wherever a flow, a state machine or a structure reads better as a picture.

## What stays out of a spec

- **Code.** No code snippets, file paths, or function names: refer to components and modules by their role. Mermaid diagrams are welcome.
- **Task material.** Acceptance criteria, checklists, implementation steps, test plans and anything else that only matters while building one piece of work belong in the task (see the `write-task` skill).
- **History.** No changelogs, dates, "updated in", or references to tasks.

## Write what the system does

A spec describes what the application and each feature do: who does what, what happens, what the user sees, what the system stores, sends or returns. Every sentence, in every section, states expected behaviour.

When a sentence comes out as a restriction ("does not", "cannot", "never", "must not", "is not allowed"), look for the positive rule behind it and write that instead: who can, what is accepted, what happens in its place. Something the system simply doesn't do has no place in the spec at all.

| Instead of | Write |
| --- | --- |
| Users cannot delete other users' comments. | A comment can be deleted by its author and by workspace admins. |
| The API does not accept files over 10 MB. | The API accepts files up to 10 MB and answers larger uploads with `413` and the size limit. |
| Guests don't have access to billing. | Billing is available to the workspace owner and to members with the Billing role. |
| Reminders are never sent at night. | Reminders are sent between 08:00 and 20:00 in the recipient's time zone; a reminder due outside that window goes out at 08:00. |
| Out of scope: offline mode. | _(Leave it out: the spec describes what the system does.)_ |

## Write like a person

Write the spec the way an experienced engineer explains the system to a new colleague: plain, direct sentences that read naturally when spoken aloud. A spec that sounds generated is harder to trust and harder to read.

- Use plain words and concrete facts. Prefer "Orders are cancelled after 30 minutes without payment" to "The system leverages a robust timeout mechanism to seamlessly handle unpaid orders".
- Keep sentences short, one idea each, and group them in paragraphs. Use bullets for lists of rules, values or steps, and prose for explanations.
- Punctuate with commas, colons, semicolons, parentheses or a full stop. Leave em dashes (—) out of the spec entirely, and en dashes too unless they mark a range.
- Keep text plain. Use an emoji only when it carries information a reader would otherwise miss, such as the legend of a status table; headings, bullets and prose stay emoji-free.
- Go straight to the point. Filler ("it's worth noting that", "in order to", "basically") and hype ("powerful", "seamless", "robust", "cutting-edge") add length and no information.
- Use the declarative present tense: "The system sends a reminder 24 hours before the due date."
- Be precise and detailed: a reader can answer "what happens if…" for any situation in the area from the spec alone.
- State each decision with its reason, and the alternatives considered when their rejection is non-obvious.
- Drop sections with nothing to say, and add area-specific sections when the area needs them.

Before saving, reread the spec as its reader would: replace every em dash, rewrite every restriction as the positive behaviour, and simplify any sentence you would not say out loud to a colleague.

## What qualifies as a decision

Record a decision when it is hard to reverse, would surprise a future reader without context, or is the outcome of a real trade-off. Typical examples: architectural shape, integration patterns between areas, technology choices that carry lock-in, ownership of data, deliberate deviations from the obvious path, and constraints invisible in the code (compliance, partner contracts).

## Template

See [example.md](example.md) for a complete spec written with this template.

<spec-template>

# {Area name}

{One paragraph: what this area of the system is, what it is responsible for, and why it exists.}

## Concepts

{The main domain concepts of this area and how they relate. Use the glossary terms from `docs/CONTEXT.md`; add here the details specific to this area.}

## Behaviour

{The core of the spec: one subsection per capability or use case. For each one describe the actors, what triggers it, the flow, the business rules, the states involved and how every edge case is handled. Use diagrams for non-trivial flows and state machines.}

### {Capability}

## Architecture

{The components involved, their responsibilities and how they interact; data flows; external services and integrations.}

## Data model

{Entities, their key attributes, relationships and lifecycle, at the conceptual level.}

## Non-functional requirements

{Performance, security, privacy, availability, scalability, observability: each with a concrete target.}

## Decisions

{One entry per architectural decision: **the decision**, followed by its rationale and, when useful, the alternatives considered.}

## Related specs

{Links to the specs of related areas, with one line on how they relate.}

</spec-template>
