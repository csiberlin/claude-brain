import { getDb } from "../db.js";
import { AddSchema } from "../types.js";
import {
  generateEmbedding,
  buildEmbeddingText,
  storeEmbedding,
} from "../embeddings.js";
import type { z } from "zod";

export async function addKnowledge(
  args: z.infer<typeof AddSchema>
): Promise<string> {
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

  const entryId = result.lastInsertRowid as number;

  try {
    const embedding = await generateEmbedding(buildEmbeddingText(title, content));
    storeEmbedding(entryId, embedding);
  } catch {
    // Embedding generation failed — entry is still saved
  }

  return `Added entry [${entryId}]: ${title}`;
}
