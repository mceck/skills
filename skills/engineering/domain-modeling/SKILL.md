---
name: domain-modeling
description: Build and sharpen a project's domain glossary in docs/CONTEXT.md. Use when discussing codebase terminology, when new domain terms come up while designing, or when writing or editing docs/CONTEXT.md.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary down the moment terms crystallise. (Merely *reading* `docs/CONTEXT.md` for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

The glossary always lives in `docs/CONTEXT.md`, one file for the whole repository. Create it lazily: when the first term is resolved.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `docs/CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

### Update docs/CONTEXT.md inline

When a term is resolved, update `docs/CONTEXT.md` right there. Don't batch these up: capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

`docs/CONTEXT.md` should be totally devoid of implementation details. It is a glossary and nothing else: behaviour, rules and architectural decisions belong in the specs in `docs/specs/` (see the `write-spec` skill).
