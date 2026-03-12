# Knowledge Strategy Redesign: Tiered Memory with Commit-Time Storage

**Goal:** Minimize token usage for programmers working with external libraries and legacy code.

**Core problem:** The current strategy stores knowledge eagerly ("add immediately") and reviews everything at session end. This spends tokens to save tokens with unclear ROI. The highest-cost repeated work — re-reading files to rebuild comprehension, re-researching external APIs — is never captured.

---

## 1. When to Store Knowledge

Replace "add immediately after ANY event" with three deliberate triggers:

### 1a. At commit time (primary trigger)
After creating a commit, review what was learned during that unit of work. The commit provides natural scope — what files were touched, what problem was solved. Store only what required significant comprehension effort and is likely needed again.

### 1b. After research
When Claude consults external sources (web searches, MCP tools, docs fetches), the knowledge is expensive to re-acquire and not in the codebase. Store before it leaves context.

### 1c. At discovery of a pattern or anti-pattern
An experienced developer's judgment call:
- "This broke because of X — avoid X" (anti-pattern, trap)
- "This approach worked well for this type of problem" (proven pattern)

**Test:** Would a senior dev mention this in a code review or tell a teammate?

### What NOT to store
- Routine fixes where the code speaks for itself
- Things derivable from reading the code or running `git log`
- Exploration that led nowhere

### Mindset shift
Old: "If you had to figure something out, store it."
New: "If a future session would waste significant tokens re-figuring this out, store it."

---

## 2. Tiered Memory Categories

Replace the six flat categories (`pattern`, `debugging`, `api`, `config`, `architecture`, `general`) with four purpose-driven tiers:

| Tier | Purpose | Example |
|------|---------|---------|
| `map` | Compressed summaries of files, modules, APIs, or codebases. Prevents re-reading. 10-20x smaller than source. | "AuthMiddleware: validates JWT, refreshes if <5min expiry, depends on TokenService. Gotcha: silently passes through if X-Internal header set." |
| `decision` | Non-obvious choices, workarounds, and their *why*. Things git blame won't explain. | "Chose node-fetch over axios because axios breaks ESM in this bundler config." |
| `pattern` | Proven approaches and anti-patterns. Senior-dev wisdom. | "Anti-pattern: don't use GridControl built-in filtering with virtual sources — loads everything into memory." |
| `api` | External library/service knowledge from research or painful discovery. | "Stripe webhooks: must return 200 within 5s or retries. Use async queue." |

### Migration from old categories
- `architecture` → `map`
- `debugging` → `pattern` (if generalizable) or delete
- `config` → `api` or `decision` depending on content
- `general` → best-fit tier
- `pattern` → `pattern` (stays)
- `api` → `api` (stays)

---

## 3. Source Tracking and Trust

### New fields on `brain_add`

- `source` (optional string) — the reference: file path, URL, library name
- `source_type` (optional enum) — trust level of the source

### Source type trust hierarchy

| Source type | Trust | When to use |
|------------|-------|-------------|
| `docs` | Highest | Official API docs, library reference pages |
| `code` | High | Read directly from source code |
| `verified` | High | Solution that was tested and committed |
| `research` | Medium | Web search, Stack Overflow, forum posts |
| `inferred` | Lower | Reasoning, experimentation, untested hypotheses |

### How trust influences operations

- **Contradiction resolution:** Prefer higher-trust source by default. Flag when lower-trust contradicts higher-trust (likely outdated or wrong).
- **Deduplication:** When merging duplicates, keep the entry from the higher-trust source.
- **Deletion candidates:** Lower-trust + never-accessed entries are pruned first.
- **Not a hard rule:** A `verified` workaround can override `docs` if the docs are wrong. Trust is a default instinct, not a constraint.

---

## 4. Targeted Consolidation

### Current problem
`brain_consolidate` dumps ALL entries into context. With 50+ entries, that's 5000+ tokens for review, growing linearly. This becomes the problem it's meant to prevent.

### New default: targeted review
Only return entries that need attention:

