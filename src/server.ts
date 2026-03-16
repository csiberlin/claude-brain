import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SearchSchema, UpsertSchema, DeleteSchema, InfoSchema, MaintainSchema } from "./types.js";
import { searchKnowledge } from "./tools/search.js";
import { upsertKnowledge } from "./tools/upsert.js";
import { deleteKnowledge } from "./tools/delete.js";
import { getInfo } from "./tools/info.js";
import { maintain } from "./tools/maintain.js";
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
    "brain_upsert",
    "Add or update a knowledge entry. Omit id to create, include id to update. New entries default to speculative (confirmed for api category). Set confirmed=true to override.",
    UpsertSchema.shape,
    async (args) => {
      const parsed = UpsertSchema.parse(args);
      if (parsed.project === undefined) {
        parsed.project = getDetectedProject() ?? undefined;
      }
      return {
        content: [{ type: "text", text: await upsertKnowledge(parsed) }],
      };
    }
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
    "brain_info",
    "Knowledge base overview: entry counts, embedding coverage, project/category breakdown, DB size. Set include_tags=true for tag listing.",
    InfoSchema.shape,
    async (args) => {
      const parsed = InfoSchema.parse(args);
      if (parsed.project === undefined) {
        parsed.project = getDetectedProject() ?? undefined;
      }
      return {
        content: [{ type: "text", text: getInfo(parsed) }],
      };
    }
  );

  server.tool(
    "brain_maintain",
    "Review entries needing attention and optionally deduplicate. Flags stale maps, unused entries, low-confidence items. Set deduplicate=true for cross-project merge.",
    MaintainSchema.shape,
    async (args) => {
      const parsed = MaintainSchema.parse(args);
      if (parsed.project === undefined) {
        parsed.project = getDetectedProject() ?? undefined;
      }
      return {
        content: [{ type: "text", text: maintain(parsed) }],
      };
    }
  );
}
