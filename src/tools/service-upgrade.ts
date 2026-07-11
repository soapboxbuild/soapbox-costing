import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { estimateServiceUpgrade } from "../sources/service-upgrade.js";

export function registerServiceUpgradeTools(server: McpServer): void {
  server.tool(
    "estimate_service_upgrade",
    "Parametric estimate of electrical service-capacity upgrade cost (panel/service/switchgear). Pure model, no network or API key. At screening scale (service capacity unknown) returns an UNVERIFIED range where low=$0 (existing headroom assumed) and high=full new-service cost — never a collapsed point estimate.",
    {
      sector: z.enum(["residential", "commercial"]).describe("Building sector"),
      target_amperage: z.number().optional().describe("Target service amperage, if known"),
      demand_increase_kw: z.number().optional().describe("Added electrical demand (kW), used to estimate amperage if target_amperage is not given"),
      phase: z.enum(["single", "three"]).default("single").describe("Service phase; three-phase conversion adds to cost"),
      service_capacity_known: z.boolean().optional().describe("Set true only if service capacity/quote is confirmed — yields a VERIFIED point estimate instead of a screening range"),
    },
    async ({ sector, target_amperage, demand_increase_kw, phase, service_capacity_known }) => {
      try {
        const r = estimateServiceUpgrade({ sector, target_amperage, demand_increase_kw, phase, service_capacity_known });
        return { content: [{ type: "text", text: JSON.stringify(r) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: (e as Error).message }] };
      }
    },
  );
}
