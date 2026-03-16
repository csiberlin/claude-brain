Before ending this session, consolidate your knowledge base:

1. Call `brain_search` with `status: "speculative"` and the current project. If speculative entries exist, warn: "You have N speculative entries. Run `/brain-keep` to promote them or `/brain-abandon` to clean up." Do NOT promote automatically — let the user decide.
2. Call `brain_maintain` to review entries needing attention (targeted by default, full sweep every 10th session).
3. Review flagged entries: stale maps, never-accessed entries, low-confidence items, orphaned speculative entries.
4. Use `brain_upsert` to refresh stale maps, `brain_delete` to remove dead entries.
5. Use `brain_maintain` with `deduplicate=true` if cross-project duplicates are flagged.
6. Check if any remaining entries qualify for promotion to CLAUDE.md — entries in `map`, `pattern`, or `decision` categories that are more than 7 days old and project-scoped. If candidates exist, tell the user: "N brain entries are stable enough to promote to CLAUDE.md. Run /brain-sync to review them."
7. Once cleanup is complete, say goodbye.
