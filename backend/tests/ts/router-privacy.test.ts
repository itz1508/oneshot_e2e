import test from "node:test";
import assert from "node:assert/strict";
import { createRouter } from "../../integration/routing/router.js";
import { ollamaPreset } from "../../integration/provider/presets/ollama.js";
import { openaiPreset } from "../../integration/provider/presets/openai.js";
import { DEFAULT_ROUTING_POLICY } from "../../integration/core/policy.js";
import {
  ep,
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

// A cloud candidate that is otherwise fully valid (verified caps + strands).
function cloudDeps() {
  return makeDeps({
    providers: [openaiPreset],
    endpoints: [ep("openai", "ep-c", "cloud")],
    models: [mdl("openai", "ep-c", "gpt")],
    evidence: bothVerified("ep-c", "gpt"),
    runtimes: [rt("strands", ["openai-chat"])],
  });
}

test("privacy: privacyFirst rejects a cloud endpoint", () => {
  const res = createRouter(cloudDeps()).route(
    makeRequest({ policy: { ...DEFAULT_ROUTING_POLICY, privacyFirst: true } }),
  );
  assert.equal(res.route, null);
  assert.ok(
    res.rejected.some(
      (r) => r.stage === "privacy" && r.reason.includes("privacyFirst"),
    ),
  );
});

test("privacy: preferLocal without cloud fallback rejects a cloud endpoint", () => {
  const res = createRouter(cloudDeps()).route(
    makeRequest({
      policy: { ...DEFAULT_ROUTING_POLICY, preferLocal: true, allowCloudFallback: false },
    }),
  );
  assert.equal(res.route, null);
  assert.ok(
    res.rejected.some((r) => r.stage === "privacy"),
  );
});

test("privacy: preferLocal WITH cloud fallback keeps a cloud endpoint", () => {
  const res = createRouter(cloudDeps()).route(
    makeRequest({
      policy: { ...DEFAULT_ROUTING_POLICY, preferLocal: true, allowCloudFallback: true },
    }),
  );
  assert.ok(res.route);
  assert.equal(res.route!.locality, "cloud");
});

test("privacy: not preferring local keeps a cloud endpoint", () => {
  const res = createRouter(cloudDeps()).route(
    makeRequest({
      policy: { ...DEFAULT_ROUTING_POLICY, preferLocal: false, allowCloudFallback: true },
    }),
  );
  assert.ok(res.route);
  assert.equal(res.route!.locality, "cloud");
});

test("privacy: a local endpoint passes under privacyFirst", () => {
  const deps = makeDeps({
    providers: [ollamaPreset],
    endpoints: [ep("ollama", "ep1", "loopback")],
    models: [mdl("ollama", "ep1", "m1")],
    evidence: bothVerified("ep1", "m1"),
    runtimes: [rt("strands", ["openai-chat"])],
  });
  const res = createRouter(deps).route(
    makeRequest({ policy: { ...DEFAULT_ROUTING_POLICY, privacyFirst: true } }),
  );
  assert.ok(res.route);
  assert.equal(res.route!.locality, "loopback");
});
