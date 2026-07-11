import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { resolveReferences, type Reference } from "./references.js";
import { getRegionalFactor, regionalize } from "./regional.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/sources/measures.js -> ../../data/measures.json (repo-root data/, one level above dist/)
const DATA_PATH = path.resolve(__dirname, "../../data/measures.json");

export interface MeasureCapexAmounts {
  low: number;
  base: number;
  high: number;
}
export interface CostBreakdown {
  material: number;
  labour: number;
  equipment: number;
}
export interface EscalationStamp {
  base_year: number;
  index: string;
  index_vintage: string;
  escalated_to: number;
}
export interface Measure {
  measure_id: string;
  measure_kind: string;
  category: string;
  unit_basis: string;
  archetypes: string[];
  capex: MeasureCapexAmounts;
  cost_breakdown: CostBreakdown;
  contingency_pct: number;
  escalation: EscalationStamp;
  confidence: "high" | "medium" | "low";
  reference_ids: string[];
  notes?: string;
}
export interface MeasuresFile {
  current_year: number;
  measures: Measure[];
}
export interface MeasureCapexQuery {
  measure_id: string;
  region?: string;
  size?: number;
}
export interface MeasureCapexResult {
  measure_id: string;
  unit_basis: string;
  capex: MeasureCapexAmounts;
  cost_breakdown: CostBreakdown;
  contingency_pct: number;
  escalation: EscalationStamp;
  source: string;
  confidence: "high" | "medium" | "low";
  reference_ids: string[];
  references: Reference[];
  region_applied: string | null;
  notes?: string;
}

// Current publication year for escalation targets. Bump alongside data/measures.json's
// top-level current_year when the seed is refreshed.
const CURRENT_YEAR = 2026;

// PLACEHOLDER single-factor construction-cost escalation: 3.5%/yr compounded.
// Approximates BLS PPI for Final Demand Construction (series WPUSI012011) longrun
// annualized growth; a real per-year BLS PPI pull should replace this constant.
// Documented placeholder per Plan 4 Global Constraints — labelled, not silently precise.
const ANNUAL_ESCALATION_RATE = 0.035;

let cache: MeasuresFile | null = null;

function load(): MeasuresFile {
  if (cache) return cache;
  let raw: string;
  try {
    raw = readFileSync(DATA_PATH, "utf-8");
  } catch (e) {
    throw new Error(`Could not read measures data at ${DATA_PATH}: ${(e as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`measures.json is not valid JSON: ${(e as Error).message}`);
  }
  const data = parsed as Partial<MeasuresFile>;
  if (!data || typeof data !== "object" || !Array.isArray(data.measures)) {
    throw new Error("measures.json malformed: expected an object with a measures[] array");
  }
  for (const m of data.measures) {
    if (!m || typeof m !== "object" || typeof (m as Measure).measure_id !== "string") {
      throw new Error("measures.json malformed: every entry needs a string measure_id");
    }
  }
  cache = { current_year: data.current_year ?? CURRENT_YEAR, measures: data.measures as Measure[] };
  return cache;
}

function escalateAmounts(capex: MeasureCapexAmounts, baseYear: number, toYear: number): MeasureCapexAmounts {
  const years = Math.max(0, toYear - baseYear);
  const factor = Math.pow(1 + ANNUAL_ESCALATION_RATE, years);
  const round = (n: number) => Math.round(n * factor * 100) / 100;
  return { low: round(capex.low), base: round(capex.base), high: round(capex.high) };
}

/** All seeded measure ids, for error messages and list_measures. */
export function listMeasureIds(): string[] {
  return load().measures.map((m) => m.measure_id);
}

/** All seeded measures (full taxonomy), for list_measures. */
export function listMeasures(): Measure[] {
  return load().measures;
}

/**
 * Curated CapEx for a measure, escalated to the current year and, if a region is
 * given, regionalized: the labour factor applies to the labour share, the material
 * factor to the material share, and the equipment share stays at national cost
 * (see regional.ts#regionalize). size is accepted for forward-compat with later
 * size-based lookups but not yet applied.
 */
export function getMeasureCapex(query: MeasureCapexQuery): MeasureCapexResult {
  const data = load();
  const measure = data.measures.find((m) => m.measure_id === query.measure_id);
  if (!measure) {
    const available = data.measures.map((m) => m.measure_id).join(", ");
    throw new Error(`Unknown measure_id "${query.measure_id}". Available ids: ${available}`);
  }
  const escalatedCapex = escalateAmounts(measure.capex, measure.escalation.base_year, CURRENT_YEAR);

  let regionalCapex = escalatedCapex;
  let regionApplied: string | null = null;
  if (query.region) {
    const factor = getRegionalFactor(query.region);
    regionalCapex = regionalize(escalatedCapex, measure.cost_breakdown, factor);
    regionApplied = factor.division;
  }

  return {
    measure_id: measure.measure_id,
    unit_basis: measure.unit_basis,
    capex: regionalCapex,
    cost_breakdown: measure.cost_breakdown,
    contingency_pct: measure.contingency_pct,
    escalation: { ...measure.escalation, escalated_to: CURRENT_YEAR },
    source: `curated seed (${measure.reference_ids.join(", ")})`,
    confidence: measure.confidence,
    reference_ids: measure.reference_ids,
    references: resolveReferences(measure.reference_ids),
    region_applied: regionApplied,
    notes: measure.notes,
  };
}
