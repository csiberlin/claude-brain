# Knowledge Strategy Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace eager knowledge storage with commit-time tiered memory, source tracking with trust hierarchy, and targeted consolidation — to minimize token usage for programmers working with external libraries and legacy code.

**Architecture:** Four-tier category system (map, decision, pattern, api) with source trust tracking. Consolidation becomes targeted by default (stale maps, unused entries, low-confidence items) with periodic full sweep. Schema migration handles existing data.

**Tech Stack:** TypeScript, better-sqlite3, Zod, FTS5

**Spec:** `docs/superpowers/specs/2026-03-12-knowledge-strategy-redesign.md`

---

## Chunk 1: Schema and Type Changes

### Task 1: Update type definitions

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Update categories enum**

Replace the categories array:
```typescript
// Old:
export const categories = [
  "pattern",
  "debugging",
  "api",
  "config",
  "architecture",
  "general",
] as const;

// New:
export const categories = ["map", "decision", "pattern", "api"] as const;
```

- [ ] **Step 2: Add source types enum**

After the categories block, add:
```typescript
export const sourceTypes = ["docs", "code", "verified", "research", "inferred"] as const;
export type SourceType = (typeof sourceTypes)[number];
```

- [ ] **Step 3: Update Entry interface**

Add `source` and `source_type` fields:
```typescript
export interface Entry {
  id: number;
  title: string;
  content: string;
  tags: string;
  category: Category;
  project: string | null;
  source: string | null;
  source_type: SourceType | null;
  created_at: string;
  updated_at: string;
  last_accessed: string | null;
  access_count: number;
}
```

- [ ] **Step 4: Update AddSchema with source fields and validation**

**Important:** `.refine()` turns a `ZodObject` into `ZodEffects`, which loses `.shape`. Since `server.ts` uses `AddSchema.shape` for tool registration, we split into a base object and a refined version:

```typescript
export const AddSchemaBase = z.object({
  title: z.string().describe("Concise, searchable title"),
  content: z.string().describe("The knowledge content. Be specific and actionable."),
  tags: z.array(z.string()).describe("Tags: technology names, concepts, error codes"),
  category: z.enum(categories).default("pattern"),
  project: z.string().optional().describe("Project identifier. Omit for general knowledge."),
  source: z.string().optional().describe("Where this knowledge comes from: file path, URL, library name"),
  source_type: z.enum(sourceTypes).optional().describe("Trust level: docs, code, verified, research, inferred"),
});

export const AddSchema = AddSchemaBase.refine(
  (d) => !d.source_type || d.source,
  { message: "source is required when source_type is set", path: ["source"] }
);
```

`server.ts` will use `AddSchemaBase.shape` for registration and `AddSchema.parse()` for validation.

- [ ] **Step 5: Update UpdateSchema with source fields**

Add to existing UpdateSchema:
```typescript
export const UpdateSchema = z.object({
  id: z.number().describe("Entry ID to update"),
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.enum(categories).optional(),
  project: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  source_type: z.enum(sourceTypes).nullable().optional(),
});
```

- [ ] **Step 6: Rename SleepSchema → ConsolidateReviewSchema, ConsolidateSchema → DeduplicateSchema**

Replace:
```typescript
// Old SleepSchema → new ConsolidateReviewSchema
export const ConsolidateReviewSchema = z.object({
  project: z.string().optional().describe("Project identifier. Auto-detected if omitted."),
  full: z.boolean().default(false).describe("Force full review instead of targeted"),
});

// Old ConsolidateSchema → renamed DeduplicateSchema (same shape)
export const DeduplicateSchema = z.object({
  apply: z.boolean().default(false).describe("false = dry-run (show candidates), true = merge duplicates into general knowledge"),
  min_projects: z.number().min(2).default(2).describe("Min projects an entry must appear in to be a candidate (default 2)"),
});
```

Remove the old `SleepSchema` and `ConsolidateSchema` exports.

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npm run build`
Expected: Compilation errors in files that reference old schema names (expected — we fix those in later tasks)

- [ ] **Step 8: Commit**

```bash
git add src/types.ts
git commit -m "refactor: update types for tiered memory with source tracking

