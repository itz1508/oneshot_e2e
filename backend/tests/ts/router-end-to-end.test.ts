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

// A realistic two-provider setup: local Ollama (loopback) + cloud OpenAI.
function twoWorldDeps() {
  return makeDeps({
    providers: [ollamaPreset, openaiPreset],
    endpoints: [ep("ollama", "ep-o", "loopback"), ep("openai", "ep-c", "cloud")],
    models: [mdl("ollama", "ep-o", "llama"), mdl("openai", "ep-c", "gpt")],
    evidence: [
      ...bothVerified("ep-o", "llama"),
      ...bothVerified("ep-c", "gpt"),
    ],
    runtimes: [rt("strands", ["openai-chat"])],
  });
}

test("end-to-end: default policy routes to local Ollama and rejects cloud OpenAI at privacy", () => {
  const res = createRouter(twoWorldDeps()).route(makeRequest());
  assert.ok(res.route);
  assert.equal(res.route!.providerId, "ollama");
  assert.equal(res.route!.locality, "loopback");
  assert.equal(res.route!.runtimeId, "strands");
  assert.equal(res.route!.modelId, "llama");
  assert.ok(
    res.rejected.some(
      (r) => r.stage === "privacy" && r.providerId === "openai",
    ),
    "cloud OpenAI must be rejected at the privacy stage under the default policy",
  );
  // The route snapshot carries the rejected candidates for explainability.
  assert.ok(
    res.route!.rejectedCandidates.some((r) => r.stage === "privacy"),
  );
});

test("end-to-end: allowing cloud fallback keeps cloud; the winner is still deterministic", () => {
  const res = createRouter(twoWorldDeps()).route(
    makeRequest({
      policy: { ...DEFAULT_ROUTING_POLICY, allowCloudFallback: true },
    }),
  );
  assert.ok(res.route);
  // Both survive privacy; preferLocal scores the loopback endpoint highest.
  assert.equal(res.route!.providerId, "ollama");
  assert.equal(
    res.rejected.some((r) => r.stage === "privacy"),
    false,
  );
});

test("end-to-end: empty registries yield a null route with no rejections", () => {
  const deps = makeDeps({ runtimes: [rt("strands", ["openai-chat"])] });
  const res = createRouter(deps).route(makeRequest());
  assert.equal(res.route, null);
  assert.equal(res.rejected.length, 0);
  assert.equal(res.considered, 0);
});

test("end-to-end: the route is reproducible — same inputs, same routeId", () => {
  const deps = twoWorldDeps();
  const a = createRouter(deps).route(makeRequest());
  const b = createRouter(deps).route(makeRequest());
  assert.ok(a.route && b.route);
  assert.equal(a.route!.routeId, b.route!.routeId);
  assert.equal(a.route!.providerId, b.route!.providerId);
  assert.equal(a.route!.modelId, b.route!.modelId);
});
