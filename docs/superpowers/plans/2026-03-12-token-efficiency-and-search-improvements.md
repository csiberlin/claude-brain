# Token Efficiency & Search Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce per-message token cost of the knowledge base and improve search with recency weighting, access tracking, configurable detail, and a stats tool.

**Architecture:** Config-level changes (`.claudeignore`, compaction, install script) are independent of code changes. Code changes follow the existing pattern: schemas in `types.ts`, tool implementations in `src/tools/*.ts`, registration in `server.ts`, DB migrations in `db.ts`. Search improvements build on each other: access tracking columns must exist before recency weighting and stats can reference them.

**Tech Stack:** TypeScript (ESM, strict), better-sqlite3, Zod, @huggingface/transformers

**Spec:** `docs/superpowers/specs/2026-03-12-token-efficiency-and-search-improvements-design.md`

---

## Chunk 1: Context Efficiency (Config & Docs)

### Task 1: Create `.claudeignore`

**Files:**
- Create: `.claudeignore`

- [ ] **Step 1: Create the file**

```
dist/
node_modules/
*.wasm
*.onnx
```

- [ ] **Step 2: Verify it exists and has correct content**

Run: `cat .claudeignore`
Expected: The four lines above.

- [ ] **Step 3: Commit**

```bash
git add .claudeignore
git commit -m "feat: add .claudeignore to exclude build artifacts and models"
```

---

### Task 2: Add compaction guidance to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md:32-37` (Conventions section)

- [ ] **Step 1: Add compaction line**

Add this line at the end of the Conventions section in `CLAUDE.md` (after line 37):

```
- When compacting context, preserve: list of modified files, current task state, active tool names
```

- [ ] **Step 2: Verify**

Run: `grep -n "compacting" CLAUDE.md`
Expected: Shows the new line in the Conventions section.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "feat: add compaction guidance to CLAUDE.md"
```

---

### Task 3: Convert `knowledge-base.md` from `@import` to slash command

**Files:**
- Create: `commands/brain-knowledge.md`
- Modify: `install.sh:20-42`

The goal: stop injecting `knowledge-base.md` into every message. Instead, write a minimal 3-line brain reference into `~/.claude/CLAUDE.md` and make the full content available as `/brain-knowledge`.

- [ ] **Step 1: Create `commands/brain-knowledge.md`**

This is a quick-reference slash command for brain usage patterns. Create with this content:

```markdown
Quick reference for knowledge base usage patterns:

## During Work — When to Store Knowledge
After ANY of these events, call `brain_add` immediately:
1. **You resolve a build/compile error** — category: `debugging`
2. **You discover an API quirk or gotcha** — category: `api`
3. **You establish a pattern used across multiple files** — category: `pattern`
4. **You make or encounter an architectural decision** — category: `architecture`
5. **You learn a configuration detail** — category: `config`
6. **You work around a framework limitation** — category: `debugging`

