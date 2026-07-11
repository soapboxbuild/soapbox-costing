import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { MeasureCapexAmounts, CostBreakdown } from "./measures.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/sources/regional.js -> ../../data/regional-factors.json (repo-root data/, one level above dist/)
const DATA_PATH = path.resolve(__dirname, "../../data/regional-factors.json");

export interface RegionFactor {
  labour: number;
  material: number;
}
export interface RegionalFactorsFile {
  note: string;
  basis: string;
  divisions: Record<string, RegionFactor>;
  state_to_division: Record<string, string>;
}
export interface ResolvedRegionalFactor extends RegionFactor {
  division: string;
  note?: string;
}

let cache: RegionalFactorsFile | null = null;

function load(): RegionalFactorsFile {
  if (cache) return cache;
  let raw: string;
  try {
    raw = readFileSync(DATA_PATH, "utf-8");
  } catch (e) {
    throw new Error(`Could not read regional factors data at ${DATA_PATH}: ${(e as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`regional-factors.json is not valid JSON: ${(e as Error).message}`);
  }
  const data = parsed as Partial<RegionalFactorsFile>;
  if (!data || typeof data !== "object" || !data.divisions || typeof data.divisions !== "object") {
    throw new Error("regional-factors.json malformed: expected an object with a divisions{} map");
  }
  cache = {
    note: data.note ?? "",
    basis: data.basis ?? "",
    divisions: data.divisions as Record<string, RegionFactor>,
    state_to_division: (data.state_to_division as Record<string, string>) ?? {},
  };
  return cache;
}

/** All known division names, including "national". */
export function listDivisions(): string[] {
  return Object.keys(load().divisions);
}

/**
 * Resolve a region string (Census division name, US state code/name, or "national")
 * to its labour/material factors. Unknown regions fall back to national with a note
 * — never throws, per the "loading data must not crash a tool" constraint.
 */
export function getRegionalFactor(region: string | undefined | null): ResolvedRegionalFactor {
  const data = load();
  if (!region) {
    return { division: "national", ...data.divisions.national };
  }
  // Exact division-name match (case-insensitive).
  const divisionKey = Object.keys(data.divisions).find((d) => d.toLowerCase() === region.toLowerCase());
  if (divisionKey) {
    return { division: divisionKey, ...data.divisions[divisionKey] };
  }
  // US state code or name -> division.
  const stateKey = Object.keys(data.state_to_division).find((s) => s.toLowerCase() === region.toLowerCase());
  if (stateKey) {
    const division = data.state_to_division[stateKey];
    return { division, ...data.divisions[division] };
  }
  return {
    division: "national",
    ...data.divisions.national,
    note: `Unknown region "${region}"; no Census division or US state match found. Falling back to national factors (1.0/1.0 baseline).`,
  };
}

/**
 * Regionalize a set of capex amounts by applying the labour factor to the labour
 * share and the material factor to the material share; the equipment share is
 * always left at national cost. P_regional = P * (m*material + l*labour + e*1.0).
 */
export function regionalize(
  capex: MeasureCapexAmounts,
  cost_breakdown: CostBreakdown,
  factors: RegionFactor,
): MeasureCapexAmounts {
  const multiplier =
    cost_breakdown.material * factors.material + cost_breakdown.labour * factors.labour + cost_breakdown.equipment * 1.0;
  const round = (n: number) => Math.round(n * multiplier * 100) / 100;
  return { low: round(capex.low), base: round(capex.base), high: round(capex.high) };
}
