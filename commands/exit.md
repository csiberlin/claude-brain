Before ending this session, consolidate your knowledge base:

1. Check if `~/.claude/pending-insights.jsonl` exists and has content. If it does, warn: "You have N pending insights in the buffer. Run `/brain-keep` or `/brain-abandon` first to flush them." Do NOT flush automatically — let the user decide.
2. Call `brain_consolidate` to review entries needing attention (targeted by default, full sweep every 10th session).
3. Review flagged entries: stale maps, never-accessed entries, low-confidence items.
4. Use `brain_update` to refresh stale maps, `brain_delete` to remove dead entries.
5. Use `brain_deduplicate` if cross-project duplicates are flagged.
6. Check if any remaining entries qualify for promotion to CLAUDE.md — entries in `map`, `pattern`, or `decision` categories that are more than 7 days old and project-scoped. If candidates exist, tell the user: "N brain entries are stable enough to promote to CLAUDE.md. Run /brain-sync to review them."
7. Once cleanup is complete, say goodbye.
