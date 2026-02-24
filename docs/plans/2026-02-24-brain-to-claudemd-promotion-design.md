# Design: Brain-to-CLAUDE.md Knowledge Promotion

**Date:** 2026-02-24
**Approach:** Instruction-only (no server code changes)

## Problem

Knowledge flows one-way into the brain via `brain_add` but never back to CLAUDE.md files. Stable, proven knowledge that should be loaded every message (via CLAUDE.md) stays buried in the database, requiring manual curation.

## Solution

Add instructions and a slash command that guide Claude to identify stable brain entries and promote them into the appropriate CLAUDE.md files, then delete them from the brain.

## Promotion Criteria

An entry qualifies for promotion when ALL of these are true:

- **Category:** `architecture`, `pattern`, or `config` only. Entries in `debugging`, `api`, and `general` stay brain-only.
- **Age:** `created_at` is more than 7 days old (proxy for "survived multiple sessions").
- **Project-scoped:** Has a project tag matching the current project. General entries don't belong in any specific CLAUDE.md.
- **Not already captured:** The target CLAUDE.md doesn't already contain equivalent knowledge.

## Smart File Placement

1. Scan the entry's content and tags for directory/file path references.
2. If the entry references a specific subdirectory and a CLAUDE.md exists there — append to that file.
3. If the entry references a specific subdirectory but no CLAUDE.md exists — create one with a minimal header and the promoted content.
4. If no specific directory is referenced — append to the project root CLAUDE.md.

Promoted content goes under a `## Knowledge` section. Claude merges related entries into coherent paragraphs rather than dumping entries verbatim.

## After Promotion

Delete the entry from the brain with `brain_delete`. This minimizes token usage — the knowledge now lives in CLAUDE.md (loaded every message) and doesn't need a brain entry consuming search result slots.

## Integration Points

### `/brain-sync` (new slash command, on-demand)

1. Run `brain_consolidate` to get all entries for the current project
2. Filter to promotion candidates using the criteria above
3. If no candidates, report and exit
4. List candidates with titles and brief summaries
5. Ask the user which to promote (all, some, or none)
6. For each approved entry: read target CLAUDE.md, determine placement, edit file, `brain_delete` the entry
7. Report what was promoted and where

### Consolidation hook (passive, during `/goodbye` and `/exit`)

After normal cleanup, scan remaining entries for promotion candidates. If any exist, mention: "N entries are stable enough to promote to CLAUDE.md. Run `/brain-sync` to review them." Do NOT auto-promote — just flag.

### `knowledge-base.md` instruction update

Add a "Knowledge Promotion" section documenting the criteria and `/brain-sync` command. Update "Before Session Ends" to include candidate flagging.

## File Changes

| File | Change |
|------|--------|
| `commands/brain-sync.md` | New slash command with full promotion workflow |
| `knowledge-base.md` (template in `install.sh` + `commands/brain-init.md`) | Add promotion section, update session-end instructions |
| `commands/goodbye.md` | Add promotion candidate flagging after consolidation |
| `commands/exit.md` | Add promotion candidate flagging after consolidation |
| `install.sh` | No changes needed (already copies all commands) |
| `src/` | No changes |
