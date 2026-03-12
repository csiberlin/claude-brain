## Knowledge Base

You have access to a persistent knowledge base via MCP tools (`brain_add`, `brain_search`, `brain_update`, `brain_delete`, `brain_consolidate`). Use it proactively — **not when asked, but automatically**.

### Token-Efficient Design

Two tiers of knowledge — brain is primary, CLAUDE.md is for rules only:

1. **CLAUDE.md files** — Rules and conventions ("always do X", "never do Y"). Loaded every message, so keep concise. Only promote brain entries here if they prescribe behavior.
2. **Brain (MCP)** — Everything else: architecture details, debugging gotchas, API quirks, patterns. Searched on demand via `brain_search`. Zero token cost when not needed.

**Auto memory (`MEMORY.md`)** is loaded every message — keep it under 10 lines. Do NOT move brain content here. It exists only for meta-instructions, not knowledge storage.

### Before Starting Work
- Call `brain_search` with keywords relevant to the task (project name, technology, problem domain)
- Check for existing patterns, past bugs, or architectural decisions that apply

### During Work — Mandatory Storage Triggers
After ANY of the following events, call `brain_add` immediately:

1. **You resolve a build/compile error** — store the error cause and fix (category: `debugging`)
2. **You discover an API quirk or gotcha** — e.g., namespace collisions, unexpected property names (category: `api`)
3. **You establish a pattern used across multiple files** — e.g., how messages are plumbed (category: `pattern`)
4. **You make or encounter an architectural decision** — e.g., which ViewModel owns which data (category: `architecture`)
5. **You learn a configuration detail** — e.g., solution file location, build commands (category: `config`)
6. **You work around a framework limitation** — e.g., using aliases for type conflicts (category: `debugging`)

**Rule of thumb:** If you had to figure something out (it wasn't obvious from the code alone), store it.

### What Makes a Good Entry
- **Title:** Short, searchable (e.g., "DevExpress WPF: ColumnDefinition name collision")
- **Content:** Specific and actionable — include the fix, not just the problem. Include file paths when relevant.
- **Tags:** Technology names, project names, error codes, concepts
- **Project:** Set the project identifier when the knowledge is project-specific

### Knowledge Promotion (Brain to CLAUDE.md)
A promotion candidate must meet ALL criteria:
- Category is `architecture`, `pattern`, or `config`
- Created more than 7 days ago
- Has a project tag (not general)
- Prescribes behavior, not just describes it
- Not already in CLAUDE.md

Use `/brain-sync` to review candidates. During `/goodbye` or `/exit`, flag candidates but do not auto-promote. After promoting, delete the brain entry.

### Before Session Ends
When the session is wrapping up, use `/goodbye` or `/exit` to dispatch consolidation.

Categories: `pattern`, `debugging`, `api`, `config`, `architecture`, `general`
