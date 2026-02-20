import { getDb } from "../db.js";
import { UpdateSchema } from "../types.js";
import type { z } from "zod";

export function updateKnowledge(args: z.infer<typeof UpdateSchema>): string {
  const db = getDb();
  const { id, title, content, tags, category, project } = args;

  const sets: string[] = ["updated_at = datetime('now')"];
  const params: Record<string, unknown> = { id };

  if (title !== undefined) {
    sets.push("title = @title");
    params.title = title;
  }
  if (content !== undefined) {
    sets.push("content = @content");
    params.content = content;
  }
  if (tags !== undefined) {
    sets.push("tags = @tags");
    params.tags = tags.map((t) => t.toLowerCase().trim()).filter(Boolean).join(",");
  }
  if (category !== undefined) {
    sets.push("category = @category");
    params.category = category;
  }
  if (project !== undefined) {
    sets.push("project = @project");
    params.project = project;
  }

  if (sets.length === 1) {
    return "No fields to update.";
  }

  const result = db
    .prepare(`UPDATE entries SET ${sets.join(", ")} WHERE id = @id`)
    .run(params);

  if (result.changes === 0) {
    return `Entry [${id}] not found.`;
  }

  return `Updated entry [${id}].`;
}
