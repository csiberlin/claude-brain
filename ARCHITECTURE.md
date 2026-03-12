# Architecture

## Overview

An MCP server that gives Claude Code a persistent knowledge base. Runs over stdio transport, stores everything in a single SQLite file at `~/.claude/knowledge.db`. Entries are searchable via FTS5 full-text search and semantic vector search, fused with Reciprocal Rank Fusion (RRF).

## Design Goal: Token Efficiency

Claude Code injects `CLAUDE.md` and `MEMORY.md` into every message — their full contents count against the context window on every turn. This server exists to move the bulk of project knowledge out of those always-loaded files and into an on-demand store that costs zero tokens when not queried.

The two-tier model:

1. **CLAUDE.md** — minimal: build commands, file structure summary, conventions. Loaded every message, so kept small.
2. **Brain (this server)** — everything else: architecture details, debugging notes, API quirks, patterns. Retrieved only when `brain_search` is called.

This means a project with 50 knowledge entries pays for only the 3–5 relevant snippets returned by a search, not all 50 on every turn. The `/brain-init` command automates this migration: it moves detailed content from CLAUDE.md into the brain and slims the file to essentials. Search results are further compressed via FTS5 `snippet()` (40-token excerpts) rather than returning full entry content.

### Key Thresholds

- `CLAUDE.md`: <100 lines recommended ("healthy"), >200 lines degrades adherence, 40K chars triggers built-in warning
- `MEMORY.md`: first 200 lines loaded, remainder silently truncated
- `@import` files: loaded at startup, not lazy — every imported file costs tokens per message
- Search results: ~40 tokens per snippet via FTS5 `snippet()`, or 200 chars for vector-only hits

## Runtime

```
Claude Code ──stdio──▶ McpServer (src/index.ts)
                         ├── initDb()         → opens SQLite, creates schema
                         ├── detectProject()  → resolves project identifier
                         └── registerTools()  → exposes 8 MCP tools
```

Startup is synchronous: DB init and project detection happen before the server connects to the transport. The embedding model (`all-MiniLM-L6-v2`, ONNX via `@huggingface/transformers` WASM) is lazy-loaded on first use.

## Storage

**Database:** `~/.claude/knowledge.db` (WAL mode, foreign keys enabled)

### Schema

```sql
entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  tags          TEXT NOT NULL DEFAULT '',    -- comma-separated, lowercase
  category      TEXT NOT NULL DEFAULT 'general',  -- pattern|debugging|api|config|architecture|general
  project       TEXT DEFAULT NULL,           -- NULL = general knowledge
  created_at    TEXT DEFAULT datetime('now'),
  updated_at    TEXT DEFAULT datetime('now'),
  last_accessed TEXT DEFAULT NULL,           -- set on brain_search hit
  access_count  INTEGER NOT NULL DEFAULT 0   -- incremented on brain_search hit
)

entries_fts  -- FTS5 virtual table (porter + unicode61 tokenizer)
             -- content-synced with entries via INSERT/UPDATE/DELETE triggers

embeddings (
  entry_id    INTEGER PRIMARY KEY → entries(id) ON DELETE CASCADE,
  embedding   BLOB NOT NULL,       -- Float32Array serialized to Buffer
  model       TEXT NOT NULL,       -- e.g. "Xenova/all-MiniLM-L6-v2"
  created_at  TEXT
)
```

FTS5 is kept in sync automatically via three triggers (`entries_ai`, `entries_ad`, `entries_au`) that mirror inserts, deletes, and updates into the `entries_fts` virtual table.

## Project Scoping

`src/project.ts` resolves the current project identifier at startup:

1. Try `git remote get-url origin` → extract `owner/repo` from the URL
2. Fallback: use the working directory's basename

All tools that accept a `project` parameter auto-fill it from the detected value when omitted. Searches include both project-scoped and general (`project IS NULL`) entries.

## Search: Hybrid FTS5 + Vector

`brain_search` runs two parallel ranking passes and merges them:

### 1. FTS5 Pass
- Query terms are OR'd, each quoted for literal matching
- Joins `entries_fts` with `entries`, applies project/category filters
- Returns up to `limit * 3` results ranked by FTS5's BM25-based `rank`
- Uses `snippet()` for content excerpts (40-token window)

### 2. Vector Pass
- Generates a query embedding via `all-MiniLM-L6-v2` (quantized q8, WASM runtime)
- Loads all stored embeddings for the project scope into memory
- Ranks by cosine similarity (dot product — vectors are L2-normalized)
- Returns top `limit * 3` entry IDs

### 3. Reciprocal Rank Fusion (K=60)
Merges both ranked lists:
```
score(entry) = Σ  1 / (K + rank_in_list)
```
For entries appearing in both lists, scores accumulate. Final results are sorted by RRF score descending, trimmed to `limit`.

RRF scores are then multiplied by a recency boost: `1 / (1 + days_since_update / 365)`. This gently favors recent entries (1-day-old: ~1.0x, 1-year-old: ~0.5x) without burying old knowledge.

Vector-only hits (no FTS match) are back-filled from the `entries` table with a `substr(content, 1, 200)` snippet.

If embedding generation fails (model not loaded, OOM), search degrades gracefully to FTS-only.

