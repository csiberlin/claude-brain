import { getDb } from "../db.js";
import { DeduplicateSchema } from "../types.js";
import type { z } from "zod";

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

export function deduplicate(args: z.infer<typeof DeduplicateSchema>): string {
  const db = getDb();
  const { apply, min_projects } = args;

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
    return "No deduplication candidates found.";
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
      `\n\nRun with apply=true to merge these into general knowledge.`
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

      // Pick winner: highest trust, then most recent as tiebreaker
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