New categories: map, decision, pattern, api (replaces 6 flat types)
New source/source_type fields with trust hierarchy
Rename SleepSchema → ConsolidateReviewSchema, ConsolidateSchema → DeduplicateSchema"
```

---

### Task 2: Database migration

**Files:**
- Modify: `src/db.ts`

- [ ] **Step 1: Add source columns migration**

After the existing `access_count` migration block (line 75-79), add:
```typescript
if (!colNames.has("source")) {
  db.exec("ALTER TABLE entries ADD COLUMN source TEXT DEFAULT NULL");
}
if (!colNames.has("source_type")) {
  db.exec("ALTER TABLE entries ADD COLUMN source_type TEXT DEFAULT NULL");
}
```

- [ ] **Step 2: Add metadata table**

After the source columns migration, add:
```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
db.exec(`INSERT OR IGNORE INTO metadata (key, value) VALUES ('consolidation_count', '0')`);
```

- [ ] **Step 3: Add category migration with guard**

After the metadata table creation:
```typescript
const oldCategoryCount = db.prepare(
  `SELECT COUNT(*) as cnt FROM entries WHERE category IN ('debugging','config','architecture','general')`
).get() as { cnt: number };

if (oldCategoryCount.cnt > 0) {
  db.exec(`UPDATE entries SET category = 'map' WHERE category = 'architecture'`);
  db.exec(`UPDATE entries SET category = 'pattern' WHERE category = 'debugging'`);
  db.exec(`UPDATE entries SET category = 'decision' WHERE category = 'config'`);
  db.exec(`UPDATE entries SET category = 'pattern' WHERE category = 'general'`);
}
```

- [ ] **Step 4: Rebuild FTS5 index with source column**

The existing FTS5 table doesn't include `source`. We need to drop and recreate it. After the category migration, add:
```typescript
// Check if FTS5 index needs source column by attempting to query it
// If the schema changed, rebuild the index
try {
  // If source is already in the FTS schema, this is a no-op on subsequent runs
  const ftsInfo = db.prepare("SELECT * FROM entries_fts LIMIT 0").columns();
  const ftsColNames = ftsInfo.map(c => c.name);
  if (!ftsColNames.includes("source")) {
    // Rebuild FTS5 with source column
    db.exec("DROP TABLE IF EXISTS entries_fts");
    db.exec("DROP TRIGGER IF EXISTS entries_ai");
    db.exec("DROP TRIGGER IF EXISTS entries_ad");
    db.exec("DROP TRIGGER IF EXISTS entries_au");

    db.exec(`
      CREATE VIRTUAL TABLE entries_fts USING fts5(
        title,
        content,
        tags,
        category,
        source,
        content='entries',
        content_rowid='id',
        tokenize='porter unicode61'
      );

      CREATE TRIGGER entries_ai AFTER INSERT ON entries BEGIN
        INSERT INTO entries_fts(rowid, title, content, tags, category, source)
        VALUES (new.id, new.title, new.content, new.tags, new.category, COALESCE(new.source, ''));
      END;

      CREATE TRIGGER entries_ad AFTER DELETE ON entries BEGIN
        INSERT INTO entries_fts(entries_fts, rowid, title, content, tags, category, source)
        VALUES ('delete', old.id, old.title, old.content, old.tags, old.category, COALESCE(old.source, ''));
      END;

      CREATE TRIGGER entries_au AFTER UPDATE ON entries BEGIN
        INSERT INTO entries_fts(entries_fts, rowid, title, content, tags, category, source)
        VALUES ('delete', old.id, old.title, old.content, old.tags, old.category, COALESCE(old.source, ''));
        INSERT INTO entries_fts(rowid, title, content, tags, category, source)
        VALUES (new.id, new.title, new.content, new.tags, new.category, COALESCE(new.source, ''));
      END;
    `);

    // Repopulate FTS index from existing data
    db.exec(`
      INSERT INTO entries_fts(rowid, title, content, tags, category, source)
      SELECT id, title, content, tags, category, COALESCE(source, '') FROM entries
    `);
  }
} catch {
  // FTS5 table doesn't exist yet or has issues — will be created by initial schema
}
```

Also update the initial `CREATE VIRTUAL TABLE` in the main schema block to include `source`:
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
  title,
  content,
  tags,
  category,
  source,
  content='entries',
  content_rowid='id',
  tokenize='porter unicode61'
);
```

