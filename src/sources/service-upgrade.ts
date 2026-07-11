export interface ServiceUpgradeQuery {
  sector: "residential" | "commercial";
  target_amperage?: number;
  demand_increase_kw?: number;
  phase?: "single" | "three";
  service_capacity_known?: boolean;
}
export interface ServiceUpgradeResult {
  upgrade_cost: { low: number; base: number; high: number };
  flag: "VERIFIED" | "UNVERIFIED";
  basis: string;
  confidence: "low";
  assumptions: string[];
}

// PLACEHOLDER seed bands (full new-service cost), from PG&E/NV5 2022 + contractor ranges. Tune later.
const RES_BANDS = { low: 2000, base: 3200, high: 4500 };          // panel upgrade ≤200A
const RES_XFMR = 7000;                                            // utility transformer if needed
const COMM_BANDS: { maxAmps: number; low: number; base: number; high: number }[] = [
  { maxAmps: 400,   low: 15000, base: 28000,  high: 50000 },
  { maxAmps: 1200,  low: 50000, base: 72000,  high: 100000 },
  { maxAmps: Infinity, low: 100000, base: 125000, high: 150000 }, // switchgear + utility coordination
];
const THREE_PHASE_ADDER = { low: 10000, high: 30000 };

// Rough amperage estimate from a kW demand increase (208V 3φ commercial / 240V 1φ res), if amperage not given.
function ampsFromKw(kw: number, sector: "residential" | "commercial"): number {
  const volts = sector === "commercial" ? 208 * Math.sqrt(3) : 240;
  return (kw * 1000) / volts;
}

export function estimateServiceUpgrade(q: ServiceUpgradeQuery): ServiceUpgradeResult {
  const amps = q.target_amperage
    ?? (q.demand_increase_kw != null ? ampsFromKw(q.demand_increase_kw, q.sector) : undefined);
  const assumptions: string[] = [];
  let band: { low: number; base: number; high: number };

  if (q.sector === "residential") {
    band = { ...RES_BANDS };
    assumptions.push("Residential panel/service upgrade band (PG&E/NV5 2022). Excludes utility transformer unless flagged.");
    if ((amps ?? 0) > 200) { band.high += RES_XFMR; band.base += RES_XFMR / 2; assumptions.push("Utility transformer likely required (>200A)."); }
  } else {
    const tier = COMM_BANDS.find((b) => (amps ?? 400) <= b.maxAmps) ?? COMM_BANDS[COMM_BANDS.length - 1];
    band = { low: tier.low, base: tier.base, high: tier.high };
    assumptions.push(`Commercial service band for ~${Math.round(amps ?? 400)}A (contractor-reported ranges; low authority).`);
  }
  if (q.phase === "three") {
    band.high += THREE_PHASE_ADDER.high;
    band.base += (THREE_PHASE_ADDER.low + THREE_PHASE_ADDER.high) / 2;
    assumptions.push("Three-phase conversion adder applied.");
  }

  if (q.service_capacity_known) {
    // Verified: a single confirmed cost (use base as the confirmed point).
    return {
      upgrade_cost: { low: band.base, base: band.base, high: band.base },
      flag: "VERIFIED", basis: "Confirmed service capacity / quote", confidence: "low",
      assumptions: [...assumptions, "service_capacity_known=true → point estimate."],
    };
  }
  // Unverified (screening default): low assumes existing headroom (no forced full upgrade).
  return {
    upgrade_cost: { low: 0, base: band.base, high: band.high },
    flag: "UNVERIFIED", basis: "Synthesized parametric (no service data)", confidence: "low",
    assumptions: [...assumptions, "UNVERIFIED: low=$0 assumes existing headroom; high=full new service. Verify with a switchgear/service survey."],
  };
}
