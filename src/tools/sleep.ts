import { getDb } from "../db.js";
import { SleepSchema } from "../types.js";
import type { z } from "zod";
import type { Entry } from "../types.js";

export function sleep(args: z.infer<typeof SleepSchema>): string {
  const db = getDb();
  const { project } = args;

  let entries: Entry[];
  if (project) {
    entries = db
      .prepare(
        "SELECT * FROM entries WHERE project = @project OR project IS NULL ORDER BY category, updated_at DESC"
      )
      .all({ project }) as Entry[];
  } else {
    entries = db
      .prepare("SELECT * FROM entries ORDER BY category, updated_at DESC")
      .all() as Entry[];
  }

  if (entries.length === 0) {
    return "No knowledge entries found. Nothing to review.";
  }

  // Group by category
  const grouped = new Map<string, Entry[]>();
  for (const entry of entries) {
    const cat = entry.category;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(entry);
  }

  const lines: string[] = [
    "# Knowledge Base Review (Sleep Mode)",
    "",
    `Total entries: ${entries.length}` +
      (project ? ` (project: ${project} + general)` : " (all projects)"),
    "",
    "## Instructions",
    "",
    "Review these entries carefully. Take the following actions using the available tools:",
    "- **Delete** outdated or incorrect entries with `brain_delete`",
    "- **Merge** redundant entries: update the better one with `brain_update`, delete the other with `brain_delete`",
    "- **Fix** contradictions: keep the correct/newer entry, delete the wrong one",
    "- **Update** entries with stale or incomplete information using `brain_update`",
    "- Use `brain_deduplicate` to merge cross-project duplicates",
    "",
    "---",
    "",
  ];

  for (const [category, catEntries] of grouped) {
    lines.push(`## ${category} (${catEntries.length})`);
    lines.push("");
    for (const e of catEntries) {
      lines.push(`### [${e.id}] ${e.title}`);
      lines.push(`Project: ${e.project ?? "(general)"} | Tags: ${e.tags || "(none)"} | Updated: ${e.updated_at}`);
      lines.push("");
      lines.push(e.content);
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}
