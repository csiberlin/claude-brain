Initialize the knowledge base for this project. Do the following steps:

## Step 1: Enable automatic brain usage

1. Read `~/.claude/knowledge-base.md`. If it doesn't exist, create it with the following content:

```
## Knowledge Base

You have access to a persistent knowledge base via MCP tools (`brain_add`, `brain_search`, `brain_update`, `brain_delete`, `brain_consolidate`). Use it proactively — **not when asked, but automatically**.

### Before Starting Work
- Call `brain_search` with keywords relevant to the task (project name, technology, problem domain)
- Check for existing patterns, past bugs, or architectural decisions that apply

### During Work — Mandatory Storage Triggers
After ANY of the following events, call `brain_add` immediately:

1. **You resolve a build/compile error** — store the error cause and fix (category: `debugging`)
2. **You discover an API quirk or gotcha** — e.g., namespace collisions, unexpected property names, missing methods (category: `api`)
3. **You establish a pattern used across multiple files** — e.g., how messages are plumbed, how columns flow through ViewModels (category: `pattern`)
4. **You make or encounter an architectural decision** — e.g., which ViewModel owns which data, how DI is structured (category: `architecture`)
5. **You learn a configuration detail** — e.g., solution file location, build commands, project structure (category: `config`)
6. **You work around a framework limitation** — e.g., using `using` aliases for type conflicts, using `EditSettings` instead of direct property (category: `debugging`)

**Rule of thumb:** If you had to figure something out (it wasn't obvious from the code alone), store it. Future sessions start fresh — anything not stored is lost.

### What Makes a Good Entry
- **Title:** Short, searchable (e.g., "DevExpress WPF: ColumnDefinition name collision with Shared namespace")
- **Content:** Specific and actionable — include the fix, not just the problem. Include file paths when relevant.
- **Tags:** Technology names, project names, error codes, concepts (e.g., `devexpress`, `wpf`, `gxreport`, `namespace-collision`)
- **Project:** Set the project identifier when the knowledge is project-specific

### Before Session Ends
When the user says goodbye, ends the conversation, or you sense the session is wrapping up:
1. Call `brain_consolidate` to review all entries
2. Clean up: delete outdated entries, merge redundancies, resolve contradictions
3. You can also use `/goodbye` or `/exit` to trigger this

Categories: `pattern`, `debugging`, `api`, `config`, `architecture`, `general`
```

2. Read `~/.claude/CLAUDE.md`. If it doesn't exist, create it with just `@knowledge-base.md`.
3. If `~/.claude/CLAUDE.md` exists but does NOT contain `@knowledge-base.md`, append `@knowledge-base.md` to the end.
4. If `~/.claude/CLAUDE.md` contains an old inline "## Knowledge Base" section, remove it (the reference to `knowledge-base.md` replaces it).

## Step 2: Migrate project knowledge from CLAUDE.md to brain

1. Read the project's CLAUDE.md file (in the current working directory). If there is no project CLAUDE.md, skip to Step 3.
2. Identify sections that contain **detailed project knowledge** — architecture deep dives, debugging tips, API quirks, specific patterns, configuration details, known gotchas. These are migration candidates.
3. Identify sections that should **stay in CLAUDE.md** — build/run commands, coding conventions, brief project overview, file structure summaries. These are essentials that are needed almost every message.
4. For each migration candidate, call `brain_add` with:
   - A concise, searchable title
   - The full, specific content (don't summarize — preserve the detail)
   - Relevant tags (technology names, file paths, concepts)
   - The appropriate category: `architecture`, `debugging`, `api`, `config`, `pattern`, or `general`
5. After all entries are added, rewrite the project's CLAUDE.md to keep only the essentials. The slimmed-down file should contain:
   - Project name and one-line description
   - Build/run/test commands
   - Coding conventions and style rules
   - A brief structural overview (entry points, key directories) — not full architecture docs
   - A note that detailed knowledge lives in the brain (searchable via `brain_search`)

## Step 3: Report

Summarize what was done:
- Whether auto-usage was enabled or was already enabled
- How many entries were migrated from CLAUDE.md to the brain (list titles)
- What was kept in CLAUDE.md
- Mention `/goodbye` and `/exit` for end-of-session consolidation
