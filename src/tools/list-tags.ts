import { getDb } from "../db.js";
import { ListTagsSchema } from "../types.js";
import type { z } from "zod";

interface TagRow {
  tag: string;
  count: number;
}

export function listTags(args: z.infer<typeof ListTagsSchema>): string {
  const db = getDb();
  const { project } = args;

  // Split comma-separated tags, count occurrences
  let sql: string;
  let params: Record<string, unknown> = {};

  if (project !== undefined) {
    sql = `
      SELECT trim(value) as tag, COUNT(*) as count
      FROM entries, json_each('["' || replace(tags, ',', '","') || '"]')
      WHERE tags != '' AND (project = @project OR project IS NULL)
      GROUP BY trim(value)
      ORDER BY count DESC
    `;
    params.project = project;
  } else {
    sql = `
      SELECT trim(value) as tag, COUNT(*) as count
      FROM entries, json_each('["' || replace(tags, ',', '","') || '"]')
      WHERE tags != ''
      GROUP BY trim(value)
      ORDER BY count DESC
    `;
  }

  const rows = db.prepare(sql).all(params) as TagRow[];

  if (rows.length === 0) {
    return "No tags found.";
  }

  const tagList = rows.map((r) => `${r.tag}(${r.count})`).join(", ");
  return `Tags (${rows.length}): ${tagList}`;
}
