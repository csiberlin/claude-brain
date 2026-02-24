Before ending this session, consolidate your knowledge base:

1. Call `brain_consolidate` to retrieve all knowledge entries for review.
2. Review the returned entries carefully for contradictions, redundancies, and outdated information.
3. Use `brain_update` to fix or merge entries, `brain_delete` to remove bad ones, and `brain_deduplicate` to merge cross-project duplicates.
4. Check if any remaining entries qualify for promotion to CLAUDE.md — entries in `architecture`, `pattern`, or `config` categories that are more than 7 days old and project-scoped. If candidates exist, tell the user: "N brain entries are stable enough to promote to CLAUDE.md. Run /brain-sync to review them."
5. Once cleanup is complete, say goodbye.
