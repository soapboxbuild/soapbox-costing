import { test } from "node:test";
import assert from "node:assert/strict";
import { getReferences, loadReferences } from "./references.js";
import { listMeasures, getMeasureCapex } from "./measures.js";

test("every reference_id in measures.json resolves to a register entry (no dangling ids)", () => {
  const { references } = loadReferences();
  const knownIds = new Set(references.map((r) => r.id));
  const dangling: string[] = [];
  for (const m of listMeasures()) {
    for (const refId of m.reference_ids) {
      if (!knownIds.has(refId)) dangling.push(`${m.measure_id} -> ${refId}`);
    }
  }
  assert.deepEqual(dangling, [], `dangling reference_ids found: ${dangling.join(", ")}`);
});

test("getReferences({measure_id}) returns full citation objects for that measure's reference_ids", () => {
  const refs = getReferences({ measure_id: "commercial-chiller" });
  assert.ok(refs.length > 0, "expected at least one resolved reference");
  const ids = refs.map((r) => r.id);
  assert.ok(ids.includes("eia-equipment-2022"), JSON.stringify(ids));
  const eia = refs.find((r) => r.id === "eia-equipment-2022")!;
  assert.equal(typeof eia.citation, "string");
  assert.equal(typeof eia.publisher, "string");
  assert.equal(typeof eia.year, "number");
  assert.equal(typeof eia.url, "string");
});

test("getReferences({measure_id}) throws a clear error for an unknown measure_id", () => {
  assert.throws(
    () => getReferences({ measure_id: "does-not-exist" }),
    (err: unknown) => {
      const msg = (err as Error).message;
      assert.ok(msg.includes("does-not-exist"), msg);
      return true;
    },
  );
});

test("getReferences({system_type}) filters by system type", () => {
  const refs = getReferences({ system_type: "chillers" });
  assert.ok(refs.length > 0, "expected at least one chillers reference");
  for (const r of refs) {
    assert.ok(
      r.system_type.split(",").map((s) => s.trim()).includes("chillers"),
      `expected system_type to include chillers, got ${r.system_type}`,
    );
  }
});

test("getReferences() with no filters returns the full register", () => {
  const { references } = loadReferences();
  const refs = getReferences({});
  assert.equal(refs.length, references.length);
});

test("get_measure_capex result includes a references[] array of resolved citation objects", () => {
  const r = getMeasureCapex({ measure_id: "commercial-chiller" });
  assert.ok(Array.isArray(r.references), "expected references[] on capex result");
  assert.ok(r.references.length > 0);
  assert.ok(r.references.every((ref) => typeof ref.citation === "string" && typeof ref.url === "string"));
  const ids = r.references.map((ref) => ref.id);
  assert.ok(ids.includes("eia-equipment-2022"), JSON.stringify(ids));
});
