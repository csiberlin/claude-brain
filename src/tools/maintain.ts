import { getDb } from "../db.js";
import { MaintainSchema } from "../types.js";
import type { Entry } from "../types.js";
import type { z } from "zod";

const OUTPUT_CAP = 20;

const TRUST_ORDER: Record<string, number> = {
  docs: 5,
  code: 4,
  verified: 4,
  research: 3,
  inferred: 2,
};

function trustScore(sourceType: string | null): number {
  if (!sourceType) return 1;
  return TRUST_ORDER[sourceType] ?? 1;
}

interface MetadataRow { value: string; }
interface DuplicateGroup {
  title: string;
  tags: string;
  category: string;
  ids: string;
  projects: string;
  project_count: number;
}
interface EntryRow {
  id: number;
  title: string;
  content: string;
  tags: string;
  category: string;
  project: string | null;
  source_type: string | null;
  updated_at: string;
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

export function maintain(args: z.infer<typeof MaintainSchema>): string {
  const db = getDb();
  const { project, full, deduplicate: runDedup, apply_dedup, min_projects } = args;

  const count = incrementConsolidationCount(db);
  const isFullReview = full || (count % 10 === 0);

  const projectFilter = project !== undefined;
  const whereBase = projectFilter
    ? "WHERE (e.project = @project OR e.project IS NULL)"
    : "";
  const params: Record<string, unknown> = projectFilter ? { project } : {};

  const parts: string[] = [];

  if (isFullReview) {
    parts.push(fullReview(db, whereBase, params, count));
  } else {
    parts.push(targetedReview(db, whereBase, params, count));
  }

  if (runDedup) {
    parts.push("");
    parts.push(deduplicateEntries(db, apply_dedup, min_projects));
  }

  return parts.join("\n");
}

function targetedReview(
  db: ReturnType<typeof getDb>,
  whereBase: string,
  params: Record<string, unknown>,
  count: number
): string {
  const untilFull = 10 - (count % 10);
  const candidates: Array<{ entry: Entry; reason: string }> = [];

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

  // Orphaned speculative entries (never promoted, session likely ended without /brain-keep)
  const orphanedSpeculative = db.prepare(`
    SELECT * FROM entries e
    ${whereBase ? whereBase + " AND" : "WHERE"}
    e.status = 'speculative'
    AND e.created_at < datetime('now', '-3 days')
    ORDER BY e.created_at ASC
  `).all(params) as Entry[];

  for (const e of orphanedSpeculative) {
    if (!candidates.some(c => c.entry.id === e.id)) {
      candidates.push({ entry: e, reason: "Orphaned speculative (>3 days, never promoted)" });
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
  lines.push("Actions: `brain_upsert` to refresh, `brain_delete` to remove. Use deduplicate=true for cross-project merges.");

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

  lines.push("Actions: `brain_upsert` to fix, `brain_delete` to remove. Use deduplicate=true for cross-project merges.");

  return lines.join("\n");
}

function deduplicateEntries(
  db: ReturnType<typeof getDb>,
  apply: boolean,
  min_projects: number
): string {
  const groups = db
    .prepare(
      `SELECT
        lower(trim(title)) as title,
        tags,
        category,
        group_concat(id) as ids,
        group_concat(DISTINCT project) as projects,
        COUNT(DISTINCT project) as project_count
      FROM entries
      WHERE project IS NOT NULL
      GROUP BY lower(trim(title)), category
      HAVING COUNT(DISTINCT project) >= @min_projects
      ORDER BY project_count DESC`
    )
    .all({ min_projects }) as DuplicateGroup[];

  if (groups.length === 0) {
    return "Deduplication: no candidates found.";
  }

  if (!apply) {
    const lines = groups.map((g) => {
      const ids = g.ids.split(",");
      return (
        `"${g.title}" (${g.category})\n` +
        `  ${g.project_count} projects: ${g.projects}\n` +
        `  Entry IDs: ${ids.join(", ")}`
      );
    });
    return (
      `Deduplication candidates (${groups.length}):\n\n` +
      lines.join("\n---\n") +
      `\n\nRun with apply_dedup=true to merge these into general knowledge.`
    );
  }

  const updateStmt = db.prepare(
    `UPDATE entries SET project = NULL, tags = @tags, updated_at = datetime('now') WHERE id = @id`
  );
  const deleteStmt = db.prepare(`DELETE FROM entries WHERE id = @id`);

  let merged = 0;
  let deleted = 0;

  const transaction = db.transaction(() => {
    for (const group of groups) {
      const ids = group.ids.split(",").map(Number);

      const entries = db
        .prepare(
          `SELECT id, title, content, tags, category, project, source_type, updated_at
           FROM entries WHERE id IN (${ids.map(() => "?").join(",")})`
        )
        .all(...ids) as EntryRow[];

      entries.sort((a, b) => {
        const trustDiff = trustScore(b.source_type) - trustScore(a.source_type);
        if (trustDiff !== 0) return trustDiff;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
      const winner = entries[0];

      const allTags = new Set<string>();
      for (const entry of entries) {
        for (const tag of entry.tags.split(",")) {
          const t = tag.trim().toLowerCase();
          if (t) allTags.add(t);
        }
      }

      updateStmt.run({ id: winner.id, tags: [...allTags].join(",") });
      merged++;

      for (const entry of entries.slice(1)) {
        deleteStmt.run({ id: entry.id });
        deleted++;
      }
    }
  });

  transaction();

  return (
    `Deduplicated ${groups.length} groups:\n` +
    `  ${merged} entries promoted to general knowledge (preferred by trust level)\n` +
    `  ${deleted} duplicate entries removed`
  );
}
