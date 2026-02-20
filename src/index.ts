import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./server.js";
import { initDb } from "./db.js";
import { detectProject } from "./project.js";

const server = new McpServer({
  name: "claude-knowledge",
  version: "1.0.0",
});

initDb();
detectProject();
registerTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
