import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchUrdbTariffs } from "../sources/urdb.js";

export function registerTariffTools(server: McpServer): void {
  server.tool(
    "get_tariff",
    "Utility rate structures (energy + demand charges) from the OpenEI Utility Rate Database (URDB) — the OpEx-delta rate basis, including demand charges omitted by a flat blended rate.",
    {
      utility: z.string().optional().describe("Utility company name, e.g. 'Pacific Gas & Electric Co'"),
      sector: z.string().default("Commercial").describe("Rate sector, e.g. Commercial, Residential, Industrial"),
      address: z.string().optional().describe("Address to resolve utility/rates for, if utility is unknown"),
      limit: z.number().default(10).describe("Max number of tariffs to return"),
    },
    async ({ utility, sector, address, limit }) => {
      try {
        const r = await fetchUrdbTariffs({ utility, sector, address, limit });
        return { content: [{ type: "text", text: JSON.stringify(r) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: (e as Error).message }] };
      }
    },
  );
}
