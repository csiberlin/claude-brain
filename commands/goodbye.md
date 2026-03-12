Before ending this session, consolidate your knowledge base:

1. Call `brain_consolidate` to review entries needing attention (targeted by default, full sweep every 10th session).
2. Review flagged entries: stale maps, never-accessed entries, low-confidence items.
3. Use `brain_update` to refresh stale maps, `brain_delete` to remove dead entries.
4. Use `brain_deduplicate` if cross-project duplicates are flagged.
5. Check if any remaining entries qualify for promotion to CLAUDE.md — entries in `map`, `pattern`, or `decision` categories that are more than 7 days old and project-scoped. If candidates exist, tell the user: "N brain entries are stable enough to promote to CLAUDE.md. Run /brain-sync to review them."
6. Once cleanup is complete, say goodbye.
