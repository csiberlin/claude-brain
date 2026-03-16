Initialize the knowledge base for this project. Do the following steps:

## Step 0: Upgrade detection

1. Read the project's CLAUDE.md file (in the current working directory). If there is no project CLAUDE.md, skip to Step 1.
2. Scan for **old tool names** and replace them in-place:
   - `brain_add` → `brain_upsert`
   - `brain_update` → `brain_upsert`
   - `brain_list_tags` → `brain_info`
   - `brain_consolidate` → `brain_maintain`
3. Scan for **old category names** and replace them in-place:
   - `debugging` → `pattern`
   - `config` → `decision`
   - `architecture` → `map`
   - `general` → `pattern`
   (Only replace these when they appear as brain/knowledge-base category values, not as general English words.)
4. Scan for **old slash command references** and update them:
   - References to `/goodbye` should note it is now an alias for `/brain-keep`
   - References to `/brain-sync` remain valid
5. Report what was upgraded in the final summary (Step 3).

## Step 1: Enable automatic brain usage

1. Read `~/.claude/CLAUDE.md`. If it doesn't exist, create it.
2. Check if it already contains a `## Knowledge Base` section. If it does, replace it with the minimal reference below. If it doesn't, append it.

```
## Knowledge Base

You have access to a persistent knowledge base via MCP tools.

**Before work:** Call `brain_search` to check for maps and prior knowledge about the area you're working in.

**During work:** Call `brain_upsert` directly when you discover something non-obvious. Entries default to `speculative` status (except `api` category, which defaults to `confirmed`). Set `confirmed: true` when the user explicitly asks to remember something.

**After expensive work:** When you perform web research, multi-step API exploration, or deep code comprehension that consumed significant effort, store the results immediately via `brain_upsert` — re-acquiring this knowledge in a future session would be wasteful.

**What NOT to store:** routine fixes, things derivable from code or git, exploration that led nowhere.

**Tiers:** `map` (compressed file/module/API summaries), `decision` (non-obvious choices and their why), `pattern` (proven approaches and anti-patterns), `api` (external library/service knowledge from research).

**At session end:** Use `/brain-keep` to promote speculative entries to confirmed, or `/brain-abandon` if the session was a dead end. Use `/exit` for consolidation only.
```

3. If `~/.claude/CLAUDE.md` contains an old `@knowledge-base.md` import line, remove it — that pattern is deprecated in favor of the inline section above.
4. If `~/.claude/knowledge-base.md` exists, delete it — its content is now available via `/brain-knowledge`.

## Step 2: Migrate project knowledge from CLAUDE.md to brain

1. Read the project's CLAUDE.md file (in the current working directory). If there is no project CLAUDE.md, skip to Step 3.
2. Identify sections that contain **detailed project knowledge** — architecture deep dives, debugging tips, API quirks, specific patterns, configuration details, known gotchas. These are migration candidates.
3. Identify sections that should **stay in CLAUDE.md** — build/run commands, coding conventions, brief project overview, file structure summaries. These are essentials that are needed almost every message.
4. For each migration candidate, call `brain_upsert` with:
   - A concise, searchable title
   - The full, specific content (don't summarize — preserve the detail)
   - Relevant tags (technology names, file paths, concepts)
   - The appropriate category: `map`, `decision`, `pattern`, or `api`
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

Available commands:
- `/brain-knowledge` — quick reference for when and how to store knowledge
- `/brain-sync` — promote stable brain entries back to CLAUDE.md
- `/brain-keep` — flush insight buffer and end session
- `/brain-abandon` — dead-end session: keep general knowledge, discard impl details
- `/exit` — consolidate knowledge (warns if buffer non-empty)
- Use `brain_search` with `detail: "full"` to retrieve complete entry content
- Use `brain_info` to see entry counts, embedding coverage, and DB size
