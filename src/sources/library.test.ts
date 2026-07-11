import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { addReference, recallReferences } from "./library.js";
import type { Reference } from "./references.js";

function freshRegister(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "costing-library-test-"));
  const p = path.join(dir, "references.json");
  writeFileSync(p, JSON.stringify({ references: [] }), "utf-8");
  return p;
}

const SAMPLE: Reference = {
  id: "test-ref-2026",
  system_type: "chillers",
  citation: "Test Citation",
  publisher: "Test Publisher",
  year: 2026,
  reported_range: "$1-2/unit",
  unit_basis: "$/unit",
  url: "https://example.com",
  license: "public domain",
  confidence: "medium",
};

test("addReference appends to the register and posts a retain with costing/reference/system_type tags", async () => {
  const registerPath = freshRegister();
  let calledUrl = "";
  let calledBody: any;
  const fakeFetch = async (url: string, init?: RequestInit) => {
    calledUrl = url;
    calledBody = JSON.parse(String(init?.body ?? "{}"));
    return { ok: true, json: async () => ({ ok: true }) } as any;
  };

  const result = await addReference(SAMPLE, {
    registerPath,
    hindsightUrl: "https://hindsight.test",
    hindsightToken: "tok",
    fetchImpl: fakeFetch,
  });

  assert.equal(result.registered, true);
  assert.equal(result.bank_synced, true);
  assert.ok(calledUrl.includes("hindsight.test"), calledUrl);
  assert.equal(calledBody.bank_id, "soapbox-costing");
  assert.deepEqual(calledBody.tags, ["costing", "reference", "chillers"]);

  const onDisk = JSON.parse(readFileSync(registerPath, "utf-8"));
  assert.ok(onDisk.references.some((r: Reference) => r.id === "test-ref-2026"));
});

test("addReference degrades gracefully when hindsight env/opts are unset (still registers, no throw)", async () => {
  const registerPath = freshRegister();
  const prevUrl = process.env.HINDSIGHT_URL;
  const prevToken = process.env.HINDSIGHT_TOKEN;
  delete process.env.HINDSIGHT_URL;
  delete process.env.HINDSIGHT_TOKEN;
  try {
    const result = await addReference(SAMPLE, { registerPath });
    assert.equal(result.registered, true);
    assert.equal(result.bank_synced, false);
    assert.equal(typeof result.note, "string");
    assert.ok(result.note!.length > 0);

    const onDisk = JSON.parse(readFileSync(registerPath, "utf-8"));
    assert.ok(onDisk.references.some((r: Reference) => r.id === "test-ref-2026"));
  } finally {
    if (prevUrl !== undefined) process.env.HINDSIGHT_URL = prevUrl;
    if (prevToken !== undefined) process.env.HINDSIGHT_TOKEN = prevToken;
  }
});

test("addReference degrades gracefully when the retain call throws (still registers, no throw)", async () => {
  const registerPath = freshRegister();
  const throwingFetch = async () => {
    throw new Error("network down");
  };
  const result = await addReference(SAMPLE, {
    registerPath,
    hindsightUrl: "https://hindsight.test",
    hindsightToken: "tok",
    fetchImpl: throwingFetch,
  });
  assert.equal(result.registered, true);
  assert.equal(result.bank_synced, false);
  assert.match(result.note ?? "", /network down/);
});

test("addReference degrades gracefully when the retain call returns a non-ok response", async () => {
  const registerPath = freshRegister();
  const failFetch = async () => ({ ok: false, status: 500, json: async () => ({}) } as any);
  const result = await addReference(SAMPLE, {
    registerPath,
    hindsightUrl: "https://hindsight.test",
    hindsightToken: "tok",
    fetchImpl: failFetch,
  });
  assert.equal(result.registered, true);
  assert.equal(result.bank_synced, false);
  assert.match(result.note ?? "", /500/);
});

test("recallReferences returns an empty, noted result when hindsight is not configured", async () => {
  const prevUrl = process.env.HINDSIGHT_URL;
  const prevToken = process.env.HINDSIGHT_TOKEN;
  delete process.env.HINDSIGHT_URL;
  delete process.env.HINDSIGHT_TOKEN;
  try {
    const result = await recallReferences("chillers");
    assert.deepEqual(result.results, []);
    assert.equal(result.bank_synced, false);
    assert.equal(typeof result.note, "string");
  } finally {
    if (prevUrl !== undefined) process.env.HINDSIGHT_URL = prevUrl;
    if (prevToken !== undefined) process.env.HINDSIGHT_TOKEN = prevToken;
  }
});

test("recallReferences posts a query and returns results when hindsight is configured", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ results: [{ id: "test-ref-2026" }] }) } as any);
  const result = await recallReferences("chillers", {
    hindsightUrl: "https://hindsight.test",
    hindsightToken: "tok",
    fetchImpl: fakeFetch,
  });
  assert.equal(result.bank_synced, true);
  assert.deepEqual(result.results, [{ id: "test-ref-2026" }]);
});
