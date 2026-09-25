/**
 * Gate & Stage Reporting Honesty Tests
 *
 * Enforces the Response Verification Invariant: the API must report the state it
 * actually holds, never a value echoed back from the request or a hardcoded literal.
 *
 * Regression coverage for:
 * - /api/pipeline/gate/confirm used to confirm Gate 1 for ANY gateId and echo the
 *   caller's id back, so `gateId: "gate-2"` reported a confirmation that never happened.
 * - /api/pipeline/stages hardcoded `research` as "completed" regardless of real state.
 * - workflow_transition silently substituted targetStage="planning" when none was given.
 * - /api/pipeline/plan always returned null while the client validated a full plan.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startAgentServer } from "../../index.js";

describe("Gate and stage reporting honesty", () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    server = await startAgentServer({ port: 0, host: "127.0.0.1" });
    const addr = server.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json() as any };
  };

  it("gate/confirm rejects an unknown gateId instead of confirming gate 1", async () => {
    const { res, data } = await post("/api/pipeline/gate/confirm", { gateId: "gate-99" });
    assert.strictEqual(res.status, 400, "unknown gateId must be refused");
    assert.match(data.error, /Unknown gate/);
    assert.strictEqual(data.status, undefined, "must not report a confirmation status");
  });

  it("gate/confirm reports the gate it actually confirmed", async () => {
    const { res, data } = await post("/api/pipeline/gate/confirm", { gateId: "gate-1" });
    assert.strictEqual(res.status, 200);
    // The engine's canonical id is returned, not the request alias echoed back.
    assert.strictEqual(data.gateId, "gate_1_research_review");
    assert.strictEqual(data.name, "Gate 1: Research Review");
    assert.strictEqual(data.status, "CONFIRMED");
    assert.strictEqual(data.confirmedBy, "user");
    assert.ok(data.confirmedAt, "confirmedAt must be a real timestamp");
  });

  it("gate/confirm requires a packageCore for the hash-bound gate 2", async () => {
    const { res, data } = await post("/api/pipeline/gate/confirm", { gateId: "gate-2" });
    assert.strictEqual(res.status, 400, "gate 2 must not confirm without a packageCore");
    assert.match(data.error, /packageCore/);
  });

  it("gate/confirm confirms gate 2 and returns its real SHA-256 bound hash", async () => {
    const packageCore = { files: ["a.ts"], schema: 1 };
    const { res, data } = await post("/api/pipeline/gate/confirm", { gateId: "gate-2", packageCore });
    assert.strictEqual(res.status, 200);
    // Routing proof: asking for gate-2 must confirm gate 2, never gate 1.
    assert.strictEqual(data.gateId, "gate_2_build_ready");
    assert.strictEqual(data.name, "Gate 2: Build Ready");
    assert.strictEqual(data.status, "CONFIRMED");
    assert.ok(data.packageHash, "gate 2 confirmation must carry a package hash");
    assert.match(data.packageHash, /^sha256:[0-9a-f]{64}$/);
  });

  it("pipeline/stages derives research status from real engine state, not a literal", async () => {
    const res = await fetch(`${baseUrl}/api/pipeline/stages`);
    assert.strictEqual(res.status, 200);
    const data = await res.json() as any;
    assert.strictEqual(typeof data.currentStage, "string", "currentStage must be reported");

    const research = data.stages.find((s: any) => s.id === "research");
    assert.ok(research, "research stage must be present");

    // The engine starts at "research", so research must be "active" — never
    // hardcoded "completed".
    assert.strictEqual(research.status, "active", "research must reflect the live engine stage");

    // Stages the engine has not reached must never be reported as done.
    const build = data.stages.find((s: any) => s.id === "build");
    assert.strictEqual(build.status, "waiting", "unreached stages must not be 'completed'");
  });

  it("workflow_transition requires an explicit targetStage", async () => {
    const { res, data } = await post("/api/tools/execute", { toolName: "workflow_transition", input: {} });
    assert.strictEqual(res.status, 400, "must not silently default the target stage");
    assert.match(data.error, /targetStage/);
  });

  it("workflow_transition rejects an invalid targetStage", async () => {
    const { res, data } = await post("/api/tools/execute", {
      toolName: "workflow_transition",
      input: { targetStage: "not-a-stage" },
    });
    assert.strictEqual(res.status, 400);
    assert.match(data.error, /Valid/);
  });

  it("the v2 transitionStage operation also requires an explicit targetStage", async () => {
    const { res, data } = await post("/api/v2/transitionStage", {});
    assert.strictEqual(res.status, 400, "must not silently default the target stage");
    assert.strictEqual(data.ok, false);
    assert.match(data.error, /targetStage/);
  });

  it("refuses to let planning reach the execution lifecycle over HTTP", async () => {
    // Gate 1 is the only handoff this engine grants.
    await post("/api/pipeline/gate/confirm", { gateId: "gate-1" });

    const toPlanning = await post("/api/tools/execute", {
      toolName: "workflow_transition",
      input: { targetStage: "planning" },
    });
    assert.strictEqual(toPlanning.res.status, 200, "planning must remain reachable after Gate 1");
    assert.strictEqual(toPlanning.data.success, true);
    assert.strictEqual(toPlanning.data.result.toStage, "planning");

    // Execution stages are refused, and the refusal must be reported honestly —
    // not as a successful tool call.
    for (const executionStage of ["gap_analysis", "evaluation", "builder"]) {
      const blocked = await post("/api/tools/execute", {
        toolName: "workflow_transition",
        input: { targetStage: executionStage },
      });
      assert.strictEqual(blocked.res.status, 409, `${executionStage} must be refused`);
      assert.strictEqual(blocked.data.success, false, "a refused transition must not report success");
      assert.match(blocked.data.error, /implementation runtime/i);
    }
  });

  it("the removed /api/pipeline/plan is gone rather than returning a fake payload", async () => {
    const res = await fetch(`${baseUrl}/api/pipeline/plan`);
    assert.strictEqual(res.status, 404, "removed endpoint must 404, not return null");
  });
});
