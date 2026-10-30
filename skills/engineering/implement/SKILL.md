---
name: implement
description: "Implement work based on a task in docs/tasks. Do not trigger this for every user implementation request, only for tasks in docs/tasks or when explicitly requested by the user."
---

Implement the work described by the user: a task in `docs/tasks/`, or the plan agreed in the conversation.

If there is no task and the work has not been discussed with the user yet in this conversation, call the Skill tool twice, for "grilling" and "domain-modeling", and ask the user if he wants to create a new task with `write-task` skill, and only continue once we have reached a shared understanding.

When working from a task, set its `status` to `in-progress` before starting, and read the specs it links.

Call the Skill tool with "tdd" where possible. When working from a task, test at the seams in its Testing Decisions.

Run typechecking regularly, single test files regularly, don't run the full test suite while implementing.

Call the Skill tool with "write-spec" to bring `docs/specs/` in line with what was built, including any decision that changed along the way.

Once done, call the Skill tool with "task-review" to review the work, fix the issues found and then run the full test suite.

When working from a task, tick its acceptance criteria and set its `status` to `done`.

Commit your work to the current branch.

If the work changed something the application's users see, ask the user whether to update the manual in `docs/manual/`. If they agree, call the Skill tool with "write-docs" and commit the manual update as well.
