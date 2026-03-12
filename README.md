# Claude Brain

A persistent knowledge base for [Claude Code](https://claude.ai/code), implemented as an MCP server with local SQLite + FTS5 full-text search and semantic vector search.

Claude automatically stores insights while working and consolidates them before ending a session — building up a searchable brain across projects and conversations.

## Quick Start

```bash
git clone https://github.com/csiberlin/claude-brain.git
cd claude-brain
./install.sh
```

Then in Claude Code:

```
/brain-init
```

That's it. Claude will now proactively store knowledge while working and clean it up at session end.

## How It Works

**During work**, Claude calls `brain_add` whenever it discovers a pattern, solves a tricky bug, learns an API quirk, or makes an architectural decision. Each entry gets a vector embedding generated automatically. Before starting work, it checks for relevant existing knowledge with `brain_search`, which combines FTS5 keyword matching with semantic vector similarity via Reciprocal Rank Fusion (RRF) — so searches find results even when different words are used.

**Before session ends**, Claude reviews all stored knowledge via `brain_consolidate` — removing contradictions, merging redundancies, and deleting outdated entries. Trigger this explicitly with `/goodbye` or `/exit`.

**On init**, `/brain-init` migrates detailed project knowledge from your CLAUDE.md into the brain and slims down the file to essentials. This reduces per-message token cost since CLAUDE.md is loaded every message, while brain entries are only fetched on demand.

**With auto memory**, Claude Code's built-in `MEMORY.md` is loaded every message — keep it under 10 lines of meta-instructions only. Brain remains the primary knowledge store because on-demand search costs zero tokens when not needed.

## Tools

All tools are prefixed with `brain_` for easy identification:

| Tool | Description |
|------|-------------|
| `brain_search` | Hybrid FTS5 + semantic vector search across knowledge entries. Auto-scoped to current project. |
| `brain_add` | Store a new insight, pattern, or solution. Auto-tagged with current project. |
| `brain_update` | Update an existing entry by ID. |
| `brain_delete` | Delete an entry by ID. |
| `brain_list_tags` | List all tags with usage counts. |
| `brain_deduplicate` | Find and merge duplicate entries across projects. |
| `brain_consolidate` | Review all entries for cleanup (contradictions, redundancies, staleness). |

## Slash Commands

| Command | Description |
|---------|-------------|
| `/brain-init` | Enable auto-knowledge, migrate CLAUDE.md to brain, slim down CLAUDE.md |
| `/brain-sync` | Promote stable brain entries to CLAUDE.md files |
| `/goodbye` | Consolidate knowledge and end session |
| `/exit` | Same as `/goodbye` |

## Installation Details

`install.sh` does four things:

1. `npm install` — install dependencies
2. `npm run build` — compile TypeScript
3. `claude mcp add` — register the MCP server with Claude Code (user scope, stdio transport)
4. Copy slash commands to `~/.claude/commands/`

The database lives at `~/.claude/knowledge.db` and is created automatically on first run.

## Project Detection

The server auto-detects the current project from git remote origin (`owner/repo` format) or falls back to the directory name. This scopes knowledge per-project while keeping general entries accessible everywhere.

## Categories

Entries are categorized as: `pattern`, `debugging`, `api`, `config`, `architecture`, `general`.

## Development

```bash
npm install          # install dependencies
npm run build        # compile TypeScript
npm start            # run MCP server directly
```

## License

MIT
