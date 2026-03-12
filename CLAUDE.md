# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An MCP server providing a local SQLite-based knowledge base for Claude Code. Exposes 8 tools (`brain_search`, `brain_add`, `brain_update`, `brain_delete`, `brain_list_tags`, `brain_deduplicate`, `brain_consolidate`, `brain_stats`) over stdio transport. Database lives at `~/.claude/knowledge.db` with FTS5 full-text search and semantic vector search (hybrid ranking via Reciprocal Rank Fusion). Includes slash commands: `/brain-init` (enable auto-knowledge + migrate CLAUDE.md to brain), `/goodbye` and `/exit` (end-of-session consolidation).

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
- When compacting context, preserve: list of modified files, current task state, active tool names
