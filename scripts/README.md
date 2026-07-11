# Costing data scripts

The costing reference library (`data/references.json`) and the curated measure
store (`data/measures.json`) are meant to **grow over time**, not be a one-shot
seed. This directory holds the tooling for that enrichment loop.

## The enrichment loop: Scout -> DEER -> TRM -> curated

1. **DOE Scout** (https://scout.energy.gov/) publishes machine-readable ECM
   (Energy Conservation Measure) data with `installed_cost`, `cost_units`,
   `installed_cost_source`, `energy_efficiency`, and `product_lifetime`. This is
   the widest-coverage, most-automatable source, so it's the first ingest stage.
2. **DEER** (California's Database for Energy Efficient Resources) and **state
   TRMs** (Technical Reference Manuals, e.g. NY, MA, IL) provide deeper,
   jurisdiction-specific figures with strong measure-level cost documentation.
   These are typically ingested by hand (PDF/table extraction) because their
   formats aren't as uniform as Scout's JSON exports, but they follow the same
   shape once mapped.
3. Each stage's output is a **proposed** entry, never a curated one. A human
   (or a follow-on task) reviews the TODOs (category/kind classification,
   cost_breakdown split, contingency_pct, base_year confirmation, archetype
   inference), fills them in, and only then does the entry become a real
   `data/measures.json` row with a `reference_ids` link back to its source.
4. Every source that backs a curated entry gets registered as a citable
   reference via **`add_reference`** (the MCP tool in `src/tools/add-reference.ts`,
   backed by `src/sources/library.ts`). That call does two things:
   - appends the citation to `data/references.json` (the local register this
     service reads at runtime), and
   - retains it into the shared hindsight `soapbox-costing` bank (tags:
     `costing`, `reference`, `<system_type>`), so the reference library is
     durable across redeploys and queryable by any other agent/service that
     recalls from that bank.

   If the hindsight bank isn't configured or reachable, `add_reference` still
   updates the local register and reports `bank_synced: false` with a note —
   it never fails the whole operation over a bank-sync hiccup.

This is intentionally iterative: v1 does not attempt to exhaustively ingest
Scout/DEER/TRM in one pass. The scaffold + this doc make the loop real and
repeatable so the library keeps growing as new sources are reviewed.

## Running the Scout ETL scaffold

`ingest-scout.mjs` is a **scaffold**, not a complete ETL. It maps a DOE Scout
ECM JSON export into proposed `data/measures.json`-shaped entries and prints
them — it does not handle every Scout schema variant or unit conversion, and
every proposed entry carries `confidence: "low"` and TODO markers for the
fields Scout doesn't provide (cost_breakdown split, contingency_pct, base_year,
category/kind classification, archetypes).

```bash
# Dry-run (default) — parses the file, prints proposed entries, touches nothing.
node scripts/ingest-scout.mjs path/to/scout-ecm-export.json

# Write mode — appends proposed entries to data/measures.json. Existing curated
# entries (matched by measure_id) are never overwritten or removed; a
# measure_id already present is skipped with a log line.
node scripts/ingest-scout.mjs path/to/scout-ecm-export.json --write
```

After a `--write` run, treat every appended entry as a draft: resolve the
TODOs, register its source via `add_reference`, and link the resulting
`reference_ids` before considering it curated.
