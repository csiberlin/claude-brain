# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An MCP server providing a local SQLite-based knowledge base for Claude Code. Exposes 8 tools (`brain_search`, `brain_add`, `brain_update`, `brain_delete`, `brain_list_tags`, `brain_deduplicate`, `brain_consolidate`, `brain_stats`) over stdio transport. Database lives at `~/.claude/knowledge.db` with FTS5 full-text search and semantic vector search (hybrid ranking via Reciprocal Rank Fusion). Includes slash commands: `/brain-init` (enable auto-knowledge + migrate CLAUDE.md to brain), `/brain-keep` (flush insight buffer + end session), `/brain-abandon` (dead-end session cleanup), `/exit` (consolidation only), `/goodbye` (alias for `/brain-keep`).

## Build & Run

```bash
npm install          # install dependencies
npm run build        # compile TypeScript (tsc) to dist/
npm start            # run the MCP server (stdio transport)
./install.sh         # full setup: install, build, register with Claude Code
```

No test framework is configured. No linter is configured.

## Structure

- `src/index.ts` — entry point (DB init, project detection, tool registration, stdio transport)
- `src/db.ts` — SQLite schema and FTS5 triggers
- `src/server.ts` — MCP tool registration with Zod validation
- `src/types.ts` — Entry interface, Zod schemas, category enum
- `src/embeddings.ts` — HuggingFace WASM embedding generation
- `src/project.ts` — git remote project detection
- `src/tools/*.ts` — individual tool implementations

Detailed architecture knowledge is stored in the brain (use `brain_search` to find it).

## Conventions

- ESM modules (`"type": "module"` in package.json, `.js` extensions in imports)
- TypeScript strict mode, target ES2022, module Node16
- Install script registers MCP server and installs slash commands to `~/.claude/commands/`
- `/brain-init` command enables auto-knowledge with tiered categories (`map`, `decision`, `pattern`, `api`), migrates detailed project knowledge from CLAUDE.md into the brain, and slims down CLAUDE.md to essentials
- Insights are buffered to `~/.claude/pending-insights.jsonl` during work, then promoted to brain via `brain_add` after commit or at session end (`/brain-keep` or `/brain-abandon`)
- When compacting context, preserve: list of modified files, current task state, active tool names

## Journey Log (`journey.md`)

Narrative of the project's development, written from the developer's perspective using session transcripts.

**Examined sessions (already incorporated):**
- `81dbfc53` — The spark (Copilot code index idea)
- `9b7052f1` — Competitive research, 5 embedding approaches, picking option E
- `64e498b2` — Implementation, pragmatic cuts (no backfill, no export/import), brain vs auto-memory
- `d0eca985` — Token economics revelation, inverting CLAUDE.md model, brain-init design

**Not yet examined (need review for future journey updates):**
- `217a6c4b`, `2be3a1ac`, `365780c8`, `406afe1b`, `4e045eb3`, `5a43b850`
- `60bacfb0`, `60e6ea98`, `6a4a4afc`, `7aa39c76`, `9fae93a6`, `ac2e94b8`, `e491e805`
- `6396f2f3` — Current session (journey writing)

**To add:** Today's "add statistics" session, token efficiency refactor, tiered memory redesign, and any other sessions with significant user-driven decisions.
