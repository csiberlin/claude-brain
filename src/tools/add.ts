import { getDb } from "../db.js";
import { AddSchema } from "../types.js";
import type { z } from "zod";

export function addKnowledge(args: z.infer<typeof AddSchema>): string {
  const db = getDb();
  const { title, content, tags, category, project } = args;

  const normalizedTags = tags
    .map((t) => t.toLowerCase().trim())
    .filter(Boolean)
    .join(",");

  const result = db
    .prepare(
      `INSERT INTO entries (title, content, tags, category, project)
       VALUES (@title, @content, @tags, @category, @project)`
    )
    .run({
      title,
      content,
      tags: normalizedTags,
      category,
      project: project ?? null,
    });

  return `Added entry [${result.lastInsertRowid}]: ${title}`;
}
