import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchUrdbTariffs } from "./urdb.js";

const URDB_FIXTURE = {
  items: [
    {
      label: "abc123", utility: "Pacific Gas & Electric Co",
      name: "A-10 TOU Medium General Demand", sector: "Commercial",
      energyratestructure: [[{ rate: 0.18, unit: "kWh" }]],
      demandratestructure: [[{ rate: 22.5, unit: "kW" }]],
      uri: "https://apps.openei.org/USURDB/rate/view/abc123",
    },
  ],
};

test("fetchUrdbTariffs builds URL with api_key + parses demand charges", async () => {
  let calledUrl = "";
  const fakeFetch = async (url: string) => { calledUrl = url; return { ok: true, json: async () => URDB_FIXTURE } as any; };
  const r = await fetchUrdbTariffs({ utility: "Pacific Gas & Electric Co", sector: "Commercial" }, { apiKey: "K", fetchImpl: fakeFetch });
  assert.ok(calledUrl.startsWith("https://api.openei.org/utility_rates"), calledUrl);
  assert.match(calledUrl, /api_key=K/);
  assert.match(calledUrl, /version=latest/);
  assert.equal(r.tariffs[0].has_demand_charges, true);
  assert.equal(r.source, "OpenEI URDB");
});

test("fetchUrdbTariffs errors clearly without a key", async () => {
  await assert.rejects(() => fetchUrdbTariffs({ utility: "x" }, { apiKey: "", fetchImpl: (async () => ({}) as any) }), /NREL_API_KEY/);
});
