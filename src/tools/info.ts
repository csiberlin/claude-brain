import { getDb } from "../db.js";
import { InfoSchema } from "../types.js";
import { statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { z } from "zod";

interface CountRow { count: number; }
interface ProjectRow { project: string; count: number; }
interface CategoryRow { category: string; count: number; }
interface TagRow { tag: string; count: number; }

export function getInfo(args: z.infer<typeof InfoSchema>): string {
  const db = getDb();
  const { project, include_tags } = args;

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
    db.prepare(
      `SELECT COUNT(*) as count FROM entries e LEFT JOIN embeddings emb ON e.id = emb.entry_id WHERE emb.entry_id IS NULL ${projectFilter ? "AND (e.project = @project OR e.project IS NULL)" : ""}`
    ).get(params) as CountRow
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

  // Source type breakdown
  const sourceTypes = db
    .prepare(
      `SELECT COALESCE(source_type, 'unset') as source_type, COUNT(*) as count FROM entries ${whereClause} GROUP BY source_type ORDER BY count DESC`
    )
    .all(params) as Array<{ source_type: string; count: number }>;
  const sourceTypesStr = sourceTypes.map((s) => `${s.source_type}(${s.count})`).join(", ");

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
    db.prepare(
      `SELECT COUNT(*) as count FROM entries ${whereClause ? whereClause + " AND" : "WHERE"} access_count = 0`
    ).get(params) as CountRow
  ).count;

  // Tag query (used for both count-only and full listing)
  const tagSql = projectFilter
    ? `SELECT trim(value) as tag, COUNT(*) as count FROM entries, json_each('["' || replace(tags, ',', '","') || '"]') WHERE tags != '' AND (project = @project OR project IS NULL) GROUP BY trim(value) ORDER BY count DESC`
    : `SELECT trim(value) as tag, COUNT(*) as count FROM entries, json_each('["' || replace(tags, ',', '","') || '"]') WHERE tags != '' GROUP BY trim(value) ORDER BY count DESC`;

  const tagRows = db.prepare(tagSql).all(params) as TagRow[];

  const lines = [
    "Knowledge Base Info:",
    `  Entries: ${total} (${withEmbeddings} with embeddings, ${withoutEmbeddings} without)`,
    `  Projects: ${projectsStr || "none"}`,
    `  Categories: ${categoriesStr || "none"}`,
    `  Source types: ${sourceTypesStr || "none"}`,
    `  Tags: ${tagRows.length} unique`,
    `  DB size: ${dbSize}`,
    `  Never accessed: ${neverAccessed} entries`,
  ];

  if (include_tags && tagRows.length > 0) {
    lines.push(`  Tag details: ${tagRows.map((r) => `${r.tag}(${r.count})`).join(", ")}`);
  }

  return lines.join("\n");
}
