import { getDb } from "../db.js";
import { UpsertSchema } from "../types.js";
import type { Entry } from "../types.js";
import {
  generateEmbedding,
  buildEmbeddingText,
  storeEmbedding,
} from "../embeddings.js";
import type { z } from "zod";

export async function upsertKnowledge(
  args: z.infer<typeof UpsertSchema>
): Promise<string> {
  const { id } = args;
  return id !== undefined ? updateEntry(id, args) : addEntry(args);
}

async function addEntry(
  args: z.infer<typeof UpsertSchema>
): Promise<string> {
  const { title, content, tags, category, project, source, source_type } = args;

  if (!title || !content || !tags) {
    return "Error: title, content, and tags are required when creating a new entry.";
  }
  if (source_type && !source) {
    return "Error: source is required when source_type is set.";
  }

  const db = getDb();
  const normalizedTags = tags
    .map((t) => t.toLowerCase().trim())
    .filter(Boolean)
    .join(",");

  const result = db
    .prepare(
      `INSERT INTO entries (title, content, tags, category, project, source, source_type)
       VALUES (@title, @content, @tags, @category, @project, @source, @source_type)`
    )
    .run({
      title,
      content,
      tags: normalizedTags,
      category: category ?? "pattern",
      project: project ?? null,
      source: source ?? null,
      source_type: source_type ?? null,
    });

  const entryId = result.lastInsertRowid as number;

  try {
    const embedding = await generateEmbedding(buildEmbeddingText(title, content));
    storeEmbedding(entryId, embedding);
  } catch {
    // Embedding generation failed — entry is still saved
  }

  return `Added entry [${entryId}]: ${title}`;
}

async function updateEntry(
  id: number,
  args: z.infer<typeof UpsertSchema>
): Promise<string> {
  const db = getDb();
  const { title, content, tags, category, project, source, source_type } = args;

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
