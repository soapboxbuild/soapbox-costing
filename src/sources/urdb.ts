export interface Tariff {
  label: string; utility: string; name: string; sector: string;
  energy_charge_summary: string; demand_charge_summary: string;
  has_demand_charges: boolean; uri: string;
}
export interface TariffResult { query: string; count: number; tariffs: Tariff[]; source: "OpenEI URDB" }

type FetchLike = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status?: number; json: () => Promise<any> }>;
interface Opts { apiKey?: string; fetchImpl?: FetchLike }

const BASE = "https://api.openei.org/utility_rates";

function summarizeRate(structure: any[][] | undefined, unit: string): string {
  if (!Array.isArray(structure) || structure.length === 0) return "none";
  const rates = structure.flat().map((p) => p?.rate).filter((x) => typeof x === "number");
  if (rates.length === 0) return "none";
  const min = Math.min(...rates), max = Math.max(...rates);
  return min === max ? `${min}/${unit}` : `${min}–${max}/${unit}`;
}

export async function fetchUrdbTariffs(
  q: { utility?: string; sector?: string; address?: string; limit?: number },
  opts: Opts = {},
): Promise<TariffResult> {
  const apiKey = opts.apiKey ?? process.env.NREL_API_KEY ?? "";
  if (!apiKey) throw new Error("NREL_API_KEY is not set — cannot query OpenEI URDB.");
  const f = opts.fetchImpl ?? (fetch as FetchLike);
  const params = new URLSearchParams({
    version: "latest", format: "json", api_key: apiKey,
    detail: "full", limit: String(q.limit ?? 10),
  });
  if (q.sector) params.set("sector", q.sector);
  if (q.utility) params.set("ratesforutility", q.utility);
  if (q.address) params.set("address", q.address);
  const url = `${BASE}?${params.toString()}`;
  const res = await f(url);
  if (!res.ok) throw new Error(`URDB API error ${res.status}`);
  const json: any = await res.json();
  if (json?.error) throw new Error(`URDB error: ${json.error?.message ?? JSON.stringify(json.error)}`);
  const items: any[] = json?.items ?? [];
  const tariffs: Tariff[] = items.map((it) => {
    const demand = summarizeRate(it.demandratestructure, "kW");
    return {
      label: String(it.label ?? ""), utility: String(it.utility ?? ""),
      name: String(it.name ?? ""), sector: String(it.sector ?? ""),
      energy_charge_summary: summarizeRate(it.energyratestructure, "kWh"),
      demand_charge_summary: demand, has_demand_charges: demand !== "none",
      uri: String(it.uri ?? ""),
    };
  });
  return { query: q.utility ?? q.address ?? q.sector ?? "", count: tariffs.length, tariffs, source: "OpenEI URDB" };
}
