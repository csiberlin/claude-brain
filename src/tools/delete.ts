import { getDb } from "../db.js";
import { DeleteSchema } from "../types.js";
import type { z } from "zod";

export function deleteKnowledge(args: z.infer<typeof DeleteSchema>): string {
  const db = getDb();
  const { id } = args;

  const result = db.prepare("DELETE FROM entries WHERE id = @id").run({ id });

  if (result.changes === 0) {
    return `Entry [${id}] not found.`;
  }

  return `Deleted entry [${id}].`;
}