And update the initial triggers to include source:
```sql
CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, title, content, tags, category, source)
  VALUES (new.id, new.title, new.content, new.tags, new.category, COALESCE(new.source, ''));
END;

CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, title, content, tags, category, source)
  VALUES ('delete', old.id, old.title, old.content, old.tags, old.category, COALESCE(old.source, ''));
END;

CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, title, content, tags, category, source)
  VALUES ('delete', old.id, old.title, old.content, old.tags, old.category, COALESCE(old.source, ''));
  INSERT INTO entries_fts(rowid, title, content, tags, category, source)
  VALUES (new.id, new.title, new.content, new.tags, new.category, COALESCE(new.source, ''));
END;
```

- [ ] **Step 5: Verify build compiles**

Run: `npm run build`
Expected: May still have errors from tools referencing old schema names

- [ ] **Step 6: Commit**

```bash
git add src/db.ts
git commit -m "feat: add database migrations for tiered memory

Add source/source_type columns, metadata table, category migration guard,
FTS5 index rebuild with source column"
```

---

## Chunk 2: Tool Updates

### Task 3: Update brain_add tool

**Files:**
- Modify: `src/tools/add.ts`

- [ ] **Step 1: Add source fields to INSERT**

Update the `addKnowledge` function to destructure and insert the new fields:
```typescript
export async function addKnowledge(
  args: z.infer<typeof AddSchema>
): Promise<string> {
  const db = getDb();
  const { title, content, tags, category, project, source, source_type } = args;

  const normalizedTags = tags
    .map((t) => t.toLowerCase().trim())
    .filter(Boolean)
    .join(",");

  const result = db
    .prepare(
      `INSERT INTO entries (title, content, tags, category, project, source, source_type)
       VALUES (@title, @content, @tags, @category, @project, @source, @source_type)`
    )
    .run({
      title,
      content,
      tags: normalizedTags,
      category,
      project: project ?? null,
      source: source ?? null,
      source_type: source_type ?? null,
    });

  const entryId = result.lastInsertRowid as number;

  try {
    const embedding = await generateEmbedding(buildEmbeddingText(title, content));
    storeEmbedding(entryId, embedding);
  } catch {
    // Embedding generation failed — entry is still saved
  }

  return `Added entry [${entryId}]: ${title}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tools/add.ts
