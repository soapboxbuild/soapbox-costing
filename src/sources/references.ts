import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { listMeasures } from "./measures.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/sources/references.js -> ../../data/references.json (repo-root data/, one level above dist/)
const DATA_PATH = path.resolve(__dirname, "../../data/references.json");

export interface Reference {
  id: string;
  /** Comma-separated when a single source spans multiple system types (e.g. the EIA equipment study). */
  system_type: string;
  citation: string;
  publisher: string;
  year: number;
  reported_range: string;
  unit_basis: string;
  url: string;
  license: string;
  confidence: "high" | "medium" | "low";
}
export interface ReferencesFile {
  references: Reference[];
}
export interface ReferencesQuery {
  measure_id?: string;
  system_type?: string;
}

let cache: ReferencesFile | null = null;

/** Loads and validates data/references.json. Throws on malformed data; callers (tools) must
 * catch this so a bad file fails only the specific tool, never /health. */
export function loadReferences(): ReferencesFile {
  if (cache) return cache;
  let raw: string;
  try {
    raw = readFileSync(DATA_PATH, "utf-8");
  } catch (e) {
    throw new Error(`Could not read references data at ${DATA_PATH}: ${(e as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`references.json is not valid JSON: ${(e as Error).message}`);
  }
  const data = parsed as Partial<ReferencesFile>;
  if (!data || typeof data !== "object" || !Array.isArray(data.references)) {
    throw new Error("references.json malformed: expected an object with a references[] array");
  }
  for (const r of data.references) {
    if (!r || typeof r !== "object" || typeof (r as Reference).id !== "string") {
      throw new Error("references.json malformed: every entry needs a string id");
    }
  }
  cache = { references: data.references as Reference[] };
  return cache;
}

function matchesSystemType(ref: Reference, systemType: string): boolean {
  return ref.system_type
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .includes(systemType.trim().toLowerCase());
}

/**
 * Resolves a list of reference_ids into full citation objects, silently skipping any
 * id that doesn't resolve (defensive — the register is asserted dangling-free by test,
 * but a join must never crash get_measure_capex over a data-entry slip).
 */
export function resolveReferences(referenceIds: string[]): Reference[] {
  const { references } = loadReferences();
  const byId = new Map(references.map((r) => [r.id, r]));
  return referenceIds.map((id) => byId.get(id)).filter((r): r is Reference => Boolean(r));
}

/**
 * Looks up citations either for a specific measure's reference_ids, filtered by
 * system_type, or the full register when no filter is given. measure_id and
 * system_type may be combined (AND).
 */
export function getReferences(query: ReferencesQuery): Reference[] {
  let results: Reference[];

  if (query.measure_id) {
    const measure = listMeasures().find((m) => m.measure_id === query.measure_id);
    if (!measure) {
      const available = listMeasures().map((m) => m.measure_id).join(", ");
      throw new Error(`Unknown measure_id "${query.measure_id}". Available ids: ${available}`);
    }
    results = resolveReferences(measure.reference_ids);
  } else {
    results = loadReferences().references;
  }

  if (query.system_type) {
    results = results.filter((r) => matchesSystemType(r, query.system_type as string));
  }

  return results;
}
