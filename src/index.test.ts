import { test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { buildServer } from "./index.js";

async function listen(): Promise<{ server: Server; port: number }> {
  const { httpServer } = buildServer();
  await new Promise<void>((r) => httpServer.listen(0, r));
  return { server: httpServer, port: (httpServer.address() as any).port };
}

// Streamable HTTP responds with SSE frames (event: message\ndata: {json}).
function parseRpc(text: string): any {
  const line = text.split("\n").find((l) => l.startsWith("data:"));
  return JSON.parse((line ?? text).replace(/^data:\s*/, ""));
}

async function rpc(port: number, method: string, params: unknown, id: number): Promise<any> {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  return { status: res.status, body: parseRpc(await res.text()) };
}

test("health endpoint returns ok", async () => {
  const { server, port } = await listen();
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
  server.close();
});

test("initialize handshake succeeds over /mcp", async () => {
  const { server, port } = await listen();
  const { status, body } = await rpc(port, "initialize", {
    protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" },
  }, 1);
  assert.equal(status, 200);
  assert.equal(body.result.serverInfo.name, "costing");
  server.close();
});

// Regression guard for the 502: a second /mcp request must NOT fail (the old
// shared-server double-connect crashed here), and tools/list must return list_measures.
test("tools/list returns list_measures on a fresh request (no 502)", async () => {
  const { server, port } = await listen();
  await rpc(port, "initialize", {
    protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" },
  }, 1);
  const { status, body } = await rpc(port, "tools/list", {}, 2);
  assert.equal(status, 200);
  const names = (body.result?.tools ?? []).map((t: any) => t.name);
  assert.ok(names.includes("list_measures"), `expected list_measures, got ${JSON.stringify(names)}`);
  assert.ok(names.includes("get_energy_prices"), `expected get_energy_prices, got ${JSON.stringify(names)}`);
  assert.ok(names.includes("get_tariff"), `expected get_tariff, got ${JSON.stringify(names)}`);
  assert.ok(names.includes("estimate_service_upgrade"), `expected estimate_service_upgrade, got ${JSON.stringify(names)}`);
  assert.ok(names.includes("get_der_economics"), `expected get_der_economics, got ${JSON.stringify(names)}`);
  assert.ok(names.includes("get_measure_capex"), `expected get_measure_capex, got ${JSON.stringify(names)}`);
  assert.ok(names.includes("get_references"), `expected get_references, got ${JSON.stringify(names)}`);
  assert.ok(names.includes("get_regional_factor"), `expected get_regional_factor, got ${JSON.stringify(names)}`);
  server.close();
});
