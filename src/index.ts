import { createServer, type Server } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const SERVER_NAME = "costing";
const SERVER_VERSION = "0.1.0";

// Extension point: Plans 2-6 add their tools here.
function registerTools(server: McpServer): void {
  server.tool(
    "list_measures",
    "List the decarbonization/retrofit measures this costing service can price. v0 returns an empty taxonomy; measures are added in later releases.",
    {},
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ measures: [], note: "taxonomy not yet loaded (v0 scaffold)" }),
        },
      ],
    }),
  );
}

export function buildServer(): { httpServer: Server; mcpServer: McpServer } {
  const mcpServer = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTools(mcpServer);

  const httpServer = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (req.url === "/mcp") {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  return { httpServer, mcpServer };
}

// Entry point (skipped under the test runner, which imports buildServer directly).
const isMain = process.argv[1]?.endsWith("index.js");
if (isMain) {
  const port = Number(process.env.PORT ?? 8080);
  const { httpServer } = buildServer();
  httpServer.listen(port, () => console.log(`costing MCP listening on :${port}`));
}
