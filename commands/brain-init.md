Initialize the knowledge base for this project. Do the following steps:

## Step 1: Enable automatic brain usage

1. Read `~/.claude/CLAUDE.md`. If it doesn't exist, create it.
2. If a "## Knowledge Base" section is NOT already present, append the following section to the end of the file:

```
## Knowledge Base

You have access to a persistent knowledge base via MCP tools. Use it proactively:

**During work:** When you discover a pattern, solve a tricky bug, learn an API quirk, or make an architectural decision — call `brain_add` to store it. Don't wait to be asked. Before starting work, call `brain_search` to check for relevant existing knowledge.

**Before session ends:** When the user says goodbye, ends the conversation, or you sense the session is wrapping up — call `brain_consolidate` to review your knowledge entries. Clean up contradictions, merge redundancies, delete outdated entries using `brain_update` and `brain_delete`. You can also use `/goodbye` or `/exit` to trigger this.

**What to look for during consolidation:**
- Entries that contradict each other — keep the correct/newer one
- Redundant entries covering the same topic — merge into the better one
- Outdated information that no longer applies — delete it
- Entries that could be improved with recent learnings — update them

Categories: pattern, debugging, api, config, architecture, general
```

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
