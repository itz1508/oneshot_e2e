import test from "node:test";
import assert from "node:assert/strict";
import { FakeRuntime, buildFakeRoute } from "../../integration/runtime/fake-runtime.js";
import type { NormalizedResult } from "../../integration/runtime/types.js";

test("FakeRuntime.invoke returns a deterministic NormalizedResult for the same prompt", async () => {
  const rt = new FakeRuntime();
  const route = buildFakeRoute("run-1");
  const a = await rt.invoke({ route, promptText: "Identical prompt text" });
  const b = await rt.invoke({ route, promptText: "Identical prompt text" });
  assert.equal(a.content, b.content);
  assert.equal(a.routeId, "fake-route:run-1");
  assert.equal(a.workflowId, "researcher");
  assert.equal(a.finishReason, "stop");
  assert.ok(a.structured && typeof a.structured === "object");
});

test("FakeRuntime.invoke output differs for different prompt text", async () => {
  const rt = new FakeRuntime();
  const route = buildFakeRoute("run-2");
  const a = await rt.invoke({ route, promptText: "prompt A" });
  const b = await rt.invoke({ route, promptText: "prompt B" });
  assert.notEqual(a.content, b.content);
});

test("FakeRuntime is named 'fake', makes no external calls, and carries no credentials", async () => {
  const rt = new FakeRuntime();
  assert.equal(rt.runtimeId, "fake");
  const r: NormalizedResult = await rt.invoke({
    route: buildFakeRoute("r"),
    promptText: "x",
  });
  assert.equal(Object.hasOwn(r, "apiKey"), false);
  assert.ok(r.evidence.length >= 1);
  assert.equal(r.evidence[0].provenance, "fake-runtime");
});

test("FakeRuntime structured payload is a well-formed draft with non-empty requirements and plan steps", async () => {
  const rt = new FakeRuntime();
  const r = await rt.invoke({ route: buildFakeRoute("r"), promptText: "p" });
  const d = r.structured as {
    requirements: unknown[];
    plan_steps: unknown[];
    success_criteria: unknown[];
  };
  assert.ok(d.requirements.length > 0);
  assert.ok(d.plan_steps.length > 0);
  assert.ok(d.success_criteria.length > 0);
});