1. **Stale maps** — maps with `category = 'map'` whose `updated_at` is older than 14 days. The MCP server cannot check filesystem timestamps, so staleness is age-based. Maps older than 14 days are flagged for re-validation.
2. **Never-accessed entries** — `access_count = 0`, older than 7 days. If never searched, probably not useful. Candidates for deletion.
3. **Low-confidence entries** — entries with `source_type` of `inferred` or `research` that are older than 30 days with `access_count < 3`. Lower trust + low usage = likely noise.

**Priority ordering for output:** stale maps first (highest reuse value), then never-accessed (cleanup candidates), then low-confidence (review candidates).

Skip: recently accessed entries, recently updated entries, entries with `source_type` of `docs`/`code`/`verified` that have been accessed.

### Periodic full review
Track `consolidation_count` in a `metadata` key-value table (see Section 5). Every 10th call triggers a full review automatically.

- Normal output: "Targeted review (7/10 until full review): 3 items need attention"
- Full output: "Full review (periodic sweep): 34 entries across 4 tiers" — grouped by tier with flagged issues (overlapping entries, potential contradictions based on same `source`, stale maps)
- Force full review on demand with `full: true` parameter

### Output cap
Soft cap of 20 items on consolidation output. Priority order as defined above. If more exist: "20 of 47 candidates shown, run again for more."

---

## 5. Schema Changes

### `types.ts` — categories enum
```typescript
// Old
export const categories = ["pattern", "debugging", "api", "config", "architecture", "general"] as const;

// New
export const categories = ["map", "decision", "pattern", "api"] as const;
```

### `types.ts` — source types enum
```typescript
export const sourceTypes = ["docs", "code", "verified", "research", "inferred"] as const;
export type SourceType = (typeof sourceTypes)[number];
```

### `types.ts` — Entry interface
```typescript
export interface Entry {
  id: number;
  title: string;
  content: string;
  tags: string;
  category: Category;
  project: string | null;
  source: string | null;       // NEW
  source_type: SourceType | null; // NEW
  created_at: string;
  updated_at: string;
  last_accessed: string | null;
  access_count: number;
}
```

### `types.ts` — AddSchema
```typescript
export const AddSchema = z.object({
  title: z.string().describe("Concise, searchable title"),
  content: z.string().describe("The knowledge content. Be specific and actionable."),
  tags: z.array(z.string()).describe("Tags: technology names, concepts, error codes"),
  category: z.enum(categories).default("pattern"),
  project: z.string().optional().describe("Project identifier. Omit for general knowledge."),
  source: z.string().optional().describe("Where this knowledge comes from: file path, URL, library name"),
  source_type: z.enum(sourceTypes).optional().describe("Trust level: docs, code, verified, research, inferred"),
});
```

### `types.ts` — UpdateSchema
```typescript
export const UpdateSchema = z.object({
  id: z.number().describe("Entry ID to update"),
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.enum(categories).optional(),
  project: z.string().nullable().optional(),
  source: z.string().nullable().optional(),       // NEW
  source_type: z.enum(sourceTypes).nullable().optional(), // NEW
});
```

### `types.ts` — Rename SleepSchema → ConsolidateReviewSchema
The current `ConsolidateSchema` (used by `brain_deduplicate`) is renamed to `DeduplicateSchema` and keeps its shape. The current `SleepSchema` (used by `brain_consolidate`) is renamed to `ConsolidateReviewSchema` and extended:

```typescript
// brain_consolidate uses this (was SleepSchema)
export const ConsolidateReviewSchema = z.object({
  project: z.string().optional().describe("Project identifier. Auto-detected if omitted."),
  full: z.boolean().default(false).describe("Force full review instead of targeted"),
});

// brain_deduplicate keeps using this (unchanged)
export const DeduplicateSchema = z.object({
  apply: z.boolean().default(false).describe("false = dry-run, true = merge duplicates"),
  min_projects: z.number().min(2).default(2).describe("Min projects for consolidation candidate"),
});
```

### `db.ts` — schema migration
Add columns to entries table:
```sql
ALTER TABLE entries ADD COLUMN source TEXT;
ALTER TABLE entries ADD COLUMN source_type TEXT;
```

Add metadata table for tracking consolidation count:
```sql
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO metadata (key, value) VALUES ('consolidation_count', '0');
```

