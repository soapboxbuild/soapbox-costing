#!/usr/bin/env node
// Content-assertion linter for skills/costing/SKILL.md.
// Mirrors the soapbox-agent convention: assert load-bearing substrings are present
// so the skill can't silently drift away from the canonical measure.cost contract,
// the tool→contract mapping, or the ground rules (UNVERIFIED, no invented numbers,
// does-not-compute-IRR positioning) documented in the Plan 5 Global Constraints.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = path.resolve(__dirname, "../skills/costing/SKILL.md");

const REQUIRED_SUBSTRINGS = [
  "measure.cost",
  "canonical contract in soapbox-agent",
  "get_measure_capex",
  "estimate_service_upgrade",
  "get_energy_prices",
  "get_tariff",
  "get_der_economics",
  "efficiency_alternative",
  "electrical_capacity",
  "opex_delta_yr",
  "UNVERIFIED",
  "never collapse",
  "references",
  "no invented",
  "does not compute IRR",
];

let text;
try {
  text = readFileSync(SKILL_PATH, "utf8");
} catch (e) {
  console.error(`FAIL: could not read ${SKILL_PATH}: ${e.message}`);
  process.exit(1);
}

const missing = REQUIRED_SUBSTRINGS.filter((s) => !text.includes(s));

if (missing.length > 0) {
  throw new Error(
    `costing skill lint FAILED — missing required content in skills/costing/SKILL.md:\n` +
      missing.map((s) => `  - ${JSON.stringify(s)}`).join("\n"),
  );
}

console.log("costing skill lint OK");
