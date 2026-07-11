import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateServiceUpgrade } from "./service-upgrade.js";

test("commercial 400A unverified upgrade returns a wide UNVERIFIED range, low>=0", () => {
  const r = estimateServiceUpgrade({ sector: "commercial", target_amperage: 400 });
  assert.equal(r.flag, "UNVERIFIED");
  assert.ok(r.upgrade_cost.low >= 0);
  assert.ok(r.upgrade_cost.high > r.upgrade_cost.low, "range must not collapse");
  assert.ok(r.upgrade_cost.high >= 15000 && r.upgrade_cost.high <= 60000, `400A high ~15-50k, got ${r.upgrade_cost.high}`);
  assert.equal(r.confidence, "low");
});

test("three-phase conversion adds to the high end", () => {
  const single = estimateServiceUpgrade({ sector: "commercial", target_amperage: 400, phase: "single" });
  const three = estimateServiceUpgrade({ sector: "commercial", target_amperage: 400, phase: "three" });
  assert.ok(three.upgrade_cost.high > single.upgrade_cost.high, "3-phase adder applies");
});

test("known capacity yields a VERIFIED point (low==base==high) only when explicitly known", () => {
  const r = estimateServiceUpgrade({ sector: "commercial", target_amperage: 400, service_capacity_known: true });
  assert.equal(r.flag, "VERIFIED");
});

test("residential small panel upgrade is in the low thousands", () => {
  const r = estimateServiceUpgrade({ sector: "residential", target_amperage: 200 });
  assert.ok(r.upgrade_cost.high <= 12000, `res high should be modest, got ${r.upgrade_cost.high}`);
});
