#!/usr/bin/env node
// Lint: agents/subagents/costing-specialist.md must cover the provenance-gated
// ground rules of the costing skill it drives. Mirrors scripts/lint-skill-costing.mjs
// in spirit (assert-and-print), scoped to the persona file.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const personaPath = join(__dirname, "..", "agents", "subagents", "costing-specialist.md");

let text;
try {
  text = readFileSync(personaPath, "utf8");
} catch (err) {
  console.error(`FAIL: could not read ${personaPath}: ${err.message}`);
  process.exit(1);
}

const lower = text.toLowerCase();

const required = [
  "Costing Specialist",
  "never invent",
  "provenance",
  "references",
  "UNVERIFIED",
  "efficiency alternative",
  "coverage gap",
  "costing MCP",
  "add_reference",
];

const missing = required.filter((needle) => !lower.includes(needle.toLowerCase()));

if (missing.length > 0) {
  console.error(`FAIL: costing-specialist.md missing required concepts: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("costing persona lint OK");