### `db.ts` — data migration for existing categories
```sql
-- Direct mappings
UPDATE entries SET category = 'map' WHERE category = 'architecture';
UPDATE entries SET category = 'pattern' WHERE category = 'debugging';
UPDATE entries SET category = 'decision' WHERE category = 'config';
UPDATE entries SET category = 'pattern' WHERE category = 'general';
-- 'pattern' and 'api' stay as-is
```

Note: The `debugging` → `pattern` and `general` → `pattern` mappings are safe defaults. Entries that don't fit can be recategorized during the next full consolidation review.

### `brain_deduplicate` — trust-aware merging
Update `consolidate.ts` (the deduplication tool): when merging duplicate groups, prefer the entry with the highest-trust `source_type` instead of the most recently updated. Trust order: `docs` > `code` = `verified` > `research` > `inferred` > `null`. Fall back to recency as tiebreaker within the same trust level.

### Validation
`brain_add` should require `source` when `source_type` is provided. Implement as a Zod `.refine()`:
```typescript
.refine(
  (d) => !d.source_type || d.source,
  { message: "source is required when source_type is set", path: ["source"] }
)
```

### `server.ts` — updated imports and registrations
```typescript
// Updated imports
import { SearchSchema, AddSchema, UpdateSchema, DeleteSchema,
         ListTagsSchema, DeduplicateSchema, ConsolidateReviewSchema,
         StatsSchema } from "./types.js";
import { consolidateReview } from "./tools/consolidate-review.js"; // renamed from sleep.ts
import { deduplicate } from "./tools/deduplicate.js"; // renamed from consolidate.ts

// brain_deduplicate registration uses DeduplicateSchema
// brain_consolidate registration uses ConsolidateReviewSchema
```

### File renames
- `src/tools/sleep.ts` → `src/tools/consolidate-review.ts`, function `sleep()` → `consolidateReview()`
- `src/tools/consolidate.ts` → `src/tools/deduplicate.ts`, function `consolidate()` → `deduplicate()`

### Migration guard
Category migration SQL should be gated behind a check in `initDb()`:
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

### FTS5 index — add `source` column
The current FTS5 index covers `title`, `content`, `tags`, `category`. Add `source` so map entries can be found by file path or library name. This enables searches like "brain_search AuthMiddleware.ts" to surface the relevant map directly.

### Note on breaking changes
The `SearchSchema` category filter enum changes from 6 to 4 values. This is an intentional breaking change — queries filtering by removed categories (`debugging`, `config`, `architecture`, `general`) will fail validation. This is correct behavior since no entries will have those categories after migration.

---

## 6. Instruction Changes

### `~/.claude/CLAUDE.md` — replace Knowledge Base section
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

### `/brain-knowledge` command — rewrite
Replace the 6 "call immediately" triggers with:
```
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

## Source tracking
Always set `source` (file path, URL, lib name) and `source_type` (`docs`, `code`, `verified`, `research`, `inferred`) when adding entries.
```

### `/goodbye` and `/exit` — update
Replace "Call `brain_consolidate` to retrieve all knowledge entries for review" with:
```
1. Call `brain_consolidate` to review entries needing attention (targeted by default, full sweep every 10th session).
2. Review flagged entries: stale maps, never-accessed entries, low-confidence items.
3. Use `brain_update` to refresh stale maps, `brain_delete` to remove dead entries.
4. Use `brain_deduplicate` if cross-project duplicates are flagged.
```

### `brain_consolidate` tool description
Change from: "Review all knowledge entries for cleanup before session ends."
To: "Targeted review of entries needing attention. Flags stale maps, unused entries, and low-confidence items. Full sweep every 10th call or with full=true."

---

## 7. Summary of Changes

| Area | Before | After |
|------|--------|-------|
| When to add | Immediately after any discovery | At commit, after research, at pattern discovery |
| Categories | 6 flat types | 4 purpose-driven tiers |
| Source tracking | None | Source reference + trust level |
| Conflict resolution | Manual | Trust-weighted defaults |
| Consolidation | Full dump every time | Targeted review, full sweep every 10th |
| Consolidation output | All entries, unbounded | Capped at 20, prioritized by need |
| Core metric | "Did you learn something? Store it." | "Would a future session waste tokens re-learning this?" |
