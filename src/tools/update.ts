import { getDb } from "../db.js";
import { UpdateSchema } from "../types.js";
import type { Entry } from "../types.js";
import {
  generateEmbedding,
  buildEmbeddingText,
  storeEmbedding,
} from "../embeddings.js";
import type { z } from "zod";

export async function updateKnowledge(
  args: z.infer<typeof UpdateSchema>
): Promise<string> {
  const db = getDb();
  const { id, title, content, tags, category, project, source, source_type } = args;

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
  if (source !== undefined) {
    sets.push("source = @source");
    params.source = source;
  }
  if (source_type !== undefined) {
    sets.push("source_type = @source_type");
    params.source_type = source_type;
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

  if (title !== undefined || content !== undefined) {
    try {
      const row = db
        .prepare(`SELECT title, content FROM entries WHERE id = @id`)
        .get({ id }) as Pick<Entry, "title" | "content"> | undefined;
      if (row) {
        const embedding = await generateEmbedding(
          buildEmbeddingText(row.title, row.content)
        );
        storeEmbedding(id, embedding);
      }
    } catch {
      // Embedding regeneration failed — update still succeeded
    }
  }

  return `Updated entry [${id}].`;
}
