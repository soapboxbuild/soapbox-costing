# Tool orchestration — per-tool call recipes

Detailed args and returned-field mapping for each of the 9 `costing` MCP tools, in the order the
`costing` skill's Method calls them. See `../SKILL.md` for the ground rules and the summary
mapping table; this file is the mechanical reference for exact calls.

---

## 1. `list_measures`

**Call:** `list_measures()` — no args.

**Returns:** `{ measures: [{ measure_id, category, measure_kind, unit_basis, confidence }] }`.

**Use:** confirm coverage before costing a roster entry. If a roster's `measure_id` (or its
archetype/system) has no matching entry, flag the gap explicitly rather than costing an
unrelated measure_id as a stand-in.

---

## 2. `get_measure_capex`

**Call:** `get_measure_capex({ measure_id, region?, size? })`.

- `measure_id` — from `list_measures` / the roster.
- `region`, `size` are accepted for forward-compat but **not yet applied** server-side
  (`region_applied` in the result is currently always `null`) — do not rely on them to
  regionalize the result; use `get_regional_factor` separately for that (see §6).

**Returns:** `{ measure_id, unit_basis, capex{low,base,high}, cost_breakdown{material,labour,
equipment}, contingency_pct, escalation{base_year,index,index_vintage,escalated_to}, source,
confidence, reference_ids, references[] }`.

**Maps to:**
- `cost.capex` ← `capex` verbatim.
- `cost_breakdown` ← `cost_breakdown` verbatim (regionalize per §6 before finalizing).
- `contingency_pct` ← `contingency_pct` verbatim.
- `escalation` ← `escalation` verbatim.
- attach `references` (already embedded in the result — no separate `get_references` call
  needed unless you want the full register entry beyond what's inlined).

**Fuel-switch second call:** for any `measure_kind: fuel_switch` measure, call
`get_measure_capex` a **second** time against the non-switching sibling `measure_id` (e.g. the
condensing-boiler-replacement measure paired with the ASHP-conversion measure). Take that
result's `capex.base` (a single number, not the low/base/high spread) and `opex_delta_yr` (see
§4 for how to derive it for the alternative) to populate:

```json
"efficiency_alternative": {
  "measure": "<sibling measure_id or human label>",
  "capex": <second call's capex.base>,
  "opex_delta_yr": <derived per §4 for the sibling>
}
```

---

## 3. `estimate_service_upgrade`

**Call:** `estimate_service_upgrade({ sector, target_amperage?, demand_increase_kw?, phase?,
service_capacity_known? })`.

- `sector`: `"residential" | "commercial"` from the building archetype.
- `demand_increase_kw`: the delta between the new electrified end-use's peak electrical demand
  and the existing electrical peak at that panel/service entrance (from the Audette model). Pass
  this when `target_amperage` is unknown — the tool derives amperage from it.
- `service_capacity_known`: pass `true` **only** when a real electrical survey, panel schedule,
  or interconnection study confirms available headroom. Otherwise omit/leave `false` — the
  screening-scale UNVERIFIED range is the honest default.

**Returns:** `{ upgrade_cost{low,base,high}, flag: "VERIFIED"|"UNVERIFIED", basis, confidence,
assumptions[] }`.

**Maps to `cost.electrical_capacity`:**

```json
{
  "demand_increase_kw": <the demand_increase_kw you passed in>,
  "service_capacity_known": <what you passed in>,
  "upgrade_cost": { "low": <result.upgrade_cost.low>, "high": <result.upgrade_cost.high> },
  "flag": <result.flag>
}
```

**Ground-rule enforcement:** when `flag === "UNVERIFIED"`, `upgrade_cost.low` will be `0` and
`upgrade_cost.high` the full new-service cost — copy both through as a range. **Never** average
them, never drop one, and never report `result.upgrade_cost.base` as if it were a confirmed
figure when `flag` is `UNVERIFIED`. Only when `flag === "VERIFIED"` (i.e. you passed
`service_capacity_known: true`) is `low === high === base` a legitimate point estimate, not a
disguised one.

---

## 4. `get_energy_prices` + `get_tariff` → `opex_delta_yr`

**`get_energy_prices({ region, sector, fuel })`:**
- `region`: US state code (e.g. `"CA"`).
- `sector`: `"COM" | "RES" | "IND"`.
- `fuel`: `"electricity" | "natural_gas"` — call once per fuel involved in the measure (a
  fuel-switch measure needs both: the fuel being displaced and the fuel being adopted).

**Returns:** `{ fuel, sector, region, price{value, units, period}, series[], source }`.

**`get_tariff({ utility?, sector?, address?, limit? })`:**
- Prefer `address` when you don't know the utility name; otherwise pass `utility` directly.
- `sector` defaults to `"Commercial"`.

**Returns:** `{ query, count, tariffs: [{ label, utility, name, sector, energy_charge_summary,
demand_charge_summary, has_demand_charges, uri }], source }`.

