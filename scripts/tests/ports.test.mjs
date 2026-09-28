import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";

import {
  extractListeningPort,
  findAvailablePort,
  isHealthyPayload,
  isPortOccupied,
  waitForHealthy,
} from "../lib/ports.mjs";

/** Starts a raw TCP listener and resolves with it and its port. */
function startTcpListener(host) {
  return new Promise((resolveListener) => {
    const server = net.createServer();
    server.listen(0, host, () => {
      resolveListener({ server, port: server.address().port });
    });
  });
}

/** Starts a health endpoint stub that answers with the given JSON payload. */
function startHealthStub(payload) {
  return new Promise((resolveListener) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    });
    server.listen(0, "127.0.0.1", () => {
      resolveListener({ server, port: server.address().port });
    });
  });
}

function stopListener(server) {
  return new Promise((resolveClose) => server.close(() => resolveClose()));
}

test("Port occupancy — a port is only free when nothing can answer on it", async (t) => {
  await t.test("a port held on the wildcard address is occupied and skipped", async () => {
    // The stale-port defect: on Windows a wildcard holder answers loopback
    // connections while a loopback bind probe still reports the port as free.
    const { server, port } = await startTcpListener("0.0.0.0");
    try {
      assert.equal(await isPortOccupied(port), true);

      const selected = await findAvailablePort(port);
      assert.ok(selected > port, `expected a port above ${port}, received ${selected}`);
      assert.equal(await isPortOccupied(selected), false);
    } finally {
      await stopListener(server);
    }
  });

  await t.test("a port held on loopback only is occupied and skipped", async () => {
    const { server, port } = await startTcpListener("127.0.0.1");
    try {
      assert.equal(await isPortOccupied(port), true);
      assert.ok((await findAvailablePort(port)) > port);
    } finally {
      await stopListener(server);
    }
  });

  await t.test("a released port is available again", async () => {
    const { server, port } = await startTcpListener("127.0.0.1");
    await stopListener(server);
    assert.equal(await isPortOccupied(port), false);
  });
});

test("Health verification — the payload contract decides, not the status code", async (t) => {
  await t.test("a 200 response with a foreign payload is not healthy", async () => {
    const { server, port } = await startHealthStub({ status: "ok" });
    try {
      const result = await waitForHealthy(port, { attempts: 2, intervalMs: 10, timeoutMs: 500 });
      assert.equal(result.healthy, false);
      assert.equal(result.status, 200);
      assert.deepEqual(result.payload, { status: "ok" });
    } finally {
      await stopListener(server);
    }
  });

  await t.test("the canonical OneShot health payload is accepted", async () => {
    const { server, port } = await startHealthStub({ status: "healthy", ok: true, version: "1.3.0" });
    try {
      const result = await waitForHealthy(port, { attempts: 3, intervalMs: 10, timeoutMs: 500 });
      assert.equal(result.healthy, true);
      assert.equal(result.payload.ok, true);
      assert.equal(result.payload.status, "healthy");
    } finally {
      await stopListener(server);
    }
  });

  await t.test("isHealthyPayload rejects incomplete or negative payloads", () => {
    assert.equal(isHealthyPayload({ status: "healthy", ok: true }), true);
    assert.equal(isHealthyPayload({ status: "healthy" }), false);
    assert.equal(isHealthyPayload({ ok: true }), false);
    assert.equal(isHealthyPayload({ status: "healthy", ok: false }), false);
    assert.equal(isHealthyPayload(null), false);
  });
});

test("Backend listening line — bound port extraction", () => {
  assert.equal(extractListeningPort("[OneShot] Listening on http://0.0.0.0:8789\n"), 8789);
  assert.equal(extractListeningPort("[OneShot] Listening on http://[::]:8787\n"), 8787);
  assert.equal(extractListeningPort("[OneShot] Listening on http://127.0.0.1:9001"), 9001);
  assert.equal(extractListeningPort("no listening line here"), null);
  assert.equal(extractListeningPort(undefined), null);
});
