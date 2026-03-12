# Upgrading

## v2.0 — Tiered Memory with Source Tracking

### What changed

- **When to store knowledge:** No longer "add immediately." Knowledge is stored at commit time, after research, or when discovering a pattern/anti-pattern.
- **4 tiers replace 6 categories:** `map`, `decision`, `pattern`, `api` (removed: `debugging`, `config`, `architecture`, `general`)
- **Source tracking:** New `source` and `source_type` fields on entries. Trust hierarchy (`docs` > `code`/`verified` > `research` > `inferred`) influences deduplication and conflict resolution.
- **Targeted consolidation:** `brain_consolidate` no longer dumps all entries. It surfaces only stale maps, never-accessed entries, and low-confidence items. Full sweep runs automatically every 10th call or with `full=true`.

### How to upgrade

```bash
git pull
npm install
npm run build
```

The database is migrated automatically on first start:

1. `source` and `source_type` columns are added to the entries table
2. A `metadata` table is created for tracking consolidation state
3. Existing categories are remapped:
   - `architecture` → `map`
   - `debugging` → `pattern`
   - `config` → `decision`
   - `general` → `pattern`
   - `pattern` and `api` stay as-is
4. The FTS5 search index is rebuilt to include the `source` field

### After upgrading

Run `/brain-init` to update your `~/.claude/CLAUDE.md` with the new knowledge strategy instructions.

The automatic category mappings are rough defaults. To review your entries:

```
brain_consolidate full=true
```

This shows all entries grouped by tier. Reclassify anything that doesn't fit — e.g. a `debugging` entry that was a one-off fix (should be deleted) vs. a generalizable lesson (correct as `pattern`).

Existing entries will have `source` and `source_type` set to `null`. You can update them over time as you encounter them, or leave them — the system works fine with unset source fields.
