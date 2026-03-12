# Token Efficiency & Search Improvements

## Goal

Reduce per-message token cost of the knowledge base integration and improve search quality with recency awareness, access tracking, and configurable output verbosity.

## Context

Research against community best practices and competing solutions revealed several gaps:
- `knowledge-base.md` (49 lines, ~700 tokens) is `@import`ed into every message of every project via `~/.claude/CLAUDE.md`, even when brain tools aren't used
- No `.claudeignore` to prevent context waste from `dist/`, `node_modules/`, WASM artifacts
- No compaction guidance — Claude doesn't know what to preserve during auto-compaction
- Search treats all entries equally regardless of age
- No access tracking or usage statistics
- Snippet length is hardcoded — no way to get full entry content from search

Key numbers from research:
- MEMORY.md: first 200 lines loaded, rest silently truncated
- CLAUDE.md: <100 lines "healthy", >200 "critical", 40K chars triggers warning
- `@import` files are loaded at startup (not lazy) — they cost tokens every message

---

## Part 1: Context Efficiency

### 1.1 `.claudeignore`

Create `.claudeignore` at project root:

```
dist/
node_modules/
*.wasm
*.onnx
```

Prevents Claude from reading build artifacts, dependencies, and model files when exploring the repo.

### 1.2 Compaction Guidance

Add one line to project `CLAUDE.md`:

```
When compacting context, preserve: list of modified files, current task state, active tool names.
```

### 1.3 Convert `knowledge-base.md` from `@import` to Slash Command

**Problem:** `knowledge-base.md` is injected into every message via `@knowledge-base.md` in `~/.claude/CLAUDE.md`. This costs ~700 tokens/message even in projects that don't use the brain.

**Solution:** Stop auto-loading. The full content already exists in `commands/brain-init.md` (verified — it contains the complete `knowledge-base.md` text, not a subset). Create a quick-reference slash command for on-demand access.

Changes:
- Create `commands/brain-knowledge.md` as a quick-reference for brain usage patterns (subset of knowledge-base.md: the "During Work" triggers and "What Makes a Good Entry" sections)
- Update `install.sh`:
  - Remove the block that copies `knowledge-base.md` to `~/.claude/` (step 4/5)
  - Remove the block that adds `@knowledge-base.md` to `~/.claude/CLAUDE.md` (step 4/5)
  - Add a new step that writes a minimal brain reference directly into `~/.claude/CLAUDE.md` if not already present
- Keep `knowledge-base.md` in repo as reference documentation, but it's no longer auto-loaded

**Replacement text for `~/.claude/CLAUDE.md`** (replaces `@knowledge-base.md`):

```markdown
## Knowledge Base

You have access to a persistent knowledge base via MCP tools. Use `brain_search` before starting work to check for relevant knowledge. Use `brain_add` to store insights, patterns, and solutions as you work. Use `/goodbye` or `/exit` at session end to consolidate.
```

This is 3 lines / ~50 tokens vs the previous 49 lines / ~700 tokens.

**Migration for existing users:** `install.sh` should:
1. Remove the `@knowledge-base.md` line from `~/.claude/CLAUDE.md` if present
2. Remove any existing `## Knowledge Base` section (from previous installs)
3. Append the new minimal section

**Token savings:** ~650 tokens/message for all projects.

### 1.4 Token Budget Documentation

Add a "Token Budget" section to `README.md` explaining:
- The two-tier model rationale with concrete numbers
- MEMORY.md 200-line truncation limit
- CLAUDE.md <100 line target
- 40K character warning threshold
- How `/brain-init` automates the migration

Add the key numbers to `ARCHITECTURE.md` in the existing "Design Goal: Token Efficiency" section.

---

## Part 2: Search & Data Improvements

### 2.1 `brain_stats` Tool

New read-only tool. No required params, optional `project` filter.

Output format (single compact block):
```
Knowledge Base Stats:
  Entries: 47 (38 with embeddings, 9 without)
  Projects: my-app(22), other-project(15), general(10)
  Categories: debugging(14), pattern(12), api(9), architecture(7), config(3), general(2)
  Tags: 23 unique
  DB size: 2.4 MB
  Never accessed: 5 entries
```

**Queries:**
- Entry count: `SELECT COUNT(*) FROM entries` (with optional project filter)
- Embedding coverage: `SELECT COUNT(*) FROM entries e LEFT JOIN embeddings emb ON e.id = emb.entry_id WHERE emb.entry_id IS NULL` for "without", total minus that for "with"
- Projects: `SELECT COALESCE(project, 'general') as p, COUNT(*) FROM entries GROUP BY project ORDER BY COUNT(*) DESC`
- Categories: `SELECT category, COUNT(*) FROM entries GROUP BY category ORDER BY COUNT(*) DESC`
- Tags: count unique tags by splitting comma-separated values (same `json_each` technique as `list-tags.ts`)
- DB size: `fs.statSync(dbPath).size` — use the same `~/.claude/knowledge.db` path from `db.ts`
- Never accessed: `SELECT COUNT(*) FROM entries WHERE access_count = 0` (depends on 2.3)

Implementation:
- New file: `src/tools/stats.ts`
- Add `StatsSchema` to `src/types.ts` (optional `project` param only)
- Register in `src/server.ts`
- Update tool count in `CLAUDE.md` ("Exposes 7 tools" → "8 tools") and `ARCHITECTURE.md` tool table
- No changes to `src/index.ts` needed (it just calls `registerTools`)

### 2.2 Recency-Weighted Search

Add time decay to the RRF merge phase and the FTS-only fallback path. After computing scores, multiply by a recency boost:

