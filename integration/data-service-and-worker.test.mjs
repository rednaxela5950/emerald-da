import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import crypto from "node:crypto";

const port = 4100 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
let server;

function sha256Hex(buf) {
  return "0x" + crypto.createHash("sha256").update(buf).digest("hex");
}

async function waitForHealth(timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      // keep retrying
    }
    await sleep(100);
  }
  throw new Error("data service health check timed out");
}

before(async () => {
  server = spawn("node", ["packages/dummy-data-service/dist/server.js"], {
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore"
  });
  await waitForHealth();
});

after(async () => {
  if (server) {
    server.kill();
    await sleep(100);
  }
});

test("stores and retrieves blobs with matching cidHash and worker verification", async () => {
  const payload = Buffer.from("integration blob payload");
  const postRes = await fetch(`${baseUrl}/blob`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: payload
  });
  assert.equal(postRes.status, 200);
  const body = await postRes.json();
  assert.ok(body.cidHash, "cidHash missing from response");
  const expectedHash = sha256Hex(payload);
  assert.equal(body.cidHash, expectedHash);

  const getRes = await fetch(`${baseUrl}/blob/${body.cidHash}`);
  assert.equal(getRes.status, 200);
  const fetched = Buffer.from(await getRes.arrayBuffer());
  assert.deepEqual(fetched, payload);

  const { verifyBlob } = await import("../packages/emerald-da-worker/dist/index.js");
  const verified = await verifyBlob(body.cidHash, fetched);
  assert.equal(verified, true);
});

test("returns 404 for unknown blobs", async () => {
  const res = await fetch(`${baseUrl}/blob/0xdeadbeef`);
  assert.equal(res.status, 404);
});
