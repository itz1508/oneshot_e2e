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

function twoProviderDeps() {
  return makeDeps({
    providers: [ollamaPreset, openaiPreset],
    endpoints: [ep("ollama", "ep-o", "loopback"), ep("openai", "ep-c", "cloud")],
    models: [mdl("ollama", "ep-o", "m1"), mdl("openai", "ep-c", "m2")],
    evidence: [...bothVerified("ep-o", "m1"), ...bothVerified("ep-c", "m2")],
    runtimes: [rt("strands", ["openai-chat"])],
  });
}

test("policy: allowedProviderIds filters out non-listed providers", () => {
  const deps = twoProviderDeps();
  const res = createRouter(deps).route(
    makeRequest({
      policy: { ...DEFAULT_ROUTING_POLICY, allowedProviderIds: ["ollama"] },
    }),
  );
  assert.ok(res.route);
  assert.equal(res.route!.providerId, "ollama");
  assert.ok(
    res.rejected.some(
      (r) => r.stage === "policy" && r.providerId === "openai",
    ),
  );
});

test("policy: undefined allowedProviderIds keeps all providers", () => {
  const deps = twoProviderDeps();
  const res = createRouter(deps).route(makeRequest());
  // With default policy (preferLocal, no cloud fallback) the cloud one is
  // rejected at privacy, so the winner is the local ollama.
  assert.ok(res.route);
  assert.equal(res.route!.providerId, "ollama");
  assert.equal(
    res.rejected.some((r) => r.stage === "policy"),
    false,
  );
});
