import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchPvwatts } from "./pvwatts.js";

const FIXTURE = { outputs: { ac_annual: 160544.1, capacity_factor: 18.3 } };

test("fetchPvwatts builds v8 URL with api_key and parses ac_annual", async () => {
  let url = "";
  const r = await fetchPvwatts(
    { lat: 40, lon: -105, system_capacity_kw: 100 },
    { apiKey: "K", fetchImpl: (async (u: string) => { url = u; return { ok: true, json: async () => FIXTURE } as any; }) },
  );
  assert.match(url, /developer\.nlr\.gov\/api\/pvwatts\/v8\.json/);
  assert.match(url, /api_key=K/);
  assert.match(url, /system_capacity=100/);
  assert.equal(r.ac_annual_kwh, 160544.1);
  assert.equal(r.source, "PVWatts v8");
});

test("fetchPvwatts errors clearly without key", async () => {
  await assert.rejects(() => fetchPvwatts({ lat: 40, lon: -105, system_capacity_kw: 100 }, { apiKey: "", fetchImpl: (async () => ({}) as any) }), /NREL_API_KEY/);
});
