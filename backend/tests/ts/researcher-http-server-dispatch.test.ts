import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { startHttpServer } from "../../server/http-server.js";
import { harness } from "./harness.js";
import type { ResearcherWorkflow } from "../../agents/researcher/workflow.js";

function mockResearcher(): ResearcherWorkflow {
  return {
    runWithRuntime: async () => ({
      draft: "mock draft",
      citations: [],
      confidence: 1,
      route_snapshot: {
        routeId: "route:test",
        workflowId: "researcher",
        runtimeId: "fake-runtime",
        transport: "openai-chat",
        model: { modelId: "mock-model", providerId: "mock" },
        reason: "mock",
      },
    }),
  } as unknown as ResearcherWorkflow;
}

test("M13: startHttpServer dispatches researcher routes when researcher is configured", async () => {
  const h = await harness("researcher-http-dispatch");
  const server = await startHttpServer(
    h.runtime,
    h.runs,
    h.events,
    resolve("app/web/dist"),
    0,
    h.task,
    undefined,
    undefined,
    undefined,
    { researcher: mockResearcher() },
  );

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;

    // GET /api/providers must reach the researcher handler (not 404).
    const list = await fetch(`${base}/api/providers`);
    assert.equal(
      list.status,
      200,
      "GET /api/providers should be dispatched to researcher handler",
    );
    const listBody = (await list.json()) as { providers?: unknown[] };
    assert.ok(Array.isArray(listBody.providers));

    // POST /api/providers/test must be dispatched (not 501/404).
    // With no live provider configured it returns 400, proving the route is wired.
    const provTest = await fetch(`${base}/api/providers/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider_id: "ollama" }),
    });
    await provTest.arrayBuffer();
    assert.notEqual(
      provTest.status,
      501,
      "POST /api/providers/test must not return 501 when researcher is configured",
    );
    assert.notEqual(
      provTest.status,
      404,
      "POST /api/providers/test must not return 404",
    );

    // POST /api/providers/discover-models must be dispatched (not 501/404).
    const discover = await fetch(`${base}/api/providers/discover-models`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider_id: "ollama" }),
    });
    await discover.arrayBuffer();
    assert.notEqual(discover.status, 501);
    assert.notEqual(discover.status, 404);

    // POST /api/researcher/run must be dispatched (not 501/404).
    const run = await fetch(`${base}/api/researcher/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "test" }),
    });
    await run.arrayBuffer();
    assert.notEqual(run.status, 501);
    assert.notEqual(run.status, 404);
  } finally {
    try {
      server.closeAllConnections?.();
      await new Promise<void>((ok) => server.close(() => ok()));
    } catch {}
    // Give libuv handles (Python bridge child process, lingering sockets)
    // a moment to drain before the --test-force-exit runner force-closes
    // them on Windows; without this the process aborts with a UV_HANDLE_CLOSING
    // assertion.
    await new Promise((r) => setTimeout(r, 100));
    await h.bridge.close();
  }
});
