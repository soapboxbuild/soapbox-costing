import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMeasureCapex } from "../sources/measures.js";

export function registerMeasureCapexTools(server: McpServer): void {
  server.tool(
    "get_measure_capex",
    "Curated CapEx (low/base/high) for a decarbonization/retrofit measure — escalated to current-year " +
      "dollars, with cost_breakdown (material/labour/equipment), contingency_pct, an escalation stamp, " +
      "confidence, and reference_ids citing the source survey. Seeded from published market surveys " +
      "(EIA, PNNL, LBNL, ACEEE, etc.) — call list_measures for available measure_id values. When `region` " +
      "is given, regional labour/material factors are applied to the respective cost shares and " +
      "region_applied names the resolved Census division (null when no region is passed). `size` is " +
      "accepted for forward-compat but not yet applied.",
    {
      measure_id: z.string().describe("Measure id, e.g. commercial-chiller. Call list_measures for available ids."),
      region: z.string().optional().describe("US state or Census division; applies regional labour/material cost factors to the estimate."),
      size: z.number().optional().describe("System size (reserved for forward-compat; not yet applied)"),
    },
    async ({ measure_id, region, size }) => {
      try {
        const result = getMeasureCapex({ measure_id, region, size });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: (e as Error).message }] };
      }
    },
  );
}
