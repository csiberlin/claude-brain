# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An MCP server providing a local SQLite-based knowledge base for Claude Code. Exposes 7 tools (`brain_search`, `brain_add`, `brain_update`, `brain_delete`, `brain_list_tags`, `brain_deduplicate`, `brain_consolidate`) over stdio transport. Database lives at `~/.claude/knowledge.db` with FTS5 full-text search and semantic vector search (hybrid ranking via Reciprocal Rank Fusion). Includes slash commands: `/brain-init` (enable auto-knowledge + migrate CLAUDE.md to brain), `/goodbye` and `/exit` (end-of-session consolidation).

## Build & Run

```bash
npm install          # install dependencies
npm run build        # compile TypeScript (tsc) to dist/
npm start            # run the MCP server (stdio transport)
./install.sh         # full setup: install, build, register with Claude Code
```

No test framework is configured. No linter is configured.

## Architecture

**Entry point**: `src/index.ts` — initializes DB, detects project, registers tools, starts stdio transport.

**Key flow**: `index.ts` → `db.ts` (SQLite init with FTS5 triggers) → `project.ts` (git remote detection) → `server.ts` (registers 7 MCP tools using Zod schemas from `types.ts`) → `tools/*.ts` (implementations).

**Database**: `entries` table + `entries_fts` virtual table (FTS5, porter tokenizer) + `embeddings` table (384-dim vectors, CASCADE delete). Triggers auto-sync FTS on INSERT/UPDATE/DELETE. WAL journal mode.

**Embeddings** (`src/embeddings.ts`): Uses `@huggingface/transformers` (WASM) with `Xenova/all-MiniLM-L6-v2` (q8 quantized, ~23MB, lazy-loaded on first use). Generates 384-dim L2-normalized vectors. Embeddings are stored on `brain_add` and regenerated on `brain_update` when title/content changes. Failures never block entry operations.

**Search** (`src/tools/search.ts`): Hybrid search combining FTS5 keyword matching with cosine-similarity vector ranking, merged via Reciprocal Rank Fusion (RRF, k=60). Falls back to FTS5-only if embeddings are unavailable.

**Project detection** (`project.ts`): Extracts `owner/repo` from git remote origin URL, falls back to directory name. Auto-applied to `brain_search` and `brain_add` when project param is omitted.

**Tool registration** (`server.ts`): Each tool parses args with Zod schema, injects detected project where applicable, delegates to tool implementation. DB operations use better-sqlite3 (synchronous); embedding generation is async.

## Schema & Types

Defined in `src/types.ts`. Categories: `pattern`, `debugging`, `api`, `config`, `architecture`, `general`. Tags are stored comma-separated in DB, accepted as `string[]` in tool input. The `Entry` interface and all 7 Zod schemas (`SearchSchema`, `AddSchema`, `UpdateSchema`, `DeleteSchema`, `ListTagsSchema`, `ConsolidateSchema`, `SleepSchema`) live here.

## Conventions

- ESM modules (`"type": "module"` in package.json, `.js` extensions in imports)
- TypeScript strict mode, target ES2022, module Node16
- Install script registers MCP server and installs slash commands to `~/.claude/commands/`
- `/brain-init` command enables auto-knowledge, migrates detailed project knowledge from CLAUDE.md into the brain, and slims down CLAUDE.md to essentials
