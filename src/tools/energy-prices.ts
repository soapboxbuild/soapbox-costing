import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchEiaPrice, type Fuel, type Sector } from "../sources/eia.js";

export function registerEnergyPriceTools(server: McpServer): void {
  server.tool(
    "get_energy_prices",
    "Current retail energy price (electricity or natural gas) for a US state and sector, from EIA API v2 — the OpEx-delta price basis. Returns the latest price plus a 24-month series.",
    {
      region: z.string().describe("US state code, e.g. 'CA', 'NY'"),
      sector: z.enum(["COM", "RES", "IND"]).describe("Commercial, Residential, Industrial"),
      fuel: z.enum(["electricity", "natural_gas"]).default("electricity"),
    },
    async ({ region, sector, fuel }) => {
      try {
        const r = await fetchEiaPrice({ region, sector: sector as Sector, fuel: fuel as Fuel });
        return { content: [{ type: "text", text: JSON.stringify(r) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: (e as Error).message }] };
      }
    },
  );
}
