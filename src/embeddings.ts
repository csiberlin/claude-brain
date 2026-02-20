import { pipeline as hfPipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { getDb } from "./db.js";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

// Wrapper to avoid TS2590 from the heavily-overloaded pipeline() signature
const createPipeline = hfPipeline as (
  task: string,
  model: string,
  options: Record<string, unknown>
) => Promise<FeatureExtractionPipeline>;

let pipelineInstance: FeatureExtractionPipeline | null = null;

export async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipelineInstance) {
    pipelineInstance = await createPipeline("feature-extraction", MODEL_NAME, {
      dtype: "q8",
    });
  }
  return pipelineInstance;
}

export async function generateEmbedding(text: string): Promise<Float32Array> {
  const extractor = await getEmbeddingPipeline();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return new Float32Array(output.data as Float64Array);
}

export function buildEmbeddingText(title: string, content: string): string {
  return `${title}. ${content}`;
}

export function float32ToBlob(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

export function blobToFloat32(blob: Buffer): Float32Array {
  const ab = new ArrayBuffer(blob.byteLength);
  const view = new Uint8Array(ab);
  view.set(blob);
  return new Float32Array(ab);
}

export function storeEmbedding(entryId: number, embedding: Float32Array): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO embeddings (entry_id, embedding, model, created_at)
     VALUES (@entryId, @embedding, @model, datetime('now'))`
  ).run({
    entryId,
    embedding: float32ToBlob(embedding),
    model: MODEL_NAME,
  });
}

interface EmbeddingRow {
  entry_id: number;
  embedding: Buffer;
}

export function loadEmbeddingsForProject(
  project: string | undefined
): Map<number, Float32Array> {
  const db = getDb();
  let rows: EmbeddingRow[];

  if (project !== undefined) {
    rows = db
      .prepare(
        `SELECT emb.entry_id, emb.embedding
         FROM embeddings emb
         JOIN entries e ON e.id = emb.entry_id
         WHERE e.project = @project OR e.project IS NULL`
      )
      .all({ project }) as EmbeddingRow[];
  } else {
    rows = db
      .prepare(`SELECT entry_id, embedding FROM embeddings`)
      .all() as EmbeddingRow[];
  }

  const map = new Map<number, Float32Array>();
  for (const row of rows) {
    map.set(row.entry_id, blobToFloat32(row.embedding));
  }
  return map;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

export function rankByVector(
  queryEmbedding: Float32Array,
  embeddings: Map<number, Float32Array>,
  limit: number
): number[] {
  const scored: Array<{ id: number; score: number }> = [];
  for (const [id, emb] of embeddings) {
    scored.push({ id, score: cosineSimilarity(queryEmbedding, emb) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.id);
}
