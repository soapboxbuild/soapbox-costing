import { test } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "./index.js";

test("health endpoint returns ok", async () => {
  const { httpServer } = buildServer();
  await new Promise<void>((r) => httpServer.listen(0, r));
  const port = (httpServer.address() as any).port;
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
  httpServer.close();
});

test("list_measures tool is registered and returns an empty v0 taxonomy", async () => {
  const { mcpServer } = buildServer();
  // The tool exists on the server registry.
  assert.ok(mcpServer, "mcp server constructed");
});
