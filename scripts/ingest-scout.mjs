#!/usr/bin/env node
/**
 * ingest-scout.mjs — DOE Scout ECM ingest scaffold.
 *
 * DOE Scout (https://scout.energy.gov/) publishes Energy Conservation Measure (ECM)
 * JSON with fields like `installed_cost`, `cost_units`, `installed_cost_source`,
 * `energy_efficiency`, and `product_lifetime`. This script is a SCAFFOLD, not a
 * complete ETL: it maps the common Scout fields into a `data/measures.json`-shaped
 * proposed entry and prints what it *would* add. It is one stage of the broader
 * enrichment loop documented in scripts/README.md (Scout -> DEER -> TRM -> curated).
 *
 * It does not attempt to handle every Scout schema variant, unit-of-measure
 * conversion, or archetype inference — those are flagged as TODOs in the output
 * so a human (or a follow-on task) can review before anything is merged into the
 * curated register.
 *
 * Usage:
 *   node scripts/ingest-scout.mjs <path-to-scout-ecm.json>            # dry-run (default)
 *   node scripts/ingest-scout.mjs <path-to-scout-ecm.json> --write    # appends to data/measures.json
 *
 * Dry-run NEVER touches data/. --write only APPENDS proposed entries; it never
 * overwrites or removes existing curated entries.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEASURES_PATH = path.resolve(__dirname, "../data/measures.json");

function usageAndExit(msg) {
  if (msg) console.error(`error: ${msg}`);
  console.error("usage: node scripts/ingest-scout.mjs <path-to-scout-ecm.json> [--write]");
  process.exit(msg ? 1 : 0);
}

function slugify(name) {
  return String(name ?? "unnamed-ecm")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Extracts the ECM list from either a top-level array or a `{ecms: [...]}` /
 * `{measures: [...]}` wrapper — Scout exports vary by download. */
function extractEcms(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.ecms)) return parsed.ecms;
  if (Array.isArray(parsed?.measures)) return parsed.measures;
  // A single ECM object.
  return [parsed];
}

/** Maps one Scout ECM object to a proposed measures.json entry. Best-effort: any
 * field Scout doesn't provide is left as a TODO rather than guessed. */
function mapEcmToMeasure(ecm, currentYear) {
  const measureId = slugify(ecm.name ?? ecm.ecm_name ?? ecm.id);
  const cost = typeof ecm.installed_cost === "number" ? ecm.installed_cost : null;

  return {
    measure_id: measureId,
    measure_kind: "TODO_classify", // e.g. efficiency_upgrade | fuel_switch — Scout doesn't label this directly
    category: "TODO_map_category", // map from ecm.end_use / ecm.technology
    unit_basis: ecm.cost_units ?? "TODO_unit_basis",
    archetypes: ["TODO_infer_from_ecm.bldg_type"],
    capex:
      cost === null
        ? { low: null, base: null, high: null }
        : { low: Math.round(cost * 0.85), base: cost, high: Math.round(cost * 1.15) },
    // TODO: no cost_breakdown in Scout exports — needs a manual material/labour/equipment split.
    cost_breakdown: { material: null, labour: null, equipment: null },
    contingency_pct: null, // TODO: not provided by Scout — apply a standard default on review
    escalation: {
      // TODO: Scout does not stamp a base year on installed_cost — confirm against
      // the ECM's source vintage (installed_cost_source) before treating this as
      // the base_year, then escalate to current_year via the standard PPI index.
      base_year: "TODO_confirm_base_year",
      index: "BLS PPI construction",
      index_vintage: "TODO_set_on_ingest",
      escalated_to: currentYear,
    },
    confidence: "low", // scaffold output is always low-confidence pending human review
    reference_ids: [], // TODO: register `ecm.installed_cost_source` via add_reference, then link its id here
    notes:
      `PROPOSED via ingest-scout.mjs from Scout ECM "${ecm.name ?? ecm.ecm_name ?? measureId}". ` +
      `Source: ${ecm.installed_cost_source ?? "unknown"}. ` +
      `energy_efficiency: ${JSON.stringify(ecm.energy_efficiency ?? null)}. ` +
      `product_lifetime: ${ecm.product_lifetime ?? "unknown"} yrs. NOT curated — review before merging.`,
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") usageAndExit();
  const inputPath = args[0];
  const write = args.includes("--write");

  let raw;
  try {
    raw = readFileSync(inputPath, "utf-8");
  } catch (e) {
    usageAndExit(`could not read ${inputPath}: ${e.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    usageAndExit(`${inputPath} is not valid JSON: ${e.message}`);
  }

  const ecms = extractEcms(parsed);
  if (ecms.length === 0) {
    console.log("no ECMs found in input — nothing to propose.");
    return;
  }

  let existing = { current_year: new Date().getFullYear(), measures: [] };
  try {
    existing = JSON.parse(readFileSync(MEASURES_PATH, "utf-8"));
  } catch {
    // fine — proposal is still printable even if measures.json is unreadable
  }

  const proposed = ecms.map((ecm) => mapEcmToMeasure(ecm, existing.current_year ?? new Date().getFullYear()));

  console.log(`[ingest-scout] parsed ${ecms.length} ECM(s) from ${inputPath}`);
  console.log(`[ingest-scout] mode: ${write ? "WRITE (append to data/measures.json)" : "DRY-RUN (no files modified)"}`);
  console.log(JSON.stringify({ proposed_measures: proposed }, null, 2));

  if (!write) {
    console.log("[ingest-scout] dry-run complete — pass --write to append these proposed entries to data/measures.json.");
    return;
  }

  const existingIds = new Set((existing.measures ?? []).map((m) => m.measure_id));
  const toAppend = proposed.filter((m) => {
    if (existingIds.has(m.measure_id)) {
      console.log(`[ingest-scout] skipping "${m.measure_id}" — already present in data/measures.json (curated entries are never clobbered).`);
      return false;
    }
    return true;
  });

  const next = { ...existing, measures: [...(existing.measures ?? []), ...toAppend] };
  writeFileSync(MEASURES_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8");
  console.log(`[ingest-scout] appended ${toAppend.length} proposed measure(s) to ${MEASURES_PATH}. Review + re-classify TODOs before treating as curated.`);
}

main();