**Derivation:** compute the annual energy cost under the *existing* fuel/end-use and under the
*new* fuel/end-use (or the efficiency-alternative's fuel, which is usually unchanged), using
`get_energy_prices`' retail price plus, where `has_demand_charges` is true in the matched
`get_tariff` result, an estimated demand-charge component from `demand_charge_summary` applied
to the relevant `kW` figure (from the Audette model or `estimate_service_upgrade`'s
`demand_increase_kw`). A flat blended rate alone can understate a demand-charge-heavy tariff, so
always check `get_tariff` even when `get_energy_prices` alone would produce a plausible number.

`opex_delta_yr = (new-fuel annual energy cost) − (existing-fuel annual energy cost)`.
**Positive = OpEx rises** (e.g. adopting electricity at a higher $/kWh displaces cheaper gas);
**negative = OpEx falls**. Never flip this sign when composing measures or comparing the
fuel-switch measure against its `efficiency_alternative`.

---

## 5. `get_der_economics`

**Call:** `get_der_economics({ system, size, lat?, lon? })`.

- `system`: `"solar_pv" | "battery_storage" | "gshp"`.
- `size` units depend on system: `solar_pv` is kW (DC nameplate), `battery_storage` is kWh
  (usable energy), `gshp` is tons (block capacity).
- Pass `lat`/`lon` for `solar_pv` to also fetch real annual production from NREL PVWatts v8
  (adds `ac_annual_kwh`, `capacity_factor`, `production_source` to the result).

**Returns:** `{ system, size, capex{low,base,high}, opex_delta_yr, unit_basis, confidence,
basis, [ac_annual_kwh, capacity_factor, production_source] }`.

**Maps to:** `cost.capex` ← `capex` verbatim; `cost.opex_delta_yr` ← `opex_delta_yr` verbatim
(already signed correctly — O&M is a cost, so it is typically ≤ 0 for solar unless a separate
savings computation elsewhere nets it out; do not re-sign it here). DER measures use this tool
**instead of** `get_measure_capex` + `get_energy_prices`/`get_tariff` for both `capex` and
`opex_delta_yr`.

---

## 6. `get_regional_factor`

**Call:** `get_regional_factor({ region })` — Census division name, US state code/name, or
`"national"`.

**Returns:** labour and material cost multipliers (BLS-informed PLACEHOLDER figures pending
tuning; unknown regions fall back to national factors with a note rather than throwing).

**Use:** apply the labour factor to `cost_breakdown.labour` and the material factor to
`cost_breakdown.material` from the `get_measure_capex` result; `cost_breakdown.equipment` always
stays at national cost. Note in the assembled measure that these multipliers are placeholder
figures, not verified regional pricing.

---

## 7. `get_references`

**Call:** `get_references({ measure_id?, system_type? })` — pass `measure_id` for a specific
measure's backing citations, `system_type` to browse by system (chillers, boilers, ashp, gshp,
hpwh, rtu_controls, ventilation, vfd, rcx, envelope, lighting, fume_hood, vrf), both to combine,
or neither to list the entire register.

**Returns:** `{ references: [{ id, system_type, citation, publisher, year, reported_range,
unit_basis, url, license, confidence }] }`.

**Use:** attach citations to every assembled measure. If `get_measure_capex` already embedded
`references[]` in its result, a separate `get_references` call is only needed to see the full
register entry or to browse by `system_type` (e.g. checking coverage for a system before costing
it).

---

## 8. `add_reference`

**Call:** `add_reference({ id, system_type, citation, publisher, year, reported_range?,
unit_basis?, url?, license?, confidence })`.

**Use:** ops/build tool, not an end-user analysis step. Use it when you encounter a new citable
source not already in the register (e.g. from the Scout/DEER/TRM enrichment loop, or a
contractor quote worth retaining) so the reference library — and its shared hindsight
`soapbox-costing` bank — grows for future runs. Do not call this mid-analysis to "invent" a
citation for a number you don't actually have a source for.

---

## Fuel-switch worked example: opex_delta_yr + efficiency_alternative together

For a gas boiler → central ASHP conversion:

1. `get_energy_prices({ region: "NY", sector: "COM", fuel: "natural_gas" })` → existing-fuel
   price basis.
2. `get_energy_prices({ region: "NY", sector: "COM", fuel: "electricity" })` → new-fuel price
   basis.
3. `get_tariff({ address: "<building address>", sector: "Commercial" })` → check
   `has_demand_charges`; if true, add the demand-charge component driven by
   `estimate_service_upgrade`'s `demand_increase_kw`.
4. Compute `opex_delta_yr` = new-electricity annual cost − existing-gas annual cost (positive
   here, since electrified heat typically costs more per delivered therm-equivalent than gas).
5. `estimate_service_upgrade({ sector: "commercial", demand_increase_kw: 420,
   service_capacity_known: false })` → `electrical_capacity` (UNVERIFIED range, never
   collapsed).
6. `get_measure_capex({ measure_id: "central-ashp" })` → `capex`, `cost_breakdown`,
   `contingency_pct`, `escalation`.
7. `get_measure_capex({ measure_id: "condensing-boiler-replacement" })` → the
   `efficiency_alternative` sibling; recompute its own `opex_delta_yr` (gas-to-gas, typically
   negative — more efficient combustion lowers OpEx) from the same `get_energy_prices`
   natural-gas call in step 1, scaled by the efficiency improvement.
8. Assemble, validate, hand off — see `../SKILL.md` Steps 3–5.