**Rule of thumb:** If you had to figure something out (it wasn't obvious from the code alone), store it.

## What Makes a Good Entry
- **Title:** Short, searchable (e.g., "DevExpress WPF: ColumnDefinition name collision")
- **Content:** Specific and actionable — include the fix, not just the problem. Include file paths when relevant.
- **Tags:** Technology names, project names, error codes, concepts
- **Project:** Set the project identifier when the knowledge is project-specific

## Categories
`pattern`, `debugging`, `api`, `config`, `architecture`, `general`
```

- [ ] **Step 2: Rewrite `install.sh` step 4**

Replace the current step `[4/5] Installing knowledge base instructions...` (lines 20-42) with a new step that:
1. Removes `@knowledge-base.md` line from `~/.claude/CLAUDE.md` if present
2. Removes old `knowledge-base.md` file from `~/.claude/` if present
3. Adds a minimal brain reference section to `~/.claude/CLAUDE.md` if not already present

Replace lines 20-42 of `install.sh` with:

```bash
echo ""
echo "[4/5] Configuring knowledge base in Claude Code..."
CLAUDE_DIR="$HOME/.claude"
mkdir -p "$CLAUDE_DIR"
CLAUDE_MD="$CLAUDE_DIR/CLAUDE.md"

# Remove old @import if present
if [ -f "$CLAUDE_MD" ]; then
  grep -v '@knowledge-base\.md' "$CLAUDE_MD" > "$CLAUDE_MD.tmp" && mv "$CLAUDE_MD.tmp" "$CLAUDE_MD"
fi

# Remove old knowledge-base.md file if present
rm -f "$CLAUDE_DIR/knowledge-base.md"

# Remove existing ## Knowledge Base section (from prior installs) so we can write a fresh one
if [ -f "$CLAUDE_MD" ] && grep -qF "## Knowledge Base" "$CLAUDE_MD"; then
  # Remove from "## Knowledge Base" to next "##" heading or end of file
  awk '/^## Knowledge Base/{skip=1; next} /^## /{skip=0} !skip' "$CLAUDE_MD" > "$CLAUDE_MD.tmp" && mv "$CLAUDE_MD.tmp" "$CLAUDE_MD"
  echo "Removed old Knowledge Base section from $CLAUDE_MD"
fi

# Append minimal brain reference
BRAIN_REF='
## Knowledge Base

You have access to a persistent knowledge base via MCP tools. Use `brain_search` before starting work to check for relevant knowledge. Use `brain_add` to store insights, patterns, and solutions as you work. Use `/goodbye` or `/exit` at session end to consolidate.'

if [ ! -f "$CLAUDE_MD" ]; then
  echo "$BRAIN_REF" > "$CLAUDE_MD"
  echo "Created $CLAUDE_MD with brain reference"
else
  echo "$BRAIN_REF" >> "$CLAUDE_MD"
  echo "Added brain reference to $CLAUDE_MD"
fi
```

- [ ] **Step 3: Update `install.sh` output messages**

Update the final "Available commands" section (lines 56-62) to include `/brain-knowledge`:

```bash
echo "Available commands:"
echo "  /brain-init      — Enable auto-knowledge and migrate CLAUDE.md to brain"
echo "  /brain-knowledge — Quick reference for brain usage patterns"
echo "  /brain-sync      — Promote stable brain entries to CLAUDE.md"
echo "  /goodbye         — Consolidate knowledge and end session"
echo "  /exit            — Same as /goodbye"
```

Also update the slash commands installed line (line 51):
```bash
echo "Slash commands installed: /brain-init, /brain-knowledge, /brain-sync, /goodbye, /exit"
```

- [ ] **Step 4: Verify install script syntax**

Run: `bash -n install.sh`
Expected: No output (no syntax errors).

- [ ] **Step 5: Commit**

```bash
git add commands/brain-knowledge.md install.sh
git commit -m "feat: convert knowledge-base.md from @import to slash command

Saves ~650 tokens/message by replacing always-loaded @import with
a minimal 3-line reference. Full content available via /brain-knowledge."
```

---

### Task 4: Token budget documentation

**Files:**
- Modify: `README.md:29-31`
- Modify: `ARCHITECTURE.md:7-16`

- [ ] **Step 1: Add Token Budget section to README.md**

After the "With auto memory" paragraph (line 31), add:

```markdown

## Token Budget

Claude Code loads `CLAUDE.md` and `MEMORY.md` into every message. This tool moves bulk knowledge out of those files and into an on-demand store.

Key thresholds:
- **CLAUDE.md**: target <100 lines. Warning at 40K characters. >200 lines degrades instruction adherence.
- **MEMORY.md**: first 200 lines loaded, rest **silently truncated** — no warning.
- **Brain entries**: zero token cost when not queried. Search returns compressed snippets (~40 tokens each).

`/brain-init` automates the migration: it moves detailed content from CLAUDE.md into the brain and slims the file to essentials.
```

- [ ] **Step 2: Add threshold numbers to ARCHITECTURE.md**

In the "Design Goal: Token Efficiency" section of `ARCHITECTURE.md`, after the paragraph ending with "...rather than returning full entry content." (line 16), add:

```markdown

### Key Thresholds

- `CLAUDE.md`: <100 lines recommended ("healthy"), >200 lines degrades adherence, 40K chars triggers built-in warning
- `MEMORY.md`: first 200 lines loaded, remainder silently truncated
- `@import` files: loaded at startup, not lazy — every imported file costs tokens per message
- Search results: ~40 tokens per snippet via FTS5 `snippet()`, or 200 chars for vector-only hits
```

- [ ] **Step 3: Commit**

```bash
git add README.md ARCHITECTURE.md
git commit -m "docs: add token budget thresholds to README and ARCHITECTURE"
```

---

## Chunk 2: Database & Type Changes

### Task 5: Add access tracking columns (DB migration)

**Files:**
- Modify: `src/db.ts:14-68` (inside `initDb()`, after the `db.exec(...)` call)
- Modify: `src/types.ts:14-23` (Entry interface)

- [ ] **Step 1: Add migration to `src/db.ts`**

Inside `initDb()`, after the `db.exec(\`...\`)` call ends on line 67 but **before** the function's closing `}` on line 68, add:

```typescript
  // Migration: add access tracking columns
  const columns = db.pragma("table_info(entries)") as Array<{ name: string }>;
  const colNames = new Set(columns.map((c) => c.name));
  if (!colNames.has("last_accessed")) {
    db.exec("ALTER TABLE entries ADD COLUMN last_accessed TEXT DEFAULT NULL");
  }
  if (!colNames.has("access_count")) {
    db.exec(
      "ALTER TABLE entries ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0"
    );
  }
```

- [ ] **Step 2: Update `Entry` interface in `src/types.ts`**

Add two fields to the `Entry` interface (after `updated_at` on line 22):

```typescript
  last_accessed: string | null;
  access_count: number;
```

The full interface should be:

```typescript
export interface Entry {
  id: number;
  title: string;
  content: string;
  tags: string;
  category: Category;
  project: string | null;
  created_at: string;
  updated_at: string;
  last_accessed: string | null;
  access_count: number;
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Successful compilation. The `sleep.ts` tool uses `SELECT *` which will now include the new columns, and since they have defaults, existing queries won't break.

- [ ] **Step 4: Commit**

```bash
git add src/db.ts src/types.ts
git commit -m "feat: add access tracking columns (last_accessed, access_count)"
```

---

### Task 6: Add `StatsSchema` and `detail` param to `SearchSchema`

**Files:**
- Modify: `src/types.ts:25-30` (SearchSchema)
- Modify: `src/types.ts` (add StatsSchema at end)

- [ ] **Step 1: Add `detail` param to `SearchSchema`**

In `src/types.ts`, modify `SearchSchema` (lines 25-30) to add the `detail` field:

```typescript
export const SearchSchema = z.object({
  query: z.string().describe("Search terms: technical terms, library names, error messages, concepts"),
  project: z.string().optional().describe("Project identifier to scope results. Omit for all."),
  category: z.enum(categories).optional().describe("Filter by category"),
  limit: z.number().min(1).max(20).default(5).describe("Max results (default 5)"),
  detail: z.enum(["brief", "full"]).default("brief").describe("'brief' returns snippets (default), 'full' returns complete content"),
});
```

- [ ] **Step 2: Add `StatsSchema` at end of file**

After the existing `SleepSchema` (line 64), add:

```typescript

export const StatsSchema = z.object({
  project: z.string().optional().describe("Filter stats by project. Omit for all."),
});
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Successful compilation. The new schema field has a default, so existing callers won't break.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat: add StatsSchema and detail param to SearchSchema"
```

---

## Chunk 3: Search Improvements

### Task 7: Configurable detail level and recency weighting in search

**Files:**
- Modify: `src/tools/search.ts` (entire file)

This task modifies the search tool to support `detail` param (brief/full), add `updated_at` to results for recency weighting, add recency boost to RRF scoring, and track access on returned results.

- [ ] **Step 1: Rewrite `src/tools/search.ts`**

Replace the entire content of `src/tools/search.ts` with:

```typescript
import { getDb } from "../db.js";
import { SearchSchema } from "../types.js";
import {
  generateEmbedding,
  loadEmbeddingsForProject,
  rankByVector,
} from "../embeddings.js";
import type { z } from "zod";

interface SearchResult {
  id: number;
  title: string;
  tags: string;
  category: string;
  project: string | null;
  content_snippet: string;
  updated_at: string;
}

interface EntryRow {
  id: number;
  title: string;
  tags: string;
  category: string;
  project: string | null;
  content: string;
  updated_at: string;
}

function recencyBoost(updatedAt: string): number {
  const days =
    (Date.now() - new Date(updatedAt).getTime()) / 86_400_000;
  return 1 / (1 + days / 365);
}

export async function searchKnowledge(
  args: z.infer<typeof SearchSchema>
): Promise<string> {
  const db = getDb();
  const { query, project, category, limit, detail } = args;
  const isFull = detail === "full";

  // Escape FTS5 special characters and build query
  const ftsQuery = query
    .replace(/['"]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term}"`)
    .join(" OR ");

  if (!ftsQuery) {
    return "No search terms provided.";
  }

  // --- FTS5 search ---
  const conditions: string[] = ["entries_fts MATCH @query"];
  const params: Record<string, unknown> = { query: ftsQuery, limit: limit * 3 };

  if (project !== undefined) {
    conditions.push("(e.project = @project OR e.project IS NULL)");
    params.project = project;
  }

  if (category !== undefined) {
    conditions.push("e.category = @category");
    params.category = category;
  }

  const contentExpr = isFull
    ? "e.content as content_snippet"
    : "snippet(entries_fts, 1, '>>>', '<<<', '...', 40) as content_snippet";

  const ftsSql = `
    SELECT e.id, e.title, e.tags, e.category, e.project, e.updated_at,
           ${contentExpr}
    FROM entries_fts
    JOIN entries e ON e.id = entries_fts.rowid
    WHERE ${conditions.join(" AND ")}
    ORDER BY rank
    LIMIT @limit
  `;

  const ftsResults = db.prepare(ftsSql).all(params) as SearchResult[];

  // --- Vector search (best-effort) ---
  let vectorRankedIds: number[] = [];
  try {
    const queryEmbedding = await generateEmbedding(query);
    const embeddings = loadEmbeddingsForProject(project);
    if (embeddings.size > 0) {
      vectorRankedIds = rankByVector(queryEmbedding, embeddings, limit * 3);
    }
  } catch {
    // Embedding unavailable — fall back to FTS-only
  }

  // --- Merge with Reciprocal Rank Fusion ---
  const K = 60;

  if (vectorRankedIds.length === 0) {
    // No vector results — combine FTS rank with recency and return
    const scored = ftsResults.map((r, i) => ({
      result: r,
      score: (1 / (K + i)) * recencyBoost(r.updated_at),
    }));
    scored.sort((a, b) => b.score - a.score);
    const trimmed = scored.slice(0, limit).map((s) => s.result);
    if (trimmed.length === 0) {
      return "No matching entries found.";
    }
    trackAccess(db, trimmed);
    return formatResults(trimmed);
  }

  const scores = new Map<number, number>();

  // FTS ranks
  for (let i = 0; i < ftsResults.length; i++) {
    const id = ftsResults[i].id;
    scores.set(id, (scores.get(id) ?? 0) + 1 / (K + i));
  }

  // Vector ranks
  for (let i = 0; i < vectorRankedIds.length; i++) {
    const id = vectorRankedIds[i];
    scores.set(id, (scores.get(id) ?? 0) + 1 / (K + i));
  }

  // Build lookup of FTS results by id
  const ftsById = new Map(ftsResults.map((r) => [r.id, r]));

  // For vector-only hits, fetch entry data
  const allIds = [...scores.keys()];
  const vectorOnlyIds = allIds.filter((id) => !ftsById.has(id));

  if (vectorOnlyIds.length > 0) {
    const placeholders = vectorOnlyIds.map(() => "?").join(",");
    const contentCol = isFull ? "content" : "substr(content, 1, 200) as content";
    const rows = db
      .prepare(
        `SELECT id, title, tags, category, project, updated_at, ${contentCol}
         FROM entries WHERE id IN (${placeholders})`
      )
      .all(...vectorOnlyIds) as EntryRow[];
    for (const row of rows) {
      ftsById.set(row.id, {
        id: row.id,
        title: row.title,
        tags: row.tags,
        category: row.category,
        project: row.project,
        content_snippet: row.content,
        updated_at: row.updated_at,
      });
    }
  }

  // Apply recency boost to RRF scores
  for (const [id, score] of scores) {
    const entry = ftsById.get(id);
    if (entry?.updated_at) {
      scores.set(id, score * recencyBoost(entry.updated_at));
    }
  }

  // Sort by boosted RRF score descending
  const merged = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const results = merged
    .map(([id]) => ftsById.get(id))
    .filter((r): r is SearchResult => r !== undefined);

  if (results.length === 0) {
    return "No matching entries found.";
  }

  trackAccess(db, results);
  return formatResults(results);
}

function trackAccess(
  db: ReturnType<typeof getDb>,
  results: SearchResult[]
): void {
  const ids = results.map((r) => r.id);
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `UPDATE entries SET last_accessed = datetime('now'), access_count = access_count + 1 WHERE id IN (${placeholders})`
  ).run(...ids);
}

function formatResults(results: SearchResult[]): string {
  return (
    `Found ${results.length} entries:\n\n` +
    results
      .map(
        (r) =>
          `[${r.id}] ${r.title} (${r.category}${r.project ? ", " + r.project : ""})\n` +
          `Tags: ${r.tags}\n` +
          `${r.content_snippet}`
      )
      .join("\n---\n")
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: Successful compilation.

- [ ] **Step 3: Commit**

```bash
git add src/tools/search.ts
git commit -m "feat: add recency-weighted search, configurable detail, access tracking

Search results now boosted by recency (gentle 1/365-day decay).
detail='full' returns complete entry content instead of snippets.
Returned entries get last_accessed/access_count updated."
```

---

## Chunk 4: Stats Tool & Consolidation Update

### Task 8: Implement `brain_stats` tool

**Files:**
- Create: `src/tools/stats.ts`
- Modify: `src/server.ts:1-2` (imports), `src/server.ts:92-94` (registration)

- [ ] **Step 1: Create `src/tools/stats.ts`**

```typescript
import { getDb } from "../db.js";
import { StatsSchema } from "../types.js";
import { statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { z } from "zod";

interface CountRow {
  count: number;
}

interface ProjectRow {
  project: string;
  count: number;
}

interface CategoryRow {
  category: string;
  count: number;
}

interface TagRow {
  tag: string;
}

export function getStats(args: z.infer<typeof StatsSchema>): string {
  const db = getDb();
  const { project } = args;

  const projectFilter = project !== undefined;
  const whereClause = projectFilter
    ? "WHERE project = @project OR project IS NULL"
    : "";
  const params: Record<string, unknown> = projectFilter ? { project } : {};

  // Total entries
  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM entries ${whereClause}`).get(params) as CountRow
  ).count;

  // Embedding coverage
  const withoutEmbeddings = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM entries e LEFT JOIN embeddings emb ON e.id = emb.entry_id WHERE emb.entry_id IS NULL ${projectFilter ? "AND (e.project = @project OR e.project IS NULL)" : ""}`
      )
      .get(params) as CountRow
  ).count;
  const withEmbeddings = total - withoutEmbeddings;

  // Projects breakdown
  const projects = db
    .prepare(
      `SELECT COALESCE(project, 'general') as project, COUNT(*) as count FROM entries ${whereClause} GROUP BY project ORDER BY count DESC`
    )
    .all(params) as ProjectRow[];
  const projectsStr = projects.map((p) => `${p.project}(${p.count})`).join(", ");

  // Categories breakdown
  const categories = db
    .prepare(
      `SELECT category, COUNT(*) as count FROM entries ${whereClause} GROUP BY category ORDER BY count DESC`
    )
    .all(params) as CategoryRow[];
  const categoriesStr = categories.map((c) => `${c.category}(${c.count})`).join(", ");

  // Unique tags
  const tagSql = projectFilter
    ? `SELECT DISTINCT trim(value) as tag FROM entries, json_each('["' || replace(tags, ',', '","') || '"]') WHERE tags != '' AND (project = @project OR project IS NULL)`
    : `SELECT DISTINCT trim(value) as tag FROM entries, json_each('["' || replace(tags, ',', '","') || '"]') WHERE tags != ''`;
  const uniqueTags = (db.prepare(tagSql).all(params) as TagRow[]).length;

  // DB size
  const dbPath = join(homedir(), ".claude", "knowledge.db");
  let dbSize: string;
  try {
    const bytes = statSync(dbPath).size;
    if (bytes < 1024) dbSize = `${bytes} B`;
    else if (bytes < 1024 * 1024) dbSize = `${(bytes / 1024).toFixed(1)} KB`;
    else dbSize = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } catch {
    dbSize = "unknown";
  }

  // Never accessed
  const neverAccessed = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM entries ${whereClause ? whereClause + " AND" : "WHERE"} access_count = 0`
      )
      .get(params) as CountRow
  ).count;

  const lines = [
    "Knowledge Base Stats:",
    `  Entries: ${total} (${withEmbeddings} with embeddings, ${withoutEmbeddings} without)`,
    `  Projects: ${projectsStr || "none"}`,
    `  Categories: ${categoriesStr || "none"}`,
    `  Tags: ${uniqueTags} unique`,
    `  DB size: ${dbSize}`,
    `  Never accessed: ${neverAccessed} entries`,
  ];

  return lines.join("\n");
}
```

- [ ] **Step 2: Register in `src/server.ts`**

Add import at the top of `server.ts` (after existing imports on line 9):

```typescript
import { getStats } from "./tools/stats.js";
```

Add schema import — modify the import on line 2:

```typescript
import { SearchSchema, AddSchema, UpdateSchema, DeleteSchema, ListTagsSchema, ConsolidateSchema, SleepSchema, StatsSchema } from "./types.js";
```

Add tool registration before the closing `}` of `registerTools` on line 93:

```typescript
  server.tool(
    "brain_stats",
    "Knowledge base statistics: entry counts, embedding coverage, project/category breakdown, DB size. Low-token overview.",
    StatsSchema.shape,
    async (args) => {
      const parsed = StatsSchema.parse(args);
      if (parsed.project === undefined) {
        parsed.project = getDetectedProject() ?? undefined;
      }
      return {
        content: [{ type: "text", text: getStats(parsed) }],
      };
    }
  );
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Successful compilation.

