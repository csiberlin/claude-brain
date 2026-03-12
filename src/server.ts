import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SearchSchema, AddSchema, UpdateSchema, DeleteSchema, ListTagsSchema, ConsolidateSchema, SleepSchema, StatsSchema } from "./types.js";
import { searchKnowledge } from "./tools/search.js";
import { addKnowledge } from "./tools/add.js";
import { updateKnowledge } from "./tools/update.js";
import { deleteKnowledge } from "./tools/delete.js";
import { listTags } from "./tools/list-tags.js";
import { consolidate } from "./tools/consolidate.js";
import { sleep } from "./tools/sleep.js";
import { getStats } from "./tools/stats.js";
import { getDetectedProject } from "./project.js";

export function registerTools(server: McpServer): void {
  server.tool(
    "brain_search",
    "Search knowledge base. Returns ranked snippets to save tokens. Auto-detects current project.",
    SearchSchema.shape,
    async (args) => {
      const parsed = SearchSchema.parse(args);
      if (parsed.project === undefined) {
        parsed.project = getDetectedProject() ?? undefined;
      }
      return {
        content: [{ type: "text", text: await searchKnowledge(parsed) }],
      };
    }
  );

  server.tool(
    "brain_add",
    "Store a new insight, pattern, or solution. Auto-tags with current project.",
    AddSchema.shape,
    async (args) => {
      const parsed = AddSchema.parse(args);
      if (parsed.project === undefined) {
        parsed.project = getDetectedProject() ?? undefined;
      }
      return {
        content: [{ type: "text", text: await addKnowledge(parsed) }],
      };
    }
  );

  server.tool(
    "brain_update",
    "Update an existing knowledge entry by ID.",
    UpdateSchema.shape,
    async (args) => ({
      content: [{ type: "text", text: await updateKnowledge(UpdateSchema.parse(args)) }],
    })
  );

  server.tool(
    "brain_delete",
    "Delete a knowledge entry by ID.",
    DeleteSchema.shape,
    async (args) => ({
      content: [{ type: "text", text: deleteKnowledge(DeleteSchema.parse(args)) }],
    })
  );

  server.tool(
    "brain_list_tags",
    "List all tags with counts. Low-token discovery tool.",
    ListTagsSchema.shape,
    async (args) => ({
      content: [{ type: "text", text: listTags(ListTagsSchema.parse(args)) }],
    })
  );

  server.tool(
    "brain_deduplicate",
    "Find and merge duplicate entries across projects into general knowledge. Use apply=false for dry-run.",
    ConsolidateSchema.shape,
    async (args) => ({
      content: [{ type: "text", text: consolidate(ConsolidateSchema.parse(args)) }],
    })
  );

  server.tool(
    "brain_consolidate",
    "Review all knowledge entries for cleanup before session ends. Returns entries grouped by category with instructions. Auto-detects current project.",
    SleepSchema.shape,
    async (args) => {
      const parsed = SleepSchema.parse(args);
      if (parsed.project === undefined) {
        parsed.project = getDetectedProject() ?? undefined;
      }
      return {
        content: [{ type: "text", text: sleep(parsed) }],
      };
    }
  );

  server.tool(
    "brain_stats",
    "Knowledge base statistics: entry counts, embedding coverage, project/category breakdown, DB size. Low-token overview.",
    StatsSchema.shape,
    async (args) => {
      const parsed = StatsSchema.parse(args);
      if (parsed.project === undefined) {
        parsed.project = getDetectedProject() ?? undefined;
      }
      return {
        content: [{ type: "text", text: getStats(parsed) }],
      };
    }
  );

}
