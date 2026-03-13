End a dead-end session. Keep general knowledge, discard implementation-specific insights.

This session's implementation didn't work out, but we still learned things. This command keeps knowledge that's true regardless of the implementation (API behavior, library quirks, patterns) and discards knowledge tied to the failed approach (code maps, implementation decisions).

## Steps

1. Check if `~/.claude/pending-insights.jsonl` exists and has content.
   - If empty or missing: report "No pending insights to triage." and skip to step 4.
2. Read the file. For each JSON line, apply the category filter:
   - **Keep** (`api`, `pattern`): Call `brain_add` with the entry's fields. These are general knowledge — true regardless of whether the implementation worked.
   - **Discard** (`map`, `decision`): Skip these. They describe code structure and choices for an approach that didn't pan out.
   - Report: "Kept N entries (api/pattern), discarded M entries (map/decision)."
   - For high `tokens_spent` entries being discarded (>10000 tokens), mention them by title so the user can override if needed.
3. Clear the file (write empty string to `~/.claude/pending-insights.jsonl`).
4. Run consolidation (kept insights from a failed approach may conflict with existing knowledge):
   - Call `brain_consolidate` to review entries needing attention.
   - Review flagged entries: stale maps, never-accessed entries, low-confidence items.
   - Use `brain_update` to refresh stale maps, `brain_delete` to remove dead entries.
   - Use `brain_deduplicate` if cross-project duplicates are flagged.
5. Say goodbye.
