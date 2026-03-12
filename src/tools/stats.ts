import { getDb } from "../db.js";
import { StatsSchema } from "../types.js";
import { statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { z } from "zod";

interface CountRow {
  count: number;
}

interface ProjectRow {
  project: string;
  count: number;
}

interface CategoryRow {
  category: string;
  count: number;
}

interface TagRow {
  tag: string;
}

export function getStats(args: z.infer<typeof StatsSchema>): string {
  const db = getDb();
  const { project } = args;

  const projectFilter = project !== undefined;
  const whereClause = projectFilter
    ? "WHERE project = @project OR project IS NULL"
    : "";
  const params: Record<string, unknown> = projectFilter ? { project } : {};

  // Total entries
  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM entries ${whereClause}`).get(params) as CountRow
  ).count;

  // Embedding coverage
  const withoutEmbeddings = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM entries e LEFT JOIN embeddings emb ON e.id = emb.entry_id WHERE emb.entry_id IS NULL ${projectFilter ? "AND (e.project = @project OR e.project IS NULL)" : ""}`
      )
      .get(params) as CountRow
  ).count;
  const withEmbeddings = total - withoutEmbeddings;

  // Projects breakdown
  const projects = db
    .prepare(
      `SELECT COALESCE(project, 'general') as project, COUNT(*) as count FROM entries ${whereClause} GROUP BY project ORDER BY count DESC`
    )
    .all(params) as ProjectRow[];
  const projectsStr = projects.map((p) => `${p.project}(${p.count})`).join(", ");

  // Categories breakdown
  const categories = db
    .prepare(
      `SELECT category, COUNT(*) as count FROM entries ${whereClause} GROUP BY category ORDER BY count DESC`
    )
    .all(params) as CategoryRow[];
  const categoriesStr = categories.map((c) => `${c.category}(${c.count})`).join(", ");

  // Unique tags
  const tagSql = projectFilter
    ? `SELECT DISTINCT trim(value) as tag FROM entries, json_each('["' || replace(tags, ',', '","') || '"]') WHERE tags != '' AND (project = @project OR project IS NULL)`
    : `SELECT DISTINCT trim(value) as tag FROM entries, json_each('["' || replace(tags, ',', '","') || '"]') WHERE tags != ''`;
  const uniqueTags = (db.prepare(tagSql).all(params) as TagRow[]).length;

  // DB size
  const dbPath = join(homedir(), ".claude", "knowledge.db");
  let dbSize: string;
  try {
    const bytes = statSync(dbPath).size;
    if (bytes < 1024) dbSize = `${bytes} B`;
    else if (bytes < 1024 * 1024) dbSize = `${(bytes / 1024).toFixed(1)} KB`;
    else dbSize = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } catch {
    dbSize = "unknown";
  }

  // Never accessed
  const neverAccessed = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM entries ${whereClause ? whereClause + " AND" : "WHERE"} access_count = 0`
      )
      .get(params) as CountRow
  ).count;

  const lines = [
    "Knowledge Base Stats:",
    `  Entries: ${total} (${withEmbeddings} with embeddings, ${withoutEmbeddings} without)`,
    `  Projects: ${projectsStr || "none"}`,
    `  Categories: ${categoriesStr || "none"}`,
    `  Tags: ${uniqueTags} unique`,
    `  DB size: ${dbSize}`,
    `  Never accessed: ${neverAccessed} entries`,
  ];

  return lines.join("\n");
}
