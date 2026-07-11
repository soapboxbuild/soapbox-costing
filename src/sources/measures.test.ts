import { test } from "node:test";
import assert from "node:assert/strict";
import { getMeasureCapex, listMeasureIds } from "./measures.js";

test("known seed measure returns escalated capex with low < base < high", () => {
  const r = getMeasureCapex({ measure_id: "commercial-chiller" });
  assert.ok(r.capex.low < r.capex.base && r.capex.base < r.capex.high, JSON.stringify(r.capex));
  assert.equal(r.escalation.escalated_to, 2026);
  assert.equal(r.region_applied, null);
  assert.ok(r.reference_ids.includes("eia-equipment-2022"));
  assert.ok(listMeasureIds().includes("commercial-chiller"));
});

test("escalation raises current-$ capex above the base-year seed", () => {
  const r = getMeasureCapex({ measure_id: "retrocommissioning" }); // base_year 2009, well below 2026
  assert.ok(r.capex.base > 0.3, `expected escalated 2009$0.30/ft2 seed to have grown, got ${r.capex.base}`);
});

test("region applies labour/material factors to capex and sets region_applied", () => {
  const national = getMeasureCapex({ measure_id: "commercial-chiller" });
  const regional = getMeasureCapex({ measure_id: "commercial-chiller", region: "Pacific" });
  assert.equal(regional.region_applied, "Pacific");
  assert.notEqual(regional.capex.base, national.capex.base, "Pacific factors should move the capex off the national figure");
});

test("no region leaves capex unchanged and region_applied null", () => {
  const r = getMeasureCapex({ measure_id: "commercial-chiller" });
  assert.equal(r.region_applied, null);
});

test("unknown measure_id throws a clear error listing available ids", () => {
  assert.throws(
    () => getMeasureCapex({ measure_id: "does-not-exist" }),
    (err: unknown) => {
      const msg = (err as Error).message;
      assert.ok(msg.includes("does-not-exist"), msg);
      assert.ok(msg.includes("commercial-chiller"), msg);
      return true;
    },
  );
});
