import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addReference } from "../sources/library.js";
import type { Reference } from "../sources/references.js";

/**
 * `add_reference` is a build/ops tool, not an analysis tool: it's how the costing
 * reference library grows over time (Scout/DEER/TRM ingestion, manual curation,
 * or any other source) rather than something an end-user analysis flow calls.
 * It appends the citation to the local register (data/references.json) and
 * retains it to the shared hindsight `soapbox-costing` bank for durability across
 * deploys; if the hindsight bank isn't reachable/configured it still registers the
 * reference locally and reports that the bank sync was skipped.
 */
export function registerAddReferenceTools(server: McpServer): void {
  server.tool(
    "add_reference",
    "Ops/build tool: register a new citable source reference in the growing costing " +
      "reference library. Appends the citation to the local register and retains it " +
      "to the shared hindsight `soapbox-costing` bank (tags: costing, reference, " +
      "<system_type>) so it survives redeploys. Use this to grow the library over time " +
      "(e.g. from the Scout/DEER/TRM enrichment loop, see scripts/README.md) — this is " +
      "NOT an end-user analysis tool.",
    {
      id: z.string().describe("Stable unique id for this reference, e.g. eia-equipment-2022."),
      system_type: z.string().describe("Comma-separated system type(s) this reference covers, e.g. chillers,boilers."),
      citation: z.string().describe("Full citation text."),
      publisher: z.string().describe("Publishing organization."),
      year: z.number().describe("Publication year."),
      reported_range: z.string().optional().describe("The cost/performance range as reported in the source, e.g. \"$440-$1,390/ton\"."),
      unit_basis: z.string().optional().describe("Unit basis of the reported figures, e.g. $/ton."),
      url: z.string().optional().describe("Source URL."),
      license: z.string().optional().describe("License/usage terms for this source."),
      confidence: z.enum(["high", "medium", "low"]).describe("Confidence in this source's figures."),
    },
    async (args) => {
      const ref: Reference = {
        id: args.id,
        system_type: args.system_type,
        citation: args.citation,
        publisher: args.publisher,
        year: args.year,
        reported_range: args.reported_range ?? "",
        unit_basis: args.unit_basis ?? "",
        url: args.url ?? "",
        license: args.license ?? "",
        confidence: args.confidence,
      };
      try {
        const result = await addReference(ref);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: (e as Error).message }] };
      }
    },
  );
}
