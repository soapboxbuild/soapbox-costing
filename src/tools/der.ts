import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { estimateDerCost } from "../sources/der-costs.js";
import { fetchPvwatts } from "../sources/pvwatts.js";

export function registerDerTools(server: McpServer): void {
  server.tool(
    "get_der_economics",
    "DER (distributed energy resource) cost estimate — parametric CapEx/OpEx by system type. " +
      "`size` units depend on system: solar_pv is kW (DC nameplate), battery_storage is kWh (usable energy), gshp is tons (block capacity). " +
      "For solar_pv, pass lat/lon to also fetch real annual production from NREL PVWatts v8.",
    {
      system: z.enum(["solar_pv", "battery_storage", "gshp"]).describe("DER system type"),
      size: z.number().describe("System size — kW for solar_pv, kWh for battery_storage, tons for gshp"),
      lat: z.number().optional().describe("Latitude (solar_pv only, enables PVWatts production estimate)"),
      lon: z.number().optional().describe("Longitude (solar_pv only, enables PVWatts production estimate)"),
    },
    async ({ system, size, lat, lon }) => {
      try {
        const cost = estimateDerCost({ system, size });
        const result: Record<string, unknown> = { system, size, ...cost };
        if (system === "solar_pv" && lat != null && lon != null) {
          const pv = await fetchPvwatts({ lat, lon, system_capacity_kw: size });
          result.ac_annual_kwh = pv.ac_annual_kwh;
          result.capacity_factor = pv.capacity_factor;
          result.production_source = pv.source;
        }
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: (e as Error).message }] };
      }
    },
  );
}
