import test from "node:test";
import assert from "node:assert/strict";
import { createRouter } from "../../integration/routing/router.js";
import { ollamaPreset } from "../../integration/provider/presets/ollama.js";
import { DEFAULT_ROUTING_POLICY } from "../../integration/core/policy.js";
import {
  ep,
  failedEv,
  makeDeps,
  makeRequest,
  mdl,
  rt,
  verifiedEv,
} from "./router-harness.js";

function bothVerified(epId: string, modelId: string) {
  return [
    { endpointId: epId, modelId, ev: verifiedEv("tool-use") },
    { endpointId: epId, modelId, ev: verifiedEv("structured-output") },
  ];
}

test("capability: candidate with verified caps + compatible runtime is kept", () => {
  const deps = makeDeps({
    providers: [ollamaPreset],
    endpoints: [ep("ollama", "ep1", "loopback")],
    models: [mdl("ollama", "ep1", "m1")],
    evidence: bothVerified("ep1", "m1"),
    runtimes: [rt("strands", ["openai-chat"])],
  });
  const res = createRouter(deps).route(makeRequest());
  assert.ok(res.route);
  assert.equal(res.route!.runtimeId, "strands");
});

test("capability: a required capability in 'failed' state is rejected", () => {
  const deps = makeDeps({
    providers: [ollamaPreset],
    endpoints: [ep("ollama", "ep1", "loopback")],
    models: [mdl("ollama", "ep1", "m1")],
    evidence: [
      { endpointId: "ep1", modelId: "m1", ev: failedEv("tool-use") },
      { endpointId: "ep1", modelId: "m1", ev: verifiedEv("structured-output") },
    ],
    runtimes: [rt("strands", ["openai-chat"])],
  });
  const res = createRouter(deps).route(makeRequest());
  assert.equal(res.route, null);
  assert.ok(
    res.rejected.some((r) => r.stage === "capability"),
  );
});

test("capability: no runtime supporting the transport is rejected", () => {
  const deps = makeDeps({
    providers: [ollamaPreset],
    endpoints: [ep("ollama", "ep1", "loopback")],
    models: [mdl("ollama", "ep1", "m1")],
    evidence: bothVerified("ep1", "m1"),
    runtimes: [rt("native-only", ["native"])], // does not support openai-chat
  });
  const res = createRouter(deps).route(makeRequest());
  assert.equal(res.route, null);
  assert.ok(
    res.rejected.some(
      (r) => r.stage === "capability" && r.reason.includes("openai-chat"),
    ),
  );
});

test("capability: allowedRuntimeIds restricts which runtimes are considered", () => {
  const deps = makeDeps({
    providers: [ollamaPreset],
    endpoints: [ep("ollama", "ep1", "loopback")],
    models: [mdl("ollama", "ep1", "m1")],
    evidence: bothVerified("ep1", "m1"),
    runtimes: [
      rt("strands", ["openai-chat"]),
      rt("native-only", ["native"]),
    ],
  });
  const res = createRouter(deps).route(
    makeRequest({
      policy: { ...DEFAULT_ROUTING_POLICY, allowedRuntimeIds: ["native-only"] },
    }),
  );
  assert.equal(res.route, null);
  assert.ok(res.rejected.some((r) => r.stage === "capability"));
});