git commit -m "feat: brain_add stores source and source_type fields"
```

---

### Task 4: Update brain_update tool

**Files:**
- Modify: `src/tools/update.ts`

- [ ] **Step 1: Add source/source_type handling to update logic**

Update the destructuring and add handling for the new fields:
```typescript
const { id, title, content, tags, category, project, source, source_type } = args;
```

After the existing `project` block (around line 39), add:
```typescript
if (source !== undefined) {
  sets.push("source = @source");
  params.source = source;
}
if (source_type !== undefined) {
  sets.push("source_type = @source_type");
  params.source_type = source_type;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tools/update.ts
git commit -m "feat: brain_update supports source and source_type fields"
```

---

### Task 5: Rename and rewrite consolidation review tool (brain_consolidate)

**Files:**
- Delete: `src/tools/sleep.ts`
- Create: `src/tools/consolidate-review.ts`

- [ ] **Step 1: Create the new consolidate-review tool**

Create `src/tools/consolidate-review.ts` with targeted consolidation logic:
```typescript
import { getDb } from "../db.js";
import { ConsolidateReviewSchema } from "../types.js";
import type { z } from "zod";
import type { Entry } from "../types.js";

const OUTPUT_CAP = 20;

interface MetadataRow {
  value: string;
}

function getConsolidationCount(db: ReturnType<typeof getDb>): number {
  const row = db.prepare(
    `SELECT value FROM metadata WHERE key = 'consolidation_count'`
  ).get() as MetadataRow | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

function incrementConsolidationCount(db: ReturnType<typeof getDb>): number {
  const current = getConsolidationCount(db);
  const next = current + 1;
  db.prepare(
    `INSERT OR REPLACE INTO metadata (key, value) VALUES ('consolidation_count', @value)`
  ).run({ value: String(next) });
  return next;
}

export function consolidateReview(args: z.infer<typeof ConsolidateReviewSchema>): string {
  const db = getDb();
  const { project, full } = args;

  const count = incrementConsolidationCount(db);
  const isFullReview = full || (count % 10 === 0);

  const projectFilter = project !== undefined;
  const whereBase = projectFilter
    ? "WHERE (e.project = @project OR e.project IS NULL)"
    : "";
  const params: Record<string, unknown> = projectFilter ? { project } : {};

  if (isFullReview) {
    return fullReview(db, whereBase, params, count);
  }

  return targetedReview(db, whereBase, params, count);
}

function targetedReview(
  db: ReturnType<typeof getDb>,
  whereBase: string,
  params: Record<string, unknown>,
  count: number
): string {
  const untilFull = 10 - (count % 10);
  const candidates: Array<{ entry: Entry; reason: string }> = [];

  // 1. Stale maps (category='map', updated > 14 days ago)
  const staleMaps = db.prepare(`
    SELECT * FROM entries e
    ${whereBase ? whereBase + " AND" : "WHERE"}
    e.category = 'map'
    AND e.updated_at < datetime('now', '-14 days')
    ORDER BY e.updated_at ASC
  `).all(params) as Entry[];

  for (const e of staleMaps) {
    candidates.push({ entry: e, reason: "Stale map (>14 days)" });
  }

  // 2. Never-accessed entries (access_count=0, created > 7 days ago)
  const neverAccessed = db.prepare(`
    SELECT * FROM entries e
    ${whereBase ? whereBase + " AND" : "WHERE"}
    e.access_count = 0
    AND e.created_at < datetime('now', '-7 days')
    ORDER BY e.created_at ASC
  `).all(params) as Entry[];

  for (const e of neverAccessed) {
    if (!candidates.some(c => c.entry.id === e.id)) {
      candidates.push({ entry: e, reason: "Never accessed (>7 days)" });
    }
  }

  // 3. Low-confidence entries (inferred/research, >30 days, access_count < 3)
  const lowConfidence = db.prepare(`
    SELECT * FROM entries e
    ${whereBase ? whereBase + " AND" : "WHERE"}
    e.source_type IN ('inferred', 'research')
    AND e.updated_at < datetime('now', '-30 days')
    AND e.access_count < 3
    ORDER BY e.access_count ASC, e.updated_at ASC
  `).all(params) as Entry[];

  for (const e of lowConfidence) {
    if (!candidates.some(c => c.entry.id === e.id)) {
      candidates.push({ entry: e, reason: "Low confidence + low access" });
    }
  }

  if (candidates.length === 0) {
    return `Targeted review (${untilFull}/10 until full review): no items need attention.`;
  }

  const shown = candidates.slice(0, OUTPUT_CAP);
  const lines: string[] = [
    `Targeted review (${untilFull}/10 until full review): ${candidates.length} items need attention`,
    "",
  ];

  for (const { entry: e, reason } of shown) {
    lines.push(`[${e.id}] ${e.title} (${e.category}${e.project ? ", " + e.project : ""})`);
    lines.push(`  Reason: ${reason} | Source: ${e.source_type ?? "unset"} | Accessed: ${e.access_count}x | Updated: ${e.updated_at}`);
    lines.push(`  ${e.content.slice(0, 150)}${e.content.length > 150 ? "..." : ""}`);
    lines.push("");
  }

  if (candidates.length > OUTPUT_CAP) {
    lines.push(`${OUTPUT_CAP} of ${candidates.length} candidates shown, run again for more.`);
  }

  lines.push("");
  lines.push("Actions: `brain_update` to refresh, `brain_delete` to remove, `brain_deduplicate` for cross-project merges.");

  return lines.join("\n");
}

function fullReview(
  db: ReturnType<typeof getDb>,
  whereBase: string,
  params: Record<string, unknown>,
  count: number
): string {
  const entries = db.prepare(`
    SELECT * FROM entries e
    ${whereBase}
    ORDER BY e.category, e.updated_at DESC
  `).all(params) as Entry[];

  if (entries.length === 0) {
    return "Full review (periodic sweep): no entries found.";
  }

  const grouped = new Map<string, Entry[]>();
  for (const entry of entries) {
    if (!grouped.has(entry.category)) grouped.set(entry.category, []);
    grouped.get(entry.category)!.push(entry);
  }

  const lines: string[] = [
    `Full review (periodic sweep, #${count}): ${entries.length} entries across ${grouped.size} tiers`,
    "",
    "Review all entries. Focus on:",
    "- Maps that may be stale (source files changed)",
    "- Entries with same `source` that may contradict each other",
    "- Redundant entries that can be merged",
    "- Low-trust entries that haven't been accessed",
    "",
    "---",
    "",
  ];

  for (const [category, catEntries] of grouped) {
    lines.push(`## ${category} (${catEntries.length})`);
    lines.push("");
    for (const e of catEntries) {
      lines.push(`### [${e.id}] ${e.title}`);
      lines.push(`Project: ${e.project ?? "(general)"} | Tags: ${e.tags || "(none)"} | Source: ${e.source ?? "unset"} (${e.source_type ?? "unset"}) | Updated: ${e.updated_at} | Accessed: ${e.access_count}x`);
      lines.push("");
      lines.push(e.content);
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }

  lines.push("Actions: `brain_update` to fix, `brain_delete` to remove, `brain_deduplicate` for cross-project merges.");

  return lines.join("\n");
}
```

- [ ] **Step 2: Delete old sleep.ts**

```bash
git rm src/tools/sleep.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/tools/consolidate-review.ts
git commit -m "feat: replace full-dump consolidation with targeted review

Targeted mode surfaces stale maps, never-accessed, and low-confidence entries.
Full sweep auto-triggers every 10th call or via full=true parameter.
Output capped at 20 items with priority ordering."
```

---

### Task 6: Rename and update deduplication tool (brain_deduplicate)

**Files:**
- Delete: `src/tools/consolidate.ts`
- Create: `src/tools/deduplicate.ts`

- [ ] **Step 1: Create trust-aware deduplicate tool**

Create `src/tools/deduplicate.ts` — copy from `consolidate.ts` and add trust-aware winner selection:
```typescript
import { getDb } from "../db.js";
import { DeduplicateSchema } from "../types.js";
import type { z } from "zod";

const TRUST_ORDER: Record<string, number> = {
  docs: 5,
  code: 4,
  verified: 4,
  research: 3,
  inferred: 2,
};

function trustScore(sourceType: string | null): number {
  if (!sourceType) return 1;
  return TRUST_ORDER[sourceType] ?? 1;
}

interface DuplicateGroup {
  title: string;
  tags: string;
  category: string;
  ids: string;
  projects: string;
  project_count: number;
}

interface EntryRow {
  id: number;
  title: string;
  content: string;
  tags: string;
  category: string;
  project: string | null;
  source_type: string | null;
  updated_at: string;
}

export function deduplicate(args: z.infer<typeof DeduplicateSchema>): string {
  const db = getDb();
  const { apply, min_projects } = args;

  const groups = db
    .prepare(
      `SELECT
        lower(trim(title)) as title,
        tags,
        category,
        group_concat(id) as ids,
        group_concat(DISTINCT project) as projects,
        COUNT(DISTINCT project) as project_count
      FROM entries
      WHERE project IS NOT NULL
      GROUP BY lower(trim(title)), category
      HAVING COUNT(DISTINCT project) >= @min_projects
      ORDER BY project_count DESC`
    )
    .all({ min_projects }) as DuplicateGroup[];

  if (groups.length === 0) {
    return "No deduplication candidates found.";
  }

  if (!apply) {
    const lines = groups.map((g) => {
      const ids = g.ids.split(",");
      return (
        `"${g.title}" (${g.category})\n` +
        `  ${g.project_count} projects: ${g.projects}\n` +
        `  Entry IDs: ${ids.join(", ")}`
      );
    });
    return (
      `Deduplication candidates (${groups.length}):\n\n` +
      lines.join("\n---\n") +
      `\n\nRun with apply=true to merge these into general knowledge.`
    );
  }

  const updateStmt = db.prepare(
    `UPDATE entries SET project = NULL, tags = @tags, updated_at = datetime('now') WHERE id = @id`
  );
  const deleteStmt = db.prepare(`DELETE FROM entries WHERE id = @id`);

  let merged = 0;
  let deleted = 0;

  const transaction = db.transaction(() => {
    for (const group of groups) {
      const ids = group.ids.split(",").map(Number);

      const entries = db
        .prepare(
          `SELECT id, title, content, tags, category, project, source_type, updated_at
           FROM entries WHERE id IN (${ids.map(() => "?").join(",")})`
        )
        .all(...ids) as EntryRow[];

      // Pick winner: highest trust, then most recent as tiebreaker
      entries.sort((a, b) => {
        const trustDiff = trustScore(b.source_type) - trustScore(a.source_type);
        if (trustDiff !== 0) return trustDiff;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
      const winner = entries[0];

      const allTags = new Set<string>();
      for (const entry of entries) {
        for (const tag of entry.tags.split(",")) {
          const t = tag.trim().toLowerCase();
          if (t) allTags.add(t);
        }
      }

      updateStmt.run({ id: winner.id, tags: [...allTags].join(",") });
      merged++;

      for (const entry of entries.slice(1)) {
        deleteStmt.run({ id: entry.id });
        deleted++;
      }
    }
  });

  transaction();

  return (
    `Deduplicated ${groups.length} groups:\n` +
    `  ${merged} entries promoted to general knowledge (preferred by trust level)\n` +
    `  ${deleted} duplicate entries removed`
  );
}
```

- [ ] **Step 2: Delete old consolidate.ts**

```bash
git rm src/tools/consolidate.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/tools/deduplicate.ts
git commit -m "feat: trust-aware deduplication replaces recency-only merging

Winner selection: highest source_type trust, then recency as tiebreaker.
Trust order: docs > code = verified > research > inferred > null"
```

---

### Task 7: Update server.ts registrations

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Update all imports**

Replace the import block:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SearchSchema, AddSchemaBase, AddSchema, UpdateSchema, DeleteSchema, ListTagsSchema, DeduplicateSchema, ConsolidateReviewSchema, StatsSchema } from "./types.js";
import { searchKnowledge } from "./tools/search.js";
import { addKnowledge } from "./tools/add.js";
import { updateKnowledge } from "./tools/update.js";
import { deleteKnowledge } from "./tools/delete.js";
import { listTags } from "./tools/list-tags.js";
import { deduplicate } from "./tools/deduplicate.js";
import { consolidateReview } from "./tools/consolidate-review.js";
import { getStats } from "./tools/stats.js";
import { getDetectedProject } from "./project.js";
```

- [ ] **Step 2: Update brain_add registration**

Change `AddSchema.shape` to `AddSchemaBase.shape` (since AddSchema is now ZodEffects). Update tool description:
```typescript
server.tool(
  "brain_add",
  "Store a new insight, pattern, or solution. Set source/source_type for trust tracking. Auto-tags with current project.",
  AddSchemaBase.shape,
  async (args) => {
    const parsed = AddSchema.parse(args);
    if (parsed.project === undefined) {
      parsed.project = getDetectedProject() ?? undefined;
    }
    return {
      content: [{ type: "text", text: await addKnowledge(parsed) }],
    };
  }
);
```

- [ ] **Step 3: Update brain_deduplicate registration**

Change the `brain_deduplicate` tool registration to use `DeduplicateSchema` and `deduplicate`:
```typescript
server.tool(
  "brain_deduplicate",
  "Find and merge duplicate entries across projects into general knowledge. Prefers higher-trust sources. Use apply=false for dry-run.",
  DeduplicateSchema.shape,
  async (args) => ({
    content: [{ type: "text", text: deduplicate(DeduplicateSchema.parse(args)) }],
  })
);
```

- [ ] **Step 4: Update brain_consolidate registration**

Change to use `ConsolidateReviewSchema` and `consolidateReview`:
```typescript
server.tool(
  "brain_consolidate",
  "Targeted review of entries needing attention. Flags stale maps, unused entries, and low-confidence items. Full sweep every 10th call or with full=true.",
  ConsolidateReviewSchema.shape,
  async (args) => {
    const parsed = ConsolidateReviewSchema.parse(args);
    if (parsed.project === undefined) {
      parsed.project = getDetectedProject() ?? undefined;
    }
    return {
      content: [{ type: "text", text: consolidateReview(parsed) }],
    };
  }
);
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Clean compilation, no errors

- [ ] **Step 6: Commit**

```bash
git add src/server.ts
git commit -m "refactor: wire up renamed schemas and tool implementations

brain_deduplicate → DeduplicateSchema + deduplicate()
brain_consolidate → ConsolidateReviewSchema + consolidateReview()"
```

---

### Task 8: Update stats tool for new tiers

**Files:**
- Modify: `src/tools/stats.ts`

- [ ] **Step 1: Add source_type breakdown**

After the categories breakdown (around line 65), add a source_type breakdown:
```typescript
// Source type breakdown
const sourceTypes = db
  .prepare(
    `SELECT COALESCE(source_type, 'unset') as source_type, COUNT(*) as count FROM entries ${whereClause} GROUP BY source_type ORDER BY count DESC`
  )
  .all(params) as Array<{ source_type: string; count: number }>;
const sourceTypesStr = sourceTypes.map((s) => `${s.source_type}(${s.count})`).join(", ");
```

Add to the output lines:
```typescript
`  Source types: ${sourceTypesStr || "none"}`,
```

- [ ] **Step 2: Commit**

```bash
git add src/tools/stats.ts
git commit -m "feat: brain_stats shows source_type breakdown"
```

---

## Chunk 3: Search Update and Build Verification

### Task 9: Update search tool for new FTS5 schema

**Files:**
- Modify: `src/tools/search.ts`

- [ ] **Step 1: Update FTS5 snippet index**

The FTS5 `snippet()` function uses column index. With the addition of `source` as the 5th column (0-indexed: title=0, content=1, tags=2, category=3, source=4), the existing snippet call at line 71 using index `1` (content) is still correct. No change needed to the snippet call.

However, the search result format should show source info when available. Update the `SearchResult` interface and `formatResults`:

In the `SearchResult` interface, add:
```typescript
source: string | null;
source_type: string | null;
```

Update the SQL SELECT to include `e.source, e.source_type` in both the FTS query and the vector-only fallback query.

Update `formatResults`:
```typescript
function formatResults(results: SearchResult[]): string {
  return (
    `Found ${results.length} entries:\n\n` +
    results
      .map(
        (r) =>
          `[${r.id}] ${r.title} (${r.category}${r.project ? ", " + r.project : ""}${r.source_type ? ", " + r.source_type : ""})\n` +
          `Tags: ${r.tags}${r.source ? " | Source: " + r.source : ""}\n` +
          `${r.content_snippet}`
      )
      .join("\n---\n")
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tools/search.ts
git commit -m "feat: brain_search shows source info in results"
```

---

### Task 10: Full build and manual smoke test

- [ ] **Step 1: Clean build**

Run: `npm run build`
Expected: Clean compilation, no errors

- [ ] **Step 2: Start server and verify it initializes**

Run: `npm start`
Expected: Server starts without errors (it will wait for stdio input — Ctrl+C to stop)

- [ ] **Step 3: Commit any remaining fixes**

If any build issues found, fix and commit.

---

## Chunk 4: Instruction Updates

### Task 11: Update slash commands

**Files:**
- Modify: `commands/brain-knowledge.md`
- Modify: `commands/goodbye.md`
- Modify: `commands/exit.md`

- [ ] **Step 1: Rewrite brain-knowledge.md**

Replace full content with:
```markdown
Quick reference for knowledge base usage patterns:

## During Work — When to Store Knowledge

**At commit time (primary):** After committing, review what you learned. Store maps of complex code you comprehended, decisions that aren't obvious from the diff, and patterns worth reusing.

**After research:** When you consulted external sources (web, docs, MCP tools), store the knowledge before it leaves context. External knowledge is expensive to re-acquire.

**At pattern/anti-pattern discovery:** When you find something a senior dev would tell a teammate about — a trap to avoid, a technique that works well.

**Test:** "Would a future session waste significant tokens re-learning this?"

## Tiers

| Tier | What to store | Example |
|------|--------------|---------|
| `map` | Compressed summary of a file, module, or API. 10-20x smaller than source. Include: purpose, key exports, dependencies, gotchas. | "AuthMiddleware: validates JWT, refreshes if <5min expiry. Gotcha: passes through if X-Internal header." |
| `decision` | Non-obvious choice and its *why*. Things git blame won't explain. | "Chose node-fetch over axios — axios breaks ESM in this bundler." |
| `pattern` | Proven approach or anti-pattern. | "Anti-pattern: GridControl built-in filtering with virtual sources loads all into memory." |
| `api` | External library/service knowledge from research. | "Stripe webhooks: must return 200 within 5s or retries." |

## Source Tracking

Always set `source` (file path, URL, lib name) and `source_type` (`docs`, `code`, `verified`, `research`, `inferred`) when adding entries. Higher-trust sources are preferred during deduplication and conflict resolution.
```

- [ ] **Step 2: Update goodbye.md**

Replace full content with:
```markdown
Before ending this session, consolidate your knowledge base:

1. Call `brain_consolidate` to review entries needing attention (targeted by default, full sweep every 10th session).
2. Review flagged entries: stale maps, never-accessed entries, low-confidence items.
3. Use `brain_update` to refresh stale maps, `brain_delete` to remove dead entries.
4. Use `brain_deduplicate` if cross-project duplicates are flagged.
5. Check if any remaining entries qualify for promotion to CLAUDE.md — entries in `map`, `pattern`, or `decision` categories that are more than 7 days old and project-scoped. If candidates exist, tell the user: "N brain entries are stable enough to promote to CLAUDE.md. Run /brain-sync to review them."
6. Once cleanup is complete, say goodbye.
```

- [ ] **Step 3: Update exit.md**

Replace with same content as goodbye.md.

- [ ] **Step 4: Commit**

```bash
git add commands/brain-knowledge.md commands/goodbye.md commands/exit.md
git commit -m "docs: update slash commands for tiered memory strategy

Replace eager-add triggers with commit-time/research/discovery triggers.
Update consolidation flow for targeted review.
Add tier examples and source tracking guidance."
```

---

### Task 12: Update project CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update project overview to reflect new categories**

In the Project Overview section, update the tool description to mention 4 tiers instead of listing all tool names (those don't change). Update the categories mentioned to `map, decision, pattern, api`.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for tiered memory categories"
```

---

### Task 13: Update brain-init command

**Files:**
- Modify: `commands/brain-init.md`

- [ ] **Step 1: Update the CLAUDE.md template in brain-init**

Replace the Knowledge Base section template (lines 9-12) with:
```
## Knowledge Base

You have access to a persistent knowledge base via MCP tools.

**Before work:** Call `brain_search` to check for maps and prior knowledge about the area you're working in.

**When to store knowledge:**
- After committing: review what you learned, store maps, decisions, and patterns
- After research: external knowledge (web, docs, MCP) is expensive to re-acquire — store it
- At discovery: when you find a proven pattern or an anti-pattern worth warning about

**What NOT to store:** routine fixes, things derivable from code or git, exploration that led nowhere.

**Tiers:** `map` (compressed file/module/API summaries), `decision` (non-obvious choices and their why), `pattern` (proven approaches and anti-patterns), `api` (external library/service knowledge from research).

Use `/goodbye` or `/exit` at session end to consolidate.
```

- [ ] **Step 2: Update brain_add category guidance in Step 2**

Change line 26's category list from `architecture, debugging, api, config, pattern, general` to `map, decision, pattern, api`.

- [ ] **Step 3: Commit**

```bash
git add commands/brain-init.md
git commit -m "docs: update brain-init for tiered memory strategy"
```

---

### Task 14: Final build verification

- [ ] **Step 1: Clean build**

Run: `npm run build`
Expected: Clean, no errors

- [ ] **Step 2: Quick sanity check — start server**

Run: `npm start`
Expected: Starts clean

- [ ] **Step 3: Review all changes**

Run: `git log --oneline` to verify commit history is clean and tells a coherent story.

- [ ] **Step 4: Note for existing users**

After upgrading, existing users should re-run `/brain-init` to update their `~/.claude/CLAUDE.md` with the new knowledge strategy instructions.
