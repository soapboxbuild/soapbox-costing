import { test } from "node:test";
import assert from "node:assert/strict";
import { regionalize, getRegionalFactor, listDivisions } from "./regional.js";

test("regionalize raises total via labour only when material factor=1, labour factor>1", () => {
  const capex = { low: 100, base: 200, high: 300 };
  const breakdown = { material: 0.5, labour: 0.3, equipment: 0.2 };
  const factors = { labour: 1.5, material: 1.0 };
  const result = regionalize(capex, breakdown, factors);
  // base=200: material share 100 (unchanged, factor 1.0), labour share 60*1.5=90, equipment share 40 (untouched)
  // 100 + 90 + 40 = 230
  assert.equal(result.base, 230);
  assert.equal(result.low, 115); // 100*(0.5*1+0.3*1.5+0.2*1)=100*(0.5+0.45+0.2)=100*1.15
  assert.equal(result.high, 345);
});

test("equipment share is never scaled by either factor", () => {
  const capex = { low: 0, base: 1000, high: 0 };
  const breakdown = { material: 0, labour: 0, equipment: 1 };
  const factors = { labour: 2.0, material: 3.0 };
  const result = regionalize(capex, breakdown, factors);
  assert.equal(result.base, 1000, "equipment-only capex must be untouched by labour/material factors");
});

test("a high-labour division raises a labour-heavy measure more than a labour-light one", () => {
  const capex = { low: 100, base: 100, high: 100 };
  const highLabourFactors = { labour: 1.4, material: 1.0 };
  const labourHeavy = { material: 0.2, labour: 0.7, equipment: 0.1 };
  const labourLight = { material: 0.7, labour: 0.2, equipment: 0.1 };
  const heavyResult = regionalize(capex, labourHeavy, highLabourFactors);
  const lightResult = regionalize(capex, labourLight, highLabourFactors);
  assert.ok(
    heavyResult.base - 100 > lightResult.base - 100,
    `expected labour-heavy uplift (${heavyResult.base}) to exceed labour-light uplift (${lightResult.base})`,
  );
});

test("national factors (1.0/1.0) leave capex unchanged", () => {
  const capex = { low: 111, base: 222, high: 333 };
  const breakdown = { material: 0.4, labour: 0.4, equipment: 0.2 };
  const national = getRegionalFactor("national");
  const result = regionalize(capex, breakdown, { labour: national.labour, material: national.material });
  assert.deepEqual(result, capex);
});

test("getRegionalFactor resolves a known Census division", () => {
  const f = getRegionalFactor("Pacific");
  assert.equal(f.division, "Pacific");
  assert.ok(typeof f.labour === "number" && typeof f.material === "number");
});

test("getRegionalFactor falls back to national for an unknown region, with a note", () => {
  const f = getRegionalFactor("Narnia");
  assert.equal(f.division, "national");
  assert.ok(f.note && f.note.length > 0);
});

test("listDivisions includes the nine Census divisions plus national", () => {
  const divisions = listDivisions();
  for (const d of [
    "New England",
    "Middle Atlantic",
    "East North Central",
    "West North Central",
    "South Atlantic",
    "East South Central",
    "West South Central",
    "Mountain",
    "Pacific",
    "national",
  ]) {
    assert.ok(divisions.includes(d), `missing division ${d}`);
  }
});
