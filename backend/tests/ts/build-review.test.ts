import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { BuildReviewService, type BuildReview } from "../../runtime/build-review.js";
import { RunRepository } from "../../runtime/run-repository.js";
import { FileArtifactStore } from "../../runtime/artifact-store.js";
import { resolveTransition } from "../../workflow/canonical-transition.js";
import { advance } from "../../pipeline/stage-outcome.js";
import { startHttpServer } from "../../server/http-server.js";
import type { ConfirmedPackage } from "../../contracts/schema/types.js";
import { harness, prompt } from "./harness.js";

test("hash stage waits for Build authorization instead of scheduling Builder", () => {
  assert.deepEqual(resolveTransition("hash", advance({ equal: true }), 0), { type: "wait-build" });
});

test("Build Ready HTTP: no Builder before approval, return stays waiting, hash-bound approval and terminal rejection", { timeout: 45000 }, async () => {
  const runId = `build-review-${randomUUID()}`;
  const h = await harness(runId);
  const server = await startHttpServer(h.runtime, h.runs, h.events, join(process.cwd(), "app/web/dist"), 0,
    undefined, undefined, undefined, undefined, { workspaceRoot: process.cwd() });
  let execution: ReturnType<typeof h.runtime.run> | undefined;
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const url = `${base}/api/runs/${runId}/build-review`;
    h.runs.create(runId);
    await h.store.save(runId, "execution-mode", { mode: "inline" });
    await h.runtime.buildReview.enable(runId);
    const send = (input: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    assert.equal((await send({ action: "approve", hash: "a".repeat(64) })).status, 404);
    execution = h.runtime.run(runId, prompt(runId));
    let gate: BuildReview | undefined;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const response = await fetch(url);
      if (response.ok) { gate = await response.json() as BuildReview; break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(gate, "Build Ready must be published");
    const builderStarted = () => h.runs.require(runId).events.some(e => e.processor === "Builder" && e.execution_status === "Running");
    assert.equal(builderStarted(), false);
    assert.equal(gate.status, "pending");
    assert.deepEqual(gate.validation, { schema: "VALID", fixture: "VALID", goal: "VALID" });
    assert.equal((await send({ action: "approve", hash: "b".repeat(64) })).status, 409);
    assert.equal((await send({ action: "approve", hash: gate.hash, extra: true })).status, 400);
    assert.equal((await send({ action: "return", hash: gate.hash })).status, 200);
    assert.equal((await h.runtime.buildReview.get(runId))?.status, "pending");
    assert.equal(builderStarted(), false);
    const confirmed = await h.store.load<ConfirmedPackage>(runId, "confirmed");
    const changed = structuredClone(confirmed);
    changed.core.plan.revision++;
    await h.store.save(runId, "confirmed", changed);
    assert.equal((await send({ action: "approve", hash: gate.hash })).status, 409);
    await h.store.save(runId, "confirmed", confirmed);
    // Distinct service instances simulate separate API processes racing to approve.
    const other = new BuildReviewService(h.store);
    const decisions = await Promise.all([
      h.runtime.buildReview.decide(runId, { action: "approve", hash: gate.hash }),
      other.decide(runId, { action: "approve", hash: gate.hash }),
    ]);
    assert.ok(decisions.every(d => d.status === "approved"));
    const result = await execution;
    assert.equal(result.test_result, "Passed");
    assert.equal(result.hash_proof?.equal, true);
    assert.equal(result.events.filter(e => e.processor === "Builder" && e.execution_status === "Running").length, 1);
    assert.equal((await send({ action: "approve", hash: gate.hash })).status, 409);
    const history = await (await fetch(`${base}/api/runs`)).json();
    assert.ok(history.runs.some((r: any) => r.run_id === runId && r.test_result === "Passed"));
  } finally {
    if (execution && h.runs.get(runId)?.pipeline_status !== "Done") {
      h.runs.finish(runId, "Failed");
      await execution;
    }
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    h.close();
  }
});

test("history enumeration reloads real runs from disk", () => {
  const path = join(process.cwd(), ".runtime", "tests", `history-${randomUUID()}`);
  const first = new RunRepository(path);
  first.create("persisted-job");
  const reloaded = new RunRepository(path);
  assert.deepEqual(reloaded.list().map(run => run.run_id), ["persisted-job"]);
});

test("immutable artifact publication is atomic across store instances", async () => {
  const path = join(process.cwd(), ".runtime", "tests", `gate-atomic-${randomUUID()}`);
  const a = new FileArtifactStore(path), b = new FileArtifactStore(path);
  const results = await Promise.all([a.create("run", "approval", { winner: "a" }), b.create("run", "approval", { winner: "b" })]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await a.load<any>("run", "approval")).winner, results[0] ? "a" : "b");
});
