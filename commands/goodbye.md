Before ending this session, flush speculative insights and consolidate knowledge. This command is an alias for `/brain-keep` — follow the same steps.

Run the `/brain-keep` workflow:

1. Call `brain_search` with `status: "speculative"` and the current project to see what's pending.
   - If no speculative entries: report "No speculative entries to promote." and skip to step 3.
2. For each speculative entry, call `brain_upsert` with `id` and `confirmed: true` to promote it. Report how many entries were promoted.
3. If 5 or more entries were promoted, run the consolidation steps:
   - Call `brain_maintain` to review entries needing attention.
   - Review flagged entries: stale maps, never-accessed entries, low-confidence items.
   - Use `brain_upsert` to refresh stale maps, `brain_delete` to remove dead entries.
   - Use `brain_maintain` with `deduplicate=true` if cross-project duplicates are flagged.
   - Check if any entries qualify for promotion to CLAUDE.md — entries in `map`, `pattern`, or `decision` categories that are more than 7 days old and project-scoped. If candidates exist, tell the user: "N brain entries are stable enough to promote to CLAUDE.md. Run /brain-sync to review them."
4. Say goodbye.