## Tools

| Tool | Function | Write? |
|---|---|---|
| `brain_search` | Hybrid FTS5 + vector search with RRF | No |
| `brain_add` | Insert entry + generate/store embedding | Yes |
| `brain_update` | Partial update by ID, regenerates embedding if title/content changed | Yes |
| `brain_delete` | Delete by ID (cascades to embeddings via FK) | Yes |
| `brain_list_tags` | Splits comma-separated tags via `json_each`, counts occurrences | No |
| `brain_deduplicate` | Groups entries by normalized title + category across projects. Dry-run or apply (keeps most recent, merges tags, promotes to general) | Yes |
| `brain_consolidate` | Dumps all entries grouped by category for LLM-driven review. Returns instructions for the AI to clean up using the other tools | No |
| `brain_stats` | Entry counts, embedding coverage, project/category breakdown, DB size | No |

All tool inputs are validated with Zod schemas (`src/types.ts`). Tags are normalized to lowercase on write.

## Embedding Pipeline

```
text → buildEmbeddingText(title, content)    "Title. Content"
     → getEmbeddingPipeline()                lazy singleton, ONNX WASM
     → extractor(text, {pooling: "mean", normalize: true})
     → Float32Array (384 dimensions)
     → storeEmbedding() → Buffer → embeddings.embedding BLOB
```

Embeddings are generated on `brain_add` and regenerated on `brain_update` (when title or content changes). Failures are swallowed — the entry is still persisted without a vector.

## Installation

`install.sh` performs 5 steps:
1. `npm install` + `npm run build`
2. `claude mcp add --transport stdio --scope user knowledge-base -- node dist/index.js`
3. Writes a minimal brain reference to `~/.claude/CLAUDE.md` (3 lines, ~50 tokens)
4. Removes legacy `@knowledge-base.md` import and `~/.claude/knowledge-base.md` if present
5. Copies slash commands to `~/.claude/commands/`

## Slash Commands

| Command | Purpose |
|---|---|
| `/brain-init` | Enable auto-knowledge behavior, migrate detailed CLAUDE.md content into the brain |
| `/brain-sync` | Promote stable brain entries back to CLAUDE.md |
| `/goodbye`, `/exit` | Trigger `brain_consolidate` for end-of-session cleanup |

## Architecture Assessment

### Why SQLite+FTS5+Embeddings is the right choice

- **Zero infrastructure** — single file at `~/.claude/knowledge.db`, no server process
- **Hybrid search** — keyword (FTS5) + semantic (vector) + recency boost, merged via RRF. This is the same pattern used by production systems (Vespa, Elastic)
- **Low dependency count** — `better-sqlite3` + `@huggingface/transformers` + `zod`
- **Fast for the target scale** — a personal knowledge base will have hundreds to low-thousands of entries
- **Portable** — single file, easy backup, works offline
- **Good tokenization** — porter stemmer + unicode61 handles most English queries well

### Known weaknesses

- **Brute-force vector search** — loads ALL embeddings into memory, computes cosine against every one. Fine at 500 entries, painful at 50K
- **Naive query parsing** — splits on whitespace, wraps in `OR`. No phrase search, no `NEAR()`, no prefix matching, no field boosting
- **No typo tolerance** — searching "debbuggin" won't find "debugging"
- **English-only stemming** — the `porter` stemmer only handles English morphology. German, French, etc. words are stemmed incorrectly (e.g. "Verbindungen" won't reduce to "Verbindung"). The `unicode61` tokenizer handles word boundaries and diacritics for all languages, but stemming is English-limited. The vector search path partially compensates since `all-MiniLM-L6-v2` handles multilingual queries semantically.
- **Tags stored as comma-separated string** — not normalized, no tag table, fragile
- **No entry relationships** — flat list, no "related to" links between entries
- **Embeddings silently fail** — if the WASM model doesn't load, search degrades to FTS-only with no warning to the user

### Alternatives considered and rejected

| Option | Why not |
|--------|---------|
| Elasticsearch/OpenSearch | Requires running a JVM server process — massively overkill for a personal CLI tool |
| MeiliSearch/Typesense | Separate server process, HTTP dependency |
| sqlite-vec / sqlite-vss | Adds native binary dependency; current WASM approach works at this scale |
| LanceDB | Loses FTS5 quality, would need to reimplement keyword search |
| PostgreSQL + pgvector | Server process, massive overkill |
| DuckDB | Not designed for OLTP insert/update patterns |

### Highest-impact improvements (within current architecture)

1. **Improve FTS5 query building** — add `NEAR()` queries, prefix matching (`term*`), column weighting (`{title}: 2.0`)
2. **Expose BM25 scores** — FTS5's `rank` uses BM25 internally; extracting raw scores enables more nuanced RRF blending
3. **Adopt `sqlite-vec`** — if scale exceeds ~10K entries, replaces brute-force cosine scan with indexed vector search

## Dependencies

| Package | Role |
|---|---|
| `@modelcontextprotocol/sdk` | MCP server + stdio transport |
| `better-sqlite3` | SQLite driver (native binding) |
| `@huggingface/transformers` | ONNX WASM inference for embeddings |
| `zod` | Input validation |
