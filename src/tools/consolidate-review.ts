import { getDb } from "../db.js";
import { ConsolidateReviewSchema } from "../types.js";
import type { z } from "zod";
import type { Entry } from "../types.js";

const OUTPUT_CAP = 20;

interface MetadataRow {
  value: string;
}

function getConsolidationCount(db: ReturnType<typeof getDb>): number {
  const row = db.prepare(
    `SELECT value FROM metadata WHERE key = 'consolidation_count'`
  ).get() as MetadataRow | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

function incrementConsolidationCount(db: ReturnType<typeof getDb>): number {
  const current = getConsolidationCount(db);
  const next = current + 1;
  db.prepare(
    `INSERT OR REPLACE INTO metadata (key, value) VALUES ('consolidation_count', @value)`
  ).run({ value: String(next) });
  return next;
}

export function consolidateReview(args: z.infer<typeof ConsolidateReviewSchema>): string {
  const db = getDb();
  const { project, full } = args;

  const count = incrementConsolidationCount(db);
  const isFullReview = full || (count % 10 === 0);

  const projectFilter = project !== undefined;
  const whereBase = projectFilter
    ? "WHERE (e.project = @project OR e.project IS NULL)"
    : "";
  const params: Record<string, unknown> = projectFilter ? { project } : {};

  if (isFullReview) {
    return fullReview(db, whereBase, params, count);
  }

  return targetedReview(db, whereBase, params, count);
}

function targetedReview(
  db: ReturnType<typeof getDb>,
  whereBase: string,
  params: Record<string, unknown>,
  count: number
): string {
  const untilFull = 10 - (count % 10);
  const candidates: Array<{ entry: Entry; reason: string }> = [];

  // 1. Stale maps (category='map', updated > 14 days ago)
  const staleMaps = db.prepare(`
    SELECT * FROM entries e
    ${whereBase ? whereBase + " AND" : "WHERE"}
    e.category = 'map'
    AND e.updated_at < datetime('now', '-14 days')
    ORDER BY e.updated_at ASC
  `).all(params) as Entry[];

  for (const e of staleMaps) {
    candidates.push({ entry: e, reason: "Stale map (>14 days)" });
  }

  // 2. Never-accessed entries (access_count=0, created > 7 days ago)
  const neverAccessed = db.prepare(`
    SELECT * FROM entries e
    ${whereBase ? whereBase + " AND" : "WHERE"}
    e.access_count = 0
    AND e.created_at < datetime('now', '-7 days')
    ORDER BY e.created_at ASC
  `).all(params) as Entry[];

  for (const e of neverAccessed) {
    if (!candidates.some(c => c.entry.id === e.id)) {
      candidates.push({ entry: e, reason: "Never accessed (>7 days)" });
    }
  }

  // 3. Low-confidence entries (inferred/research, >30 days, access_count < 3)
  const lowConfidence = db.prepare(`
    SELECT * FROM entries e
    ${whereBase ? whereBase + " AND" : "WHERE"}
    e.source_type IN ('inferred', 'research')
    AND e.updated_at < datetime('now', '-30 days')
    AND e.access_count < 3
    ORDER BY e.access_count ASC, e.updated_at ASC
  `).all(params) as Entry[];

  for (const e of lowConfidence) {
    if (!candidates.some(c => c.entry.id === e.id)) {
      candidates.push({ entry: e, reason: "Low confidence + low access" });
    }
  }

  if (candidates.length === 0) {
    return `Targeted review (${untilFull}/10 until full review): no items need attention.`;
  }

  const shown = candidates.slice(0, OUTPUT_CAP);
  const lines: string[] = [
    `Targeted review (${untilFull}/10 until full review): ${candidates.length} items need attention`,
    "",
  ];

  for (const { entry: e, reason } of shown) {
    lines.push(`[${e.id}] ${e.title} (${e.category}${e.project ? ", " + e.project : ""})`);
    lines.push(`  Reason: ${reason} | Source: ${e.source_type ?? "unset"} | Accessed: ${e.access_count}x | Updated: ${e.updated_at}`);
    lines.push(`  ${e.content.slice(0, 150)}${e.content.length > 150 ? "..." : ""}`);
    lines.push("");
  }

  if (candidates.length > OUTPUT_CAP) {
    lines.push(`${OUTPUT_CAP} of ${candidates.length} candidates shown, run again for more.`);
  }

  lines.push("");
  lines.push("Actions: `brain_update` to refresh, `brain_delete` to remove, `brain_deduplicate` for cross-project merges.");

  return lines.join("\n");
}

function fullReview(
  db: ReturnType<typeof getDb>,
  whereBase: string,
  params: Record<string, unknown>,
  count: number
): string {
  const entries = db.prepare(`
    SELECT * FROM entries e
    ${whereBase}
    ORDER BY e.category, e.updated_at DESC
  `).all(params) as Entry[];

  if (entries.length === 0) {
    return "Full review (periodic sweep): no entries found.";
  }

  const grouped = new Map<string, Entry[]>();
  for (const entry of entries) {
    if (!grouped.has(entry.category)) grouped.set(entry.category, []);
    grouped.get(entry.category)!.push(entry);
  }

  const lines: string[] = [
    `Full review (periodic sweep, #${count}): ${entries.length} entries across ${grouped.size} tiers`,
    "",
    "Review all entries. Focus on:",
    "- Maps that may be stale (source files changed)",
    "- Entries with same `source` that may contradict each other",
    "- Redundant entries that can be merged",
    "- Low-trust entries that haven't been accessed",
    "",
    "---",
    "",
  ];

  for (const [category, catEntries] of grouped) {
    lines.push(`## ${category} (${catEntries.length})`);
    lines.push("");
    for (const e of catEntries) {
      lines.push(`### [${e.id}] ${e.title}`);
      lines.push(`Project: ${e.project ?? "(general)"} | Tags: ${e.tags || "(none)"} | Source: ${e.source ?? "unset"} (${e.source_type ?? "unset"}) | Updated: ${e.updated_at} | Accessed: ${e.access_count}x`);
      lines.push("");
      lines.push(e.content);
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }

  lines.push("Actions: `brain_update` to fix, `brain_delete` to remove, `brain_deduplicate` for cross-project merges.");

  return lines.join("\n");
}