- [ ] **Step 4: Commit**

```bash
git add src/tools/stats.ts src/server.ts
git commit -m "feat: add brain_stats tool for knowledge base overview"
```

---

### Task 9: Update `brain_consolidate` to show access counts

**Files:**
- Modify: `src/tools/sleep.ts:59`

- [ ] **Step 1: Update the metadata line in sleep.ts**

In `src/tools/sleep.ts`, replace line 59:

```typescript
      lines.push(`Project: ${e.project ?? "(general)"} | Tags: ${e.tags || "(none)"} | Updated: ${e.updated_at}`);
```

with:

```typescript
      lines.push(`Project: ${e.project ?? "(general)"} | Tags: ${e.tags || "(none)"} | Updated: ${e.updated_at} | Accessed: ${e.access_count}x`);
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: Successful compilation.

- [ ] **Step 3: Commit**

```bash
git add src/tools/sleep.ts
git commit -m "feat: show access count in brain_consolidate output"
```

---

## Chunk 5: Documentation Updates

### Task 10: Update tool counts and docs

**Files:**
- Modify: `CLAUDE.md:7`
- Modify: `ARCHITECTURE.md:24,96-107`
- Modify: `README.md:33-45`

- [ ] **Step 1: Update CLAUDE.md tool count**

In `CLAUDE.md` line 7, change "Exposes 7 tools" to "Exposes 8 tools" and add `brain_stats` to the tool list:

```
An MCP server providing a local SQLite-based knowledge base for Claude Code. Exposes 8 tools (`brain_search`, `brain_add`, `brain_update`, `brain_delete`, `brain_list_tags`, `brain_deduplicate`, `brain_consolidate`, `brain_stats`) over stdio transport.
```

- [ ] **Step 2: Update ARCHITECTURE.md**

In `ARCHITECTURE.md` line 24, change "exposes 7 MCP tools" to "exposes 8 MCP tools".

In the Tools table (lines 96-107), add a row for `brain_stats`:

```
| `brain_stats` | Entry counts, embedding coverage, project/category breakdown, DB size | No |
```

Update the Schema section (lines 36-44) to include the new columns:

```sql
entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  tags          TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'general',
  project       TEXT DEFAULT NULL,
  created_at    TEXT DEFAULT datetime('now'),
  updated_at    TEXT DEFAULT datetime('now'),
  last_accessed TEXT DEFAULT NULL,
  access_count  INTEGER NOT NULL DEFAULT 0
)
```

Also add a note about recency weighting in the RRF section:

After the line "Final results are sorted by RRF score descending, trimmed to `limit`." (line 90), add:

```
RRF scores are then multiplied by a recency boost: `1 / (1 + days_since_update / 365)`. This gently favors recent entries (1-day-old: ~1.0x, 1-year-old: ~0.5x) without burying old knowledge.
```

- [ ] **Step 3: Update README.md tool table**

Add `brain_stats` to the tools table (after line 45):

```
| `brain_stats` | Entry counts, embedding coverage, category/project breakdown, DB size. |
```

- [ ] **Step 4: Update ARCHITECTURE.md Installation section**

In the Installation section (lines 122-129), update to reflect the new install.sh behavior:

```markdown
`install.sh` performs 5 steps:
1. `npm install` + `npm run build`
2. `claude mcp add --transport stdio --scope user knowledge-base -- node dist/index.js`
3. Writes a minimal brain reference to `~/.claude/CLAUDE.md` (3 lines, ~50 tokens)
4. Removes legacy `@knowledge-base.md` import and `~/.claude/knowledge-base.md` if present
5. Copies slash commands to `~/.claude/commands/`
```

- [ ] **Step 5: Build to verify nothing is broken**

Run: `npm run build`
Expected: Successful compilation.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md ARCHITECTURE.md README.md
git commit -m "docs: update tool counts, schema, and installation docs for new features"
```

---

## Summary of All Commits

1. `feat: add .claudeignore to exclude build artifacts and models`
2. `feat: add compaction guidance to CLAUDE.md`
3. `feat: convert knowledge-base.md from @import to slash command`
4. `docs: add token budget thresholds to README and ARCHITECTURE`
5. `feat: add access tracking columns (last_accessed, access_count)`
6. `feat: add StatsSchema and detail param to SearchSchema`
7. `feat: add recency-weighted search, configurable detail, access tracking`
8. `feat: add brain_stats tool for knowledge base overview`
9. `feat: show access count in brain_consolidate output`
10. `docs: update tool counts, schema, and installation docs for new features`
