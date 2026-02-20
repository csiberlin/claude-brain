import { getDb } from "../db.js";
import { SearchSchema } from "../types.js";
import type { z } from "zod";

interface SearchResult {
  id: number;
  title: string;
  tags: string;
  category: string;
  project: string | null;
  content_snippet: string;
}

export function searchKnowledge(args: z.infer<typeof SearchSchema>): string {
  const db = getDb();
  const { query, project, category, limit } = args;

  // Escape FTS5 special characters and build query
  const ftsQuery = query
    .replace(/['"]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term}"`)
    .join(" OR ");

  if (!ftsQuery) {
    return "No search terms provided.";
  }

  const conditions: string[] = ["entries_fts MATCH @query"];
  const params: Record<string, unknown> = { query: ftsQuery, limit };

  if (project !== undefined) {
    conditions.push("(e.project = @project OR e.project IS NULL)");
    params.project = project;
  }

  if (category !== undefined) {
    conditions.push("e.category = @category");
    params.category = category;
  }

  const sql = `
    SELECT e.id, e.title, e.tags, e.category, e.project,
           snippet(entries_fts, 1, '>>>', '<<<', '...', 40) as content_snippet
    FROM entries_fts
    JOIN entries e ON e.id = entries_fts.rowid
    WHERE ${conditions.join(" AND ")}
    ORDER BY rank
    LIMIT @limit
  `;

  const results = db.prepare(sql).all(params) as SearchResult[];

  if (results.length === 0) {
    return "No matching entries found.";
  }

  return (
    `Found ${results.length} entries:\n\n` +
    results
      .map(
        (r) =>
          `[${r.id}] ${r.title} (${r.category}${r.project ? ", " + r.project : ""})\n` +
          `Tags: ${r.tags}\n` +
          `${r.content_snippet}`
      )
      .join("\n---\n")
  );
}