```typescript
const recencyBoost = 1 / (1 + daysSinceUpdate / 365);
score *= recencyBoost;
```

Decay curve:
- 1 day old: ~1.0x (no penalty)
- 6 months: ~0.67x
- 1 year: ~0.5x
- 2 years: ~0.33x

**Required code changes in `src/tools/search.ts`:**

1. Add `updated_at` to the `SearchResult` interface:
   ```typescript
   interface SearchResult {
     id: number;
     title: string;
     tags: string;
     category: string;
     project: string | null;
     content_snippet: string;
     updated_at: string;  // ADD
   }
   ```

2. Add `e.updated_at` to the FTS SQL SELECT (line ~61):
   ```sql
   SELECT e.id, e.title, e.tags, e.category, e.project, e.updated_at,
          snippet(entries_fts, 1, '>>>', '<<<', '...', 40) as content_snippet
   ```

3. Add `updated_at` to the vector-only back-fill query (line ~126):
   ```sql
   SELECT id, title, tags, category, project, updated_at, substr(content, 1, 200) as content
   ```

4. Apply recency boost in the RRF merge (after line ~111):
   ```typescript
   // After sorting by RRF score, apply recency boost
   for (const [id, score] of scores) {
     const entry = ftsById.get(id);
     if (entry?.updated_at) {
       const days = (Date.now() - new Date(entry.updated_at).getTime()) / 86400000;
       scores.set(id, score * (1 / (1 + days / 365)));
     }
   }
   ```

5. Apply recency to the FTS-only fallback path (line ~85-92): sort `ftsResults` by the same recency-weighted score before trimming to `limit`.

Changes: `src/tools/search.ts` only.

### 2.3 Access Tracking

Add two columns to `entries`:

```sql
ALTER TABLE entries ADD COLUMN last_accessed TEXT DEFAULT NULL;
ALTER TABLE entries ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0;
```

**Migration placement:** Add to `initDb()` in `src/db.ts`, after the `db.exec(...)` block that creates the schema. Use `PRAGMA table_info(entries)` to check if columns exist before running ALTER TABLE:

```typescript
const columns = db.pragma("table_info(entries)") as Array<{ name: string }>;
const colNames = new Set(columns.map(c => c.name));
if (!colNames.has("last_accessed")) {
  db.exec("ALTER TABLE entries ADD COLUMN last_accessed TEXT DEFAULT NULL");
}
if (!colNames.has("access_count")) {
  db.exec("ALTER TABLE entries ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0");
}
```

**Update on search:** After formatting results but before returning, run a synchronous batch update on the returned entry IDs. Since `better-sqlite3` is synchronous, there's no benefit to fire-and-forget — just run it inline (fast for ≤20 rows):

```typescript
const ids = results.map(r => r.id);
if (ids.length > 0) {
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `UPDATE entries SET last_accessed = datetime('now'), access_count = access_count + 1 WHERE id IN (${placeholders})`
  ).run(...ids);
}
```

**Update `Entry` interface in `src/types.ts`:** Add `last_accessed: string | null` and `access_count: number` fields.

**Update `brain_consolidate` output** in `src/tools/sleep.ts`: Include access count in the per-entry metadata line to help Claude prioritize during cleanup:

```typescript
`Project: ${e.project ?? "(general)"} | Tags: ${e.tags || "(none)"} | Updated: ${e.updated_at} | Accessed: ${e.access_count}x`
```

Changes: `src/db.ts`, `src/tools/search.ts`, `src/tools/stats.ts`, `src/tools/sleep.ts`, `src/types.ts`.

### 2.4 Configurable Snippet Length

Add optional `detail` param to `SearchSchema`:

```typescript
detail: z.enum(["brief", "full"]).default("brief")
```

Note: `.default("brief")` alone is sufficient — it already makes the field optional in Zod. Do not chain `.optional()` after `.default()`.

Behavior:
- `"brief"` (default): current behavior — FTS5 `snippet()` with 40-token window, `substr(content, 1, 200)` for vector-only hits
- `"full"`: FTS query selects `e.content` instead of `snippet(...)`. Vector-only back-fill selects `content` instead of `substr(content, 1, 200)`.

Changes: `src/types.ts` (schema), `src/tools/search.ts` (conditional snippet vs full content).

---

## File Change Summary

| Change | Files | Type |
|---|---|---|
| `.claudeignore` | `.claudeignore` | Create |
| Compaction guidance | `CLAUDE.md` | Edit |
| knowledge-base.md → command | `commands/brain-knowledge.md`, `install.sh` | Create/Edit |
| Token budget docs | `README.md`, `ARCHITECTURE.md` | Edit |
| `brain_stats` tool | `src/tools/stats.ts`, `src/server.ts`, `src/types.ts` | Create/Edit |
| Update tool count | `CLAUDE.md`, `ARCHITECTURE.md` | Edit |
| Recency-weighted search | `src/tools/search.ts` | Edit |
| Access tracking | `src/db.ts`, `src/tools/search.ts`, `src/tools/stats.ts`, `src/tools/sleep.ts`, `src/types.ts` | Edit |
| Configurable detail | `src/tools/search.ts`, `src/types.ts` | Edit |

## What We're NOT Doing

- No auto-archival (access tracking enables it later, but YAGNI for now)
- No entry relations / knowledge graph
- No REST API
- No path-scoped `.claude/rules/` (this is a single-language project — 3 lines of TypeScript conventions aren't worth a separate file)
- No batch operations
- No configurable recency decay constant (hardcoded 365 is fine; revisit if feedback warrants)
