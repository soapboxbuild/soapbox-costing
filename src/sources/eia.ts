export type Fuel = "electricity" | "natural_gas";
export type Sector = "COM" | "RES" | "IND";

export interface PriceResult {
  fuel: Fuel; sector: Sector; region: string;
  price: { value: number; units: string; period: string };
  series: { period: string; value: number }[];
  source: "EIA API v2";
}

type FetchLike = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status?: number; json: () => Promise<any> }>;
interface Opts { apiKey?: string; fetchImpl?: FetchLike }

const BASE = "https://api.eia.gov/v2";

export async function fetchEiaPrice(
  q: { fuel: Fuel; sector: Sector; region: string },
  opts: Opts = {},
): Promise<PriceResult> {
  const apiKey = opts.apiKey ?? process.env.EIA_API_KEY ?? "";
  if (!apiKey) throw new Error("EIA_API_KEY is not set — cannot query EIA price data.");
  const f = opts.fetchImpl ?? (fetch as FetchLike);

  // Electricity retail-sales; natural gas uses a different route (see note).
  const path = q.fuel === "electricity"
    ? "/electricity/retail-sales/data/"
    : "/natural-gas/pri/sum/a_epg0_pcs_sil_dpmcf/data/"; // verify against live in Task 3
  // NB: EIA rejects a JSON `sort` param (400); it wants sort[0][column]=…&sort[0][direction]=….
  // We omit sort and order client-side by period desc instead — simpler and API-shape-agnostic.
  const params = new URLSearchParams({
    api_key: apiKey, frequency: "monthly", "data[0]": "price",
    length: "24",
  });
  // facets differ slightly by route; electricity uses stateid+sectorid.
  const url = `${BASE}${path}?${params.toString()}`
    + `&facets[stateid][]=${encodeURIComponent(q.region)}`
    + (q.fuel === "electricity" ? `&facets[sectorid][]=${encodeURIComponent(q.sector)}` : "");

  const res = await f(url);
  if (!res.ok) throw new Error(`EIA API error ${res.status} for ${q.fuel}/${q.region}`);
  const json: any = await res.json();
  const rows: any[] = json?.response?.data ?? [];
  if (rows.length === 0) throw new Error(`EIA returned no data for ${q.fuel}/${q.region}/${q.sector}`);
  const series = rows
    .map((d) => ({ period: String(d.period), value: Number(d.price) }))
    .sort((a, b) => b.period.localeCompare(a.period)); // latest period first
  const latest = series[0];
  return {
    fuel: q.fuel, sector: q.sector, region: q.region,
    price: { value: latest.value, units: String(rows[0]["price-units"] ?? "cents per kWh"), period: latest.period },
    series, source: "EIA API v2",
  };
}
