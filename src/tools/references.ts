import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getReferences } from "../sources/references.js";

export function registerReferenceTools(server: McpServer): void {
  server.tool(
    "get_references",
    "Look up citable source references (citation, publisher, year, reported_range, unit_basis, url, " +
      "license, confidence) from the growing costing reference register. Pass `measure_id` to get the " +
      "full citations backing a specific get_measure_capex result, `system_type` (e.g. chillers, boilers, " +
      "ashp, gshp, hpwh, rtu_controls, ventilation, vfd, rcx, envelope, lighting, fume_hood, vrf) to filter " +
      "by system type, both to combine, or neither to list the entire register.",
    {
      measure_id: z.string().optional().describe("Measure id, e.g. commercial-chiller — returns citations for that measure's reference_ids."),
      system_type: z.string().optional().describe("System type to filter by, e.g. chillers, boilers, ashp, gshp, hpwh."),
    },
    async ({ measure_id, system_type }) => {
      try {
        const result = getReferences({ measure_id, system_type });
        return { content: [{ type: "text", text: JSON.stringify({ references: result }) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: (e as Error).message }] };
      }
    },
  );
}
