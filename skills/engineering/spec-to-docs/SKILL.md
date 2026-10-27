---
name: spec-to-docs
description: Create or update the application's manual in docs/manual from the specs and the code. Markdown pages linked together, with an index page, screenshots and diagrams, written for the people who use the application. Use when the user asks to write or update the manual or the user documentation.
---

Write the manual of the application in `docs/manual/`: a set of Markdown pages linked together, starting from an index, that lets someone who has never seen the application learn to use it and find any answer quickly. If the manual already exists, bring it up to date.

## Who the manual is for

The manual is for the people who use the application, not for the people who build it (they have the specs and `AGENTS.md`). Work out who they are from the specs and the code: end users and administrators for an application with a UI, integrators for an API, operators for a CLI or a service. When the application has several kinds of users, give each one a clear path through the manual.

Write the manual in the language of the application's interface. When that is unclear, ask the user.

## Sources

- **Specs** in `docs/specs/`: what the application does, its rules, limits and flows.
- **Code**: what is actually shipped, and the exact labels, menu names, field names, messages and commands users see.
- **Glossary** in `docs/CONTEXT.md`: the terms to use consistently.
- **Tasks** in `docs/tasks/`: a task with status `to-do` or `in-progress` means some of its behaviour may already be in the specs but not in the code yet.

The manual documents what users can do today. When a spec and the code disagree, the code decides what goes in the manual, and the disagreement goes in the final report.

## Process

1. Read the specs, the glossary, `AGENTS.md` and the existing manual, if there is one. Explore the code for the user-facing surface: routes and screens, navigation, forms, roles and permissions, settings, emails and notifications, commands, API endpoints, error messages.
2. Plan the structure (see below). When creating the manual, show the user the proposed table of contents and adjust it to their feedback before writing. When updating, map each change to the pages it affects.
3. Run the application and capture the screenshots (see below).
4. Write the pages. On a large application, write sections in parallel sub-agents once the structure is agreed, giving each one its section, its sources, the path to this skill and the screenshots folder.
5. Update the index and the navigation links so every page is reachable and every link works.
6. Check the result: every relative link and image path resolves to a file, every page is listed in the index, every screenshot in `images/` is used by some page.
7. Report what was created and updated, the screenshots taken or missing, and any disagreement found between specs and code.

## Structure

```
docs/manual/
├── README.md                 ← introduction and index
├── getting-started.md
├── <topic>.md
├── <section>/                ← a folder when a section has several pages
│   ├── README.md             ← section overview and its page list
│   └── <topic>.md
├── glossary.md
├── troubleshooting.md
└── images/
    └── <page-slug>/<what-it-shows>.png
```

- **README.md** introduces the application in a few sentences (what it is, who it is for, what you can do with it) and lists every page in reading order, grouped by section, each with a one-line description. If there are several kinds of users, it also offers a "Where to start" path for each.
- **getting-started.md** takes a new user from zero to their first useful result: access, sign-in, a tour of the main screen, the first core task.
- **Topic pages** are organised around what users want to do ("Invite your team", "Export invoices"), grouped in sections that follow the main areas of the application. One page per topic, short enough to read in a few minutes.
- **glossary.md** explains the domain terms from `docs/CONTEXT.md` in the users' words, leaving out the purely internal ones.
- **troubleshooting.md** collects the error messages and common problems users meet, each with its cause and fix.
- Add reference pages when the application needs them: roles and permissions, settings, limits and quotas, keyboard shortcuts, API or CLI reference.

Use kebab-case file names. The order of the pages lives in the index, not in the file names.

## Pages

Each page follows this shape:

<page-template>

[Manual](../README.md) › {Section}

# {Title: what the user wants to do or understand}

{One or two sentences: what this page covers and when you need it.}

{Who can do it, when it depends on a role or a plan.}

## {Step or sub-topic}

{Numbered steps for procedures, one action per step, with the result the user sees. A screenshot where it helps the user find their way.}

![{What the screenshot shows}](../images/{page-slug}/{what-it-shows}.png)

## Related

- [{Page}]({link}): {one line on why it's relevant}

---

← [{Previous page}]({link}) · [Next page]({link}) →

</page-template>

- Write UI labels in bold, exactly as the interface shows them: click **Save changes**.
- Explain concepts before procedures that rely on them, and link to the page that explains them.
- Use Mermaid diagrams for flows and lifecycles users need to understand, such as the states of an order.
- Use tables for reference material: permissions per role, settings and their effect, limits.
- For a CLI or an API, show real commands, requests and responses in code blocks, taken from running them.
- Use callouts sparingly, for what the user really must notice: `> **Note:**` and `> **Warning:**`.

## Screenshots

Capture them from the running application with the browser automation available (for example Playwright), using the commands in `AGENTS.md` to start it. If you can't start it or sign in, ask the user.

- Use realistic, fictional demo data: believable names, amounts and dates, never real personal data, secrets or tokens. Seed it if the project has seed scripts.
- Keep every screenshot consistent: the same viewport (1280×800), theme and demo account.
- Capture the whole screen for overviews and only the relevant element for a specific form, dialog or menu.
- To point at a control, outline it with a temporary CSS style before capturing.
- Save to `images/<page-slug>/<what-it-shows>.png` and give each image alt text describing what it shows.
- When updating the manual, recapture the screenshots of every screen that changed.

When a screenshot can't be captured, leave an HTML comment in its place (`<!-- screenshot: what it should show -->`) and list it in the final report.

## Writing

Write like a person explaining the application to a new colleague: plain words, short sentences, and the second person ("you"). Go straight to what the reader needs.

- Describe what the application does and what the user can do. When something is limited, say what is possible: "You can upload files up to 10 MB."
- Punctuate with commas, colons, semicolons, parentheses or a full stop. Leave em dashes (—) out entirely.
- Use an emoji only when it carries information a reader would otherwise miss.
- Use the glossary terms, and the users' words over internal ones: "workspace", not "tenant".
- Keep filler and hype out: "simply", "just", "easily", "powerful", "seamless".

## Updating an existing manual

Keep what is still correct, including content written by hand. Update the pages whose behaviour, labels or screens changed, add pages for new capabilities, and remove the pages and images of what the application no longer offers, together with the links pointing to them. If the existing manual follows a different structure, propose the restructuring to the user before moving pages.
