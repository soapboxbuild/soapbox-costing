type FetchLike = (url: string) => Promise<{ ok: boolean; status?: number; json: () => Promise<any> }>;
export interface PvResult { ac_annual_kwh: number; capacity_factor: number; source: "PVWatts v8" }
const BASE = "https://developer.nlr.gov/api/pvwatts/v8.json";
export async function fetchPvwatts(
  q: { lat: number; lon: number; system_capacity_kw: number; tilt?: number; azimuth?: number },
  opts: { apiKey?: string; fetchImpl?: FetchLike } = {},
): Promise<PvResult> {
  const apiKey = opts.apiKey ?? process.env.NREL_API_KEY ?? "";
  if (!apiKey) throw new Error("NREL_API_KEY is not set — cannot query PVWatts.");
  const f = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const p = new URLSearchParams({
    api_key: apiKey, lat: String(q.lat), lon: String(q.lon),
    system_capacity: String(q.system_capacity_kw), azimuth: String(q.azimuth ?? 180),
    tilt: String(q.tilt ?? 20), array_type: "1", module_type: "0", losses: "14",
  });
  const res = await f(`${BASE}?${p.toString()}`);
  if (!res.ok) throw new Error(`PVWatts error ${res.status ?? "?"}`);
  const j = await res.json();
  const o = j?.outputs ?? {};
  if (o.ac_annual == null) throw new Error("PVWatts returned no ac_annual");
  return { ac_annual_kwh: Number(o.ac_annual), capacity_factor: Number(o.capacity_factor), source: "PVWatts v8" };
}
