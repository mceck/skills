---
name: find-bugs
description: "Hunt for bugs across the application section by section, searching the code with parallel sub-agents and using the running app to check what users see: reproduce each one with a failing test, fix it, and track the work in a report in docs/reports. Use when the user asks to find bugs, hunt for bugs or run a bug sweep."
disable-model-invocation: true
---

Hunt for bugs across the whole application, one section at a time, and keep track of the work in a report in `docs/reports/`.

## Before starting

Read the specs in `docs/specs/`: they describe the intended behaviour.

Look for previous reports in `docs/reports/bug-hunt-*.md`:

- **One has unticked sections**: resume it from the first unticked section. Don't start a new one.
- **All are complete**: start a new report with a different point of view. Read the previous reports, then cut the sections differently so the new pass doesn't re-check the same things the same way. If a previous pass went by feature area, go by cross-cutting concern (input validation, error handling and partial failures, concurrency and races, time and timezones, money and rounding, authorization, data limits and pagination), by layer (API, domain, persistence, background jobs, integrations), or by user journey across modules. Skip what the previous reports already fixed, unless the code changed since.
- **None**: start the first report.

## Sections

Split the application into sections. A section can be an area of the application, a module or integration, a structural part (persistence, auth, jobs, configuration) or a cross-cutting concern: pick the cut that fits this codebase. Each section should be small enough to read thoroughly in one pass. Order them by risk: the code where a bug costs most comes first.

Write the report at `docs/reports/bug-hunt-YYYY-MM-DD.md` (today's date; add `-2`, `-3` if one already exists for today), creating `docs/reports/` if needed:

```markdown
# Bug hunt YYYY-MM-DD

Point of view: <how the sections are cut, and how this differs from the previous reports>

## Sections

- [ ] <section 1>
- [ ] <section 2>

## Findings

### <section 1>

### <section 2>
```

## Searching in parallel

Search the sections for bugs with sub-agents, at most 3 running at a time, one section each, in the order of the list. When one returns, start the next unticked section, so 3 keep running until every section has been searched.

The sub-agents only search: they don't edit files, run tests or commit. Fixing stays with you, one section at a time, so tests, fixes and commits never collide in the working tree. Fix a section as soon as its search comes back, while the others keep searching.

Give each sub-agent:

- The section: its boundaries and its main files or directories.
- Where to read the intended behaviour: the specs that cover the section, `docs/CONTEXT.md` (if it exists).
- What the previous reports already fixed in this area, so it doesn't report it again.
- What to look for: bugs and unhandled edge cases. Wrong results, crashes, empty, missing or malformed input, boundaries and off-by-one, duplicates, ordering, timezones, rounding, races, retries, partial failures, leaks, missing authorization checks. Read the code carefully, following calls into other sections where the behaviour depends on them. Style, refactoring and performance are out of scope, unless the performance is so bad it breaks the feature.
- What to return, for each finding: where (`path/to/file:line`), the problem with the input or state that triggers it, the spec it contradicts (if any), and the seam where a test can reproduce it. "No bugs found" when there is nothing.

## Visual checks

Reading the code misses what only shows on screen. For each section the user sees, run the application and use it: whatever tools you have to drive it and take screenshots (the `run` skill, a browser automation tool, a simulator or emulator for mobile apps). Do this yourself, not in the sub-agents: they would share one running app and one browser.

Go through the section's flows as a user would, and also:

- The empty, loading and error states, and what happens when the server is slow or fails.
- Long text, missing images, many items, zero items.
- Narrow and wide screens, and dark mode if the application has one.
- Double clicks, the back button, reloading in the middle of a flow.
- Errors in the browser console and failed network requests, even when the screen looks fine.

Look at every screenshot you take. A visual finding joins the section's findings, and goes through the same steps below.

## Each section

When a section's search comes back:

1. **Check each finding against the code yourself.** A sub-agent's finding is a lead, not a verdict: drop the ones that don't hold up. Then run the visual checks for the section, if it has a UI.
2. **Sort what's left**, checking each finding against the specs:
   - **The code contradicts the specs, or is plainly wrong** (a crash, a corrupted value, an unhandled case that can't be intended): it's a bug, fix it.
   - **Fixing it would change behaviour the specs describe**, or the code follows the specs and the specs themselves are wrong: stop and ask the user. Fixes must not change what the specs say.
   - **It might be intended** (the specs don't cover it and the behaviour is plausible): don't touch it. Record it in the report as to confirm.
3. **For each bug, call the Skill tool with "tdd"**: write a test at the highest seam that reproduces the bug and watch it fail, then fix the code until it passes. If the test passes before the fix, there is no bug: drop the finding. If the area has no test harness, ask the user before setting one up. For a visual bug, write an end-to-end or component test if the project has them; otherwise take a screenshot before the fix and one after, and check that the second shows it fixed.
4. **Typecheck and run the test files you touched.**
5. **Update the report**: tick the section and fill its findings.
6. **Commit** the tests, the fixes and the report together, with a message naming the section and the bugs fixed.

Then move to the next section whose search has come back.

If a section needs the user (a spec problem), leave it unticked, ask, and keep fixing the other sections while you wait.

Write the findings of each section like this:

```markdown
### <section>

#### <short title of the bug>

- Where: `path/to/file:line`
- Problem: what goes wrong, and with which input or state.
- Test: `path/to/test`, "<test name>"
- Fix: what changed.
- Screenshots: before and after, for a visual bug.

#### <short title> (to confirm)

- Where: `path/to/file:line`
- Behaviour: what the code does.
- Why it might be a bug: …
- Why it might be intended: …
```

Save the screenshots of the findings in a folder next to the report with the same name (`docs/reports/bug-hunt-YYYY-MM-DD/`), and link them from the findings. Screenshots of what worked stay out of the repository.

When a section has no findings, write "No bugs found." under its heading, so the next pass knows it was checked.

## At the end

Run the full test suite and fix whatever broke. Then give the user a short summary: the bugs fixed per section, and the findings to confirm, which need their decision.
