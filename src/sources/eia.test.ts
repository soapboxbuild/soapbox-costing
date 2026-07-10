import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchEiaPrice } from "./eia.js";

// Minimal shape of an EIA v2 electricity retail-sales response.
const EIA_FIXTURE = {
  response: {
    data: [
      { period: "2025-02", stateid: "CA", sectorid: "COM", price: 24.11, "price-units": "cents per kilowatt-hour" },
      { period: "2025-01", stateid: "CA", sectorid: "COM", price: 23.87, "price-units": "cents per kilowatt-hour" },
    ],
  },
};

test("fetchEiaPrice builds the correct v2 URL and parses the latest price", async () => {
  let calledUrl = "";
  const fakeFetch = async (url: string) => {
    calledUrl = url;
    return { ok: true, json: async () => EIA_FIXTURE } as any;
  };
  const r = await fetchEiaPrice(
    { fuel: "electricity", sector: "COM", region: "CA" },
    { apiKey: "TESTKEY", fetchImpl: fakeFetch },
  );
  assert.ok(calledUrl.startsWith("https://api.eia.gov/v2/electricity/retail-sales/data/"), calledUrl);
  assert.match(calledUrl, /api_key=TESTKEY/);
  assert.match(calledUrl, /facets\[stateid\]\[\]=CA/);
  assert.match(calledUrl, /facets\[sectorid\]\[\]=COM/);
  assert.equal(r.price.value, 24.11);         // latest period first
  assert.equal(r.price.period, "2025-02");
  assert.equal(r.source, "EIA API v2");
  assert.equal(r.series.length, 2);
});

test("fetchEiaPrice throws a clear error when the key is missing", async () => {
  await assert.rejects(
    () => fetchEiaPrice({ fuel: "electricity", sector: "COM", region: "CA" }, { apiKey: "", fetchImpl: (async () => ({}) as any) }),
    /EIA_API_KEY/,
  );
});
