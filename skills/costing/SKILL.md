---
name: costing
description: >
  Orchestrate the soapbox-costing MCP's 9 tools into a validated `measure.cost` object per
  decarbonization measure — CapEx (low/base/high), annual OpEx delta, electrical service-capacity
  headroom for fuel-switch measures, and a non-switching efficiency alternative — with every
  figure traceable to a cited reference. Triggers on: "cost this measure", "cost this roster",
  "what's the CapEx for", "estimate construction cost", "how much would this retrofit cost",
  "electrical service upgrade cost". Does not compute NPV/IRR/payback — that's `decarb-plan`.
version: 0.1.0
---

# Costing

You are turning one or more decarbonization measures into a validated `measure.cost` object,
per measure, by calling the live `costing` MCP's 9 tools and assembling their results into the
**canonical contract in soapbox-agent** —
`soapbox-agent/skills/construction-costing/schema/measure-cost.schema.json`. This skill does
**not** vendor or copy that schema; it describes the shape below and points to the canonical
file as the single source of truth. Downstream consumers (`decarb-plan`, `quality-review`) read
`measure.cost` objects that conform to it.

**Positioning:** this skill's job ends at producing a validated `measure.cost` object per
measure. It **does not compute IRR**, NPV, payback, or landlord-share capture — that economics
step belongs to `decarb-plan`, which consumes this skill's output alongside energy-savings
estimates. If you find yourself computing a discounted cashflow here, stop — that work belongs
downstream.

---

## Ground rules

1. **No invented numbers.** Every `capex`, `opex_delta_yr`, `electrical_capacity`, and
   `efficiency_alternative` figure must come from an MCP tool result (or be explicitly flagged
   as a tuned-base/placeholder figure the tool itself reports, e.g. `get_regional_factor`'s
   BLS-informed placeholders). If a tool has no coverage for a measure/system/region, say so —
   do not guess a number to fill the gap. There is no invented figure anywhere in this method.
2. **Always surface references.** Every cost figure is only as credible as its citation. Call
   `get_references` (or read the `references[]` array a `get_measure_capex` result already
   carries) and attach the backing citations to the assembled measure. An uncited number is
   low-confidence and must be flagged as such — never presented as if it were verified.
3. **Never collapse an UNVERIFIED electrical-capacity range.** `estimate_service_upgrade`
   returns `flag: "UNVERIFIED"` whenever actual service capacity is unknown, with
   `upgrade_cost.low = 0` (best case: existing headroom covers the increase) and
   `upgrade_cost.high` = full new-service cost. Do not average, midpoint, or otherwise collapse
   that range into a point estimate — the spread communicates real risk to `decarb-plan`'s
   economics and to `quality-review`. Only a `flag: "VERIFIED"` result (a confirmed survey or
   quote) may be reported as a single number.
4. **Every fuel-switch measure gets an `efficiency_alternative`.** Any `measure_kind:
   fuel_switch` measure must carry a second, non-switching high-efficiency option (a second
   `get_measure_capex` call against the non-electrifying sibling measure), so `decarb-plan` can
   screen "switch fuels" against "stay on the same fuel but get more efficient."
5. **Flag coverage gaps rather than fabricating a false point.** Missing rows in
   `list_measures`, no tariff match, no PVWatts coverage for a location — report the gap
   explicitly (commercial-electrical and lab/fume-hood measures are common gaps) instead of
   silently substituting an unrelated figure.
6. **Feed new sources back.** When you encounter a citable source not yet in the reference
   library (a new survey, DEER/TRM entry, or vendor quote), register it via `add_reference` so
   the library grows for future runs.
7. **Validate before handing off.** Every `measure.cost` object must match the canonical
   contract's required keys exactly before it goes to `decarb-plan`.

---

## The `measure.cost` contract (canonical shape — do not vendor)

The full JSON Schema lives at
`soapbox-agent/skills/construction-costing/schema/measure-cost.schema.json`. This skill produces
exactly these keys per measure:

```
measure_id            string
measure_kind           "fuel_switch" | "efficiency" | "envelope" | "controls" | "other"
cost:
  capex                { low, base, high }
  opex_delta_yr         number   (POSITIVE = OpEx rises, NEGATIVE = OpEx falls — never flip)
  electrical_capacity   { demand_increase_kw, service_capacity_known, upgrade_cost{low,high}, flag }
                         — REQUIRED whenever measure_kind is fuel_switch / electrification
  efficiency_alternative { measure, capex, opex_delta_yr }
                         — REQUIRED whenever measure_kind is fuel_switch
```

Plus the additive extension this skill also populates from `get_measure_capex`:
`contingency_pct`, `cost_breakdown{material,labour,equipment}`,
`escalation{base_year,index,index_vintage,escalated_to}`.

Non-fuel-switch measures omit `electrical_capacity` and `efficiency_alternative` entirely.

---

## Tool → contract mapping (authoritative)

