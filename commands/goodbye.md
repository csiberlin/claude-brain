Before ending this session, flush your insight buffer and consolidate knowledge. This command is an alias for `/brain-keep` — follow the same steps.

Run the `/brain-keep` workflow:

1. Check if `~/.claude/pending-insights.jsonl` exists and has content.
   - If empty or missing: report "No pending insights to flush." and skip to step 4.
2. Read the file. For each JSON line, call `brain_add` with the entry's fields (`title`, `content`, `tags`, `category`, `source`, `source_type`, `project`). Report how many entries were promoted.
3. Clear the file (write empty string to `~/.claude/pending-insights.jsonl`).
4. If 5 or more entries were promoted, run the consolidation steps:
   - Call `brain_consolidate` to review entries needing attention.
   - Review flagged entries: stale maps, never-accessed entries, low-confidence items.
   - Use `brain_update` to refresh stale maps, `brain_delete` to remove dead entries.
   - Use `brain_deduplicate` if cross-project duplicates are flagged.
   - Check if any entries qualify for promotion to CLAUDE.md — entries in `map`, `pattern`, or `decision` categories that are more than 7 days old and project-scoped. If candidates exist, tell the user: "N brain entries are stable enough to promote to CLAUDE.md. Run /brain-sync to review them."
5. Say goodbye.
