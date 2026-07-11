import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getRegionalFactor } from "../sources/regional.js";

export function registerRegionalTools(server: McpServer): void {
  server.tool(
    "get_regional_factor",
    "Labour and material cost multipliers for a US region, used to regionalize get_measure_capex results. " +
      "Accepts a Census division name (New England, Middle Atlantic, East North Central, West North Central, " +
      "South Atlantic, East South Central, West South Central, Mountain, Pacific), a US state code/name, or " +
      "\"national\". The labour factor applies to a measure's labour cost_breakdown share and the material " +
      "factor to the material share; equipment always stays at national cost. BLS-informed PLACEHOLDER figures " +
      "pending tuning. Unknown regions fall back to national factors with a note (never throws).",
    {
      region: z.string().describe("Census division name, US state code/name, or \"national\"."),
    },
    async ({ region }) => {
      const result = getRegionalFactor(region);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );
}
