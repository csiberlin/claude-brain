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
  updated_at: string;
}

interface EntryRow {
  id: number;
  title: string;
  tags: string;
  category: string;
  project: string | null;
  content: string;
  updated_at: string;
}

function recencyBoost(updatedAt: string): number {
  const days =
    (Date.now() - new Date(updatedAt).getTime()) / 86_400_000;
  return 1 / (1 + days / 365);
}

export async function searchKnowledge(
  args: z.infer<typeof SearchSchema>
): Promise<string> {
  const db = getDb();
  const { query, project, category, limit, detail } = args;
  const isFull = detail === "full";

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

  const contentExpr = isFull
    ? "e.content as content_snippet"
    : "snippet(entries_fts, 1, '>>>', '<<<', '...', 40) as content_snippet";

  const ftsSql = `
    SELECT e.id, e.title, e.tags, e.category, e.project, e.updated_at,
           ${contentExpr}
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
  const K = 60;

  if (vectorRankedIds.length === 0) {
    // No vector results — combine FTS rank with recency and return
    const scored = ftsResults.map((r, i) => ({
      result: r,
      score: (1 / (K + i)) * recencyBoost(r.updated_at),
    }));
    scored.sort((a, b) => b.score - a.score);
    const trimmed = scored.slice(0, limit).map((s) => s.result);
    if (trimmed.length === 0) {
      return "No matching entries found.";
    }
    trackAccess(db, trimmed);
    return formatResults(trimmed);
  }

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

  // Build lookup of FTS results by id
  const ftsById = new Map(ftsResults.map((r) => [r.id, r]));

  // For vector-only hits, fetch entry data
  const allIds = [...scores.keys()];
  const vectorOnlyIds = allIds.filter((id) => !ftsById.has(id));

  if (vectorOnlyIds.length > 0) {
    const placeholders = vectorOnlyIds.map(() => "?").join(",");
    const contentCol = isFull ? "content" : "substr(content, 1, 200) as content";
    const rows = db
      .prepare(
        `SELECT id, title, tags, category, project, updated_at, ${contentCol}
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
        updated_at: row.updated_at,
      });
    }
  }

  // Apply recency boost to RRF scores
  for (const [id, score] of scores) {
    const entry = ftsById.get(id);
    if (entry?.updated_at) {
      scores.set(id, score * recencyBoost(entry.updated_at));
    }
  }

  // Sort by boosted RRF score descending
  const merged = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const results = merged
    .map(([id]) => ftsById.get(id))
    .filter((r): r is SearchResult => r !== undefined);

  if (results.length === 0) {
    return "No matching entries found.";
  }

  trackAccess(db, results);
  return formatResults(results);
}

function trackAccess(
  db: ReturnType<typeof getDb>,
  results: SearchResult[]
): void {
  const ids = results.map((r) => r.id);
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `UPDATE entries SET last_accessed = datetime('now'), access_count = access_count + 1 WHERE id IN (${placeholders})`
  ).run(...ids);
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