| MCP tool | Feeds | Notes |
|---|---|---|
| `list_measures` | measure discovery | Enumerate available `measure_id`s, categories, kinds, confidence before costing a roster. |
| `get_measure_capex` | `cost.capex`, `cost_breakdown`, `contingency_pct`, `escalation`, `references[]` | Curated low/base/high, escalated to current-year dollars. For fuel-switch measures, call a **second** time against the non-switching sibling measure to populate `efficiency_alternative`. |
| `estimate_service_upgrade` | `cost.electrical_capacity` | REQUIRED on any fuel_switch/electrification measure. Returns an UNVERIFIED range (never collapsed) unless `service_capacity_known` is confirmed, in which case it returns a VERIFIED point. |
| `get_energy_prices` + `get_tariff` | derive `cost.opex_delta_yr` | `get_energy_prices` gives the retail electricity/gas price basis; `get_tariff` supplies demand charges a flat blended rate would omit. Combine both — positive result means OpEx rises. |
| `get_der_economics` | `cost.capex` / `cost.opex_delta_yr` for solar/storage/GHP measures | `size` units vary by system (kW solar, kWh battery, tons GSHP); pass `lat`/`lon` for real PVWatts production on solar. |
| `get_regional_factor` | regionalizes `get_measure_capex`'s labour/material split | Apply the labour factor to `cost_breakdown.labour` and the material factor to `cost_breakdown.material`; equipment stays at national cost. Placeholder BLS-informed figures — flag as such. |
| `get_references` | citations attached to the assembled measure | Pass `measure_id` for a specific measure's citations, `system_type` to browse by system, or neither to list the whole register. |
| `add_reference` | grows the reference library (ops tool, not analysis) | Use when you encounter a new citable source not already in the register. |

Full per-tool call recipes — exact args, exact returned-field mapping, and the fuel-switch /
opex-delta worked examples — are in `references/tool-orchestration.md`.

---

## Method

### Step 1: Read the measure roster and building/Audette context

Load the measure roster for the engagement (the candidate list from `decarb-plan`'s measure
generation, or a single measure the user names directly) and the corresponding Audette building
model — archetype, climate, size, end-use energy breakdown, and, for any fuel-switch candidate,
existing peak electrical demand and (if known) electrical service capacity. Call `list_measures`
to confirm coverage for each roster entry's `measure_id` before costing it. If a required field
is missing (e.g. no peak-demand data for a candidate fuel-switch measure), flag it — do not fill
the gap with an assumption.

### Step 2: Per measure, call the mapped MCP tools

For each measure, follow the tool → contract mapping table above (detailed recipes in
`references/tool-orchestration.md`):

1. `get_measure_capex(measure_id, region, size)` → `capex`, `cost_breakdown`, `contingency_pct`,
   `escalation`. Regionalize the labour/material split with `get_regional_factor` if a region is
   known.
2. If `measure_kind` is `fuel_switch`: call `estimate_service_upgrade` for
   `electrical_capacity`, and a **second** `get_measure_capex` against the non-switching sibling
   measure for `efficiency_alternative`.
3. Derive `opex_delta_yr` from `get_energy_prices` (retail price basis) combined with
   `get_tariff` (demand-charge basis, where present). For DER measures, use
   `get_der_economics` instead of `get_measure_capex`/energy-prices for both `capex` and
   `opex_delta_yr`.
4. Pull citations via `get_references` (or read `references[]` off the `get_measure_capex`
   result directly) and attach them to the assembled measure.

### Step 3: Assemble the `measure.cost` object

Build the object per measure exactly as shown in the contract shape above. Example for a
fuel-switch measure:

```json
{
  "measure_id": "central-ashp",
  "measure_kind": "fuel_switch",
  "cost": {
    "capex": { "low": 1400000, "base": 2100000, "high": 3200000 },
    "opex_delta_yr": 48000,
    "electrical_capacity": {
      "demand_increase_kw": 420,
      "service_capacity_known": false,
      "upgrade_cost": { "low": 0, "high": 1800000 },
      "flag": "UNVERIFIED"
    },
    "efficiency_alternative": {
      "measure": "high-efficiency condensing boiler replacement",
      "capex": 520000,
      "opex_delta_yr": -14000
    }
  }
}
```

### Step 4: Validate against the canonical soapbox-agent schema

Validate every assembled measure against
`soapbox-agent/skills/construction-costing/schema/measure-cost.schema.json` before handing it
downstream — required keys present, `measure_kind` in the allowed enum, `electrical_capacity`
and `efficiency_alternative` present on every `fuel_switch` measure, and no UNVERIFIED
`electrical_capacity` with `upgrade_cost.low === upgrade_cost.high` (a disguised point estimate).
Fix any measure that fails validation — do not hand an invalid `measure.cost` object downstream.

### Step 5: Hand off to decarb-plan

Once validated, the `measure.cost` objects go to `decarb-plan`'s measure-screening step, which
combines them with energy-savings estimates to compute NPV/IRR/payback and apply landlord-share
capture. This skill's job ends here — it **does not compute IRR** or any other economic-return
metric; that is `decarb-plan`'s responsibility. `quality-review` separately reads these objects
back when auditing a plan's cost basis for defensibility.
