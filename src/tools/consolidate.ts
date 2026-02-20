import { getDb } from "../db.js";
import { ConsolidateSchema } from "../types.js";
import type { z } from "zod";

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
  updated_at: string;
}

export function consolidate(args: z.infer<typeof ConsolidateSchema>): string {
  const db = getDb();
  const { apply, min_projects } = args;

  // Find entries with similar titles across multiple projects
  // Group by normalized title (lowercase, trimmed) and category
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
    return "No consolidation candidates found.";
  }

  if (!apply) {
    // Dry-run: show candidates
    const lines = groups.map((g) => {
      const ids = g.ids.split(",");
      return (
        `"${g.title}" (${g.category})\n` +
        `  ${g.project_count} projects: ${g.projects}\n` +
        `  Entry IDs: ${ids.join(", ")}`
      );
    });
    return (
      `Consolidation candidates (${groups.length}):\n\n` +
      lines.join("\n---\n") +
      `\n\nRun with apply=true to merge these into general knowledge.`
    );
  }

  // Apply: for each group, keep the most recently updated entry,
  // promote it to general (project=NULL), merge unique tags, delete the rest
  const updateStmt = db.prepare(
    `UPDATE entries SET project = NULL, tags = @tags, updated_at = datetime('now') WHERE id = @id`
  );
  const deleteStmt = db.prepare(`DELETE FROM entries WHERE id = @id`);

  let merged = 0;
  let deleted = 0;

  const transaction = db.transaction(() => {
    for (const group of groups) {
      const ids = group.ids.split(",").map(Number);

      // Fetch all entries in this group
      const entries = db
        .prepare(
          `SELECT * FROM entries WHERE id IN (${ids.map(() => "?").join(",")})`
        )
        .all(...ids) as EntryRow[];

      // Pick the most recently updated entry as the "winner"
      entries.sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      const winner = entries[0];

      // Merge all unique tags
      const allTags = new Set<string>();
      for (const entry of entries) {
        for (const tag of entry.tags.split(",")) {
          const t = tag.trim().toLowerCase();
          if (t) allTags.add(t);
        }
      }

      // Promote winner to general, with merged tags
      updateStmt.run({ id: winner.id, tags: [...allTags].join(",") });
      merged++;

      // Delete the rest
      for (const entry of entries.slice(1)) {
        deleteStmt.run({ id: entry.id });
        deleted++;
      }
    }
  });

  transaction();

  return (
    `Consolidated ${groups.length} groups:\n` +
    `  ${merged} entries promoted to general knowledge\n` +
    `  ${deleted} duplicate entries removed`
  );
}
