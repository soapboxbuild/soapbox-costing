import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateDerCost } from "./der-costs.js";

test("solar_pv capex scales with size at ~$1.5-2.5/W", () => {
  const r = estimateDerCost({ system: "solar_pv", size: 100 }); // 100 kW
  // 100 kW = 100000 W → base ~$200k
  assert.ok(r.capex.low >= 100 * 1000 * 1.4 && r.capex.high <= 100 * 1000 * 2.6, JSON.stringify(r.capex));
  assert.ok(r.capex.low < r.capex.base && r.capex.base < r.capex.high);
});

test("battery_storage priced per kWh", () => {
  const r = estimateDerCost({ system: "battery_storage", size: 200 }); // 200 kWh
  assert.ok(r.capex.base >= 200 * 400 && r.capex.base <= 200 * 700);
});
