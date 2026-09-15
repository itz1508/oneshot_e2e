import test from "node:test";
import assert from "node:assert/strict";
import { FakeRuntime, buildFakeRoute } from "../../integration/runtime/fake-runtime.js";

test("FakeRuntime consumes the ResolvedExecutionRoute and echoes route identity in the result", async () => {
  const rt = new FakeRuntime();
  const route = buildFakeRoute("route-id-123");
  const result = await rt.invoke({ route, promptText: "anything" });
  assert.equal(result.routeId, route.routeId);
  assert.equal(result.workflowId, route.workflowId);
  assert.equal(result.routeId, "fake-route:route-id-123");
});

test("buildFakeRoute produces a non-secret route with the fake runtime id and verified capabilities", () => {
  const route = buildFakeRoute("r");
  assert.equal(route.runtimeId, "fake");
  assert.equal(route.workflowId, "researcher");
  assert.equal(route.locality, "unknown");
  assert.equal(Object.hasOwn(route, "apiKey"), false);
  assert.equal(route.capabilities.length, 2);
  assert.ok(route.capabilities.every((c) => c.state === "verified"));
  assert.ok(route.rejectedCandidates.length === 0);
});

test("FakeRuntime does not override route identity (runtime is downstream of routing)", async () => {
  const rt = new FakeRuntime();
  const route = buildFakeRoute("r-x");
  const result = await rt.invoke({ route, promptText: "p" });
  assert.equal(result.routeId, route.routeId);
  assert.equal(result.workflowId, route.workflowId);
  assert.equal(result.routeId, "fake-route:r-x");
});

test("buildFakeRoute route is non-deterministic only in timestamps; identity is stable", () => {
  const a = buildFakeRoute("stable");
  const b = buildFakeRoute("stable");
  assert.equal(a.routeId, b.routeId);
  assert.equal(a.runtimeId, b.runtimeId);
  assert.equal(a.providerId, b.providerId);
});
