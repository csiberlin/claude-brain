End a dead-end session. Delete speculative insights tied to the failed approach.

This session's implementation didn't work out, but confirmed knowledge (including api entries which are confirmed by default) is preserved. Speculative entries from this session are deleted since the approach was abandoned.

## Steps

1. Call `brain_search` with `status: "speculative"` and the current project to see what's pending.
   - If no speculative entries: report "No speculative entries to clean up." and skip to step 3.
2. Review each speculative entry:
   - **Delete** speculative entries tied to the failed approach — call `brain_delete` for each.
   - **Promote** any speculative entries that are actually general knowledge (not implementation-specific) — call `brain_upsert` with `confirmed: true`.
   - Report: "Deleted N speculative entries, promoted M to confirmed."
3. Run consolidation (the failed approach may have left conflicting knowledge):
   - Call `brain_maintain` to review entries needing attention.
   - Review flagged entries: stale maps, never-accessed entries, low-confidence items.
   - Use `brain_upsert` to refresh stale maps, `brain_delete` to remove dead entries.
   - Use `brain_maintain` with `deduplicate=true` if cross-project duplicates are flagged.
4. Say goodbye.
