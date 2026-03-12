import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SearchSchema, AddSchemaBase, AddSchema, UpdateSchema, DeleteSchema, ListTagsSchema, DeduplicateSchema, ConsolidateReviewSchema, StatsSchema } from "./types.js";
import { searchKnowledge } from "./tools/search.js";
import { addKnowledge } from "./tools/add.js";
import { updateKnowledge } from "./tools/update.js";
import { deleteKnowledge } from "./tools/delete.js";
import { listTags } from "./tools/list-tags.js";
import { deduplicate } from "./tools/deduplicate.js";
import { consolidateReview } from "./tools/consolidate-review.js";
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
    "Store a new insight, pattern, or solution. Set source/source_type for trust tracking. Auto-tags with current project.",
    AddSchemaBase.shape,
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
    "Find and merge duplicate entries across projects into general knowledge. Prefers higher-trust sources. Use apply=false for dry-run.",
    DeduplicateSchema.shape,
    async (args) => ({
      content: [{ type: "text", text: deduplicate(DeduplicateSchema.parse(args)) }],
    })
  );

  server.tool(
    "brain_consolidate",
    "Targeted review of entries needing attention. Flags stale maps, unused entries, and low-confidence items. Full sweep every 10th call or with full=true.",
    ConsolidateReviewSchema.shape,
    async (args) => {
      const parsed = ConsolidateReviewSchema.parse(args);
      if (parsed.project === undefined) {
        parsed.project = getDetectedProject() ?? undefined;
      }
      return {
        content: [{ type: "text", text: consolidateReview(parsed) }],
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
