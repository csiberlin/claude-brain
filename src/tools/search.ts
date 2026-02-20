import { getDb } from "../db.js";
import { SearchSchema } from "../types.js";
import {
  generateEmbedding,
  loadEmbeddingsForProject,
  rankByVector,
} from "../embeddings.js";
import type { z } from "zod";

interface SearchResult {
  id: number;
  title: string;
  tags: string;
  category: string;
  project: string | null;
  content_snippet: string;
}

interface EntryRow {
  id: number;
  title: string;
  tags: string;
  category: string;
  project: string | null;
  content: string;
}

export async function searchKnowledge(
  args: z.infer<typeof SearchSchema>
): Promise<string> {
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

  // --- FTS5 search ---
  const conditions: string[] = ["entries_fts MATCH @query"];
  const params: Record<string, unknown> = { query: ftsQuery, limit: limit * 3 };

  if (project !== undefined) {
    conditions.push("(e.project = @project OR e.project IS NULL)");
    params.project = project;
  }

  if (category !== undefined) {
    conditions.push("e.category = @category");
    params.category = category;
  }

  const ftsSql = `
    SELECT e.id, e.title, e.tags, e.category, e.project,
           snippet(entries_fts, 1, '>>>', '<<<', '...', 40) as content_snippet
    FROM entries_fts
    JOIN entries e ON e.id = entries_fts.rowid
    WHERE ${conditions.join(" AND ")}
    ORDER BY rank
    LIMIT @limit
  `;

  const ftsResults = db.prepare(ftsSql).all(params) as SearchResult[];

  // --- Vector search (best-effort) ---
  let vectorRankedIds: number[] = [];
  try {
    const queryEmbedding = await generateEmbedding(query);
    const embeddings = loadEmbeddingsForProject(project);
    if (embeddings.size > 0) {
      vectorRankedIds = rankByVector(queryEmbedding, embeddings, limit * 3);
    }
  } catch {
    // Embedding unavailable — fall back to FTS-only
  }

  // --- Merge with Reciprocal Rank Fusion ---
  if (vectorRankedIds.length === 0) {
    // No vector results — return FTS only (trimmed to limit)
    const trimmed = ftsResults.slice(0, limit);
    if (trimmed.length === 0) {
      return "No matching entries found.";
    }
    return formatResults(trimmed);
  }

  const K = 60;
  const scores = new Map<number, number>();

  // FTS ranks
  for (let i = 0; i < ftsResults.length; i++) {
    const id = ftsResults[i].id;
    scores.set(id, (scores.get(id) ?? 0) + 1 / (K + i));
  }

  // Vector ranks
  for (let i = 0; i < vectorRankedIds.length; i++) {
    const id = vectorRankedIds[i];
    scores.set(id, (scores.get(id) ?? 0) + 1 / (K + i));
  }

  // Sort by RRF score descending
  const merged = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  // Build lookup of FTS results by id
  const ftsById = new Map(ftsResults.map((r) => [r.id, r]));

  // For vector-only hits, fetch entry data
  const vectorOnlyIds = merged
    .map(([id]) => id)
    .filter((id) => !ftsById.has(id));

  if (vectorOnlyIds.length > 0) {
    const placeholders = vectorOnlyIds.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT id, title, tags, category, project, substr(content, 1, 200) as content
         FROM entries WHERE id IN (${placeholders})`
      )
      .all(...vectorOnlyIds) as EntryRow[];
    for (const row of rows) {
      ftsById.set(row.id, {
        id: row.id,
        title: row.title,
        tags: row.tags,
        category: row.category,
        project: row.project,
        content_snippet: row.content,
      });
    }
  }

  const results = merged
    .map(([id]) => ftsById.get(id))
    .filter((r): r is SearchResult => r !== undefined);

  if (results.length === 0) {
    return "No matching entries found.";
  }

  return formatResults(results);
}

function formatResults(results: SearchResult[]): string {
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
