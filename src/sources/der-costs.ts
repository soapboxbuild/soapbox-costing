export type DerSystem = "solar_pv" | "battery_storage" | "gshp";
export interface DerCost {
  capex: { low: number; base: number; high: number };
  opex_delta_yr: number; unit_basis: string; confidence: "low"; basis: string;
}
// PLACEHOLDER 2024$ seeds — tune later.
const SEEDS = {
  solar_pv:        { low: 1.4, base: 2.0, high: 2.6, unit: "$/W_dc", om_per_kw_yr: 18 },   // × watts
  battery_storage: { low: 400, base: 550, high: 700, unit: "$/kWh", om_per_kw_yr: 0 },     // × kWh
  gshp:            { low: 20000, base: 27000, high: 35000, unit: "$/ton-block", om_per_kw_yr: 0 }, // × tons
};
export function estimateDerCost(q: { system: DerSystem; size: number }): DerCost {
  const s = SEEDS[q.system];
  const mult = q.system === "solar_pv" ? q.size * 1000 : q.size; // solar size is kW → W
  return {
    capex: { low: Math.round(s.low * mult), base: Math.round(s.base * mult), high: Math.round(s.high * mult) },
    opex_delta_yr: -Math.round((s.om_per_kw_yr ?? 0) * (q.system === "solar_pv" ? q.size : 0)), // O&M is a cost; savings computed elsewhere
    unit_basis: s.unit, confidence: "low",
    basis: `PLACEHOLDER seed (${s.unit}); tune against real bids.`,
  };
}
