import { createServer, type Server, type IncomingMessage } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerEnergyPriceTools } from "./tools/energy-prices.js";
import { registerTariffTools } from "./tools/tariff.js";
import { registerServiceUpgradeTools } from "./tools/service-upgrade.js";

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
  registerEnergyPriceTools(server);
  registerTariffTools(server);
  registerServiceUpgradeTools(server);
}

// A fresh McpServer per request — required for stateless Streamable HTTP.
// Reusing one server across requests double-connects the transport and fails (502).
export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTools(server);
  return server;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => { raw += chunk.toString(); });
    req.on("end", () => { try { resolve(JSON.parse(raw)); } catch { resolve(undefined); } });
    req.on("error", reject);
  });
}

export function buildServer(): { httpServer: Server; mcpServer: McpServer } {
  // Representative server exposed for tests; the HTTP path builds its own per request.
  const mcpServer = buildMcpServer();

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost`);

    if (url.pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (url.pathname === "/mcp" && (req.method === "POST" || req.method === "GET" || req.method === "DELETE")) {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const server = buildMcpServer(); // fresh per request (stateless)
      await server.connect(transport);
      const body = req.method === "POST" ? await readJsonBody(req) : undefined;
      await transport.handleRequest(req, res, body);
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
