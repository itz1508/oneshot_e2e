import test from "node:test";
import assert from "node:assert/strict";
import { createRouter } from "../../integration/routing/router.js";
import { ollamaPreset } from "../../integration/provider/presets/ollama.js";
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

test("eligibility: endpoint with an unknown provider is rejected", () => {
  const deps = makeDeps({
    endpoints: [ep("ghost", "ep1", "loopback")],
    models: [mdl("ghost", "ep1", "m1")],
    runtimes: [rt("strands", ["openai-chat"])],
  });
  const res = createRouter(deps).route(makeRequest());
  assert.equal(res.route, null);
  assert.ok(
    res.rejected.some(
      (r) => r.stage === "eligibility" && r.reason.includes("unknown provider"),
    ),
  );
});

test("eligibility: endpoint recorded as unreachable is rejected", () => {
  const deps = makeDeps({
    providers: [ollamaPreset],
    endpoints: [ep("ollama", "ep1", "loopback")],
    models: [mdl("ollama", "ep1", "m1")],
    health: [
      { endpointId: "ep1", reachable: false, probeError: "ECONNREFUSED" },
    ],
    runtimes: [rt("strands", ["openai-chat"])],
  });
  const res = createRouter(deps).route(makeRequest());
  assert.equal(res.route, null);
  assert.ok(
    res.rejected.some(
      (r) => r.stage === "eligibility" && r.reason.includes("unreachable"),
    ),
  );
});

test("eligibility: a valid candidate passes and is routed", () => {
  const deps = makeDeps({
    providers: [ollamaPreset],
    endpoints: [ep("ollama", "ep1", "loopback")],
    models: [mdl("ollama", "ep1", "m1")],
    evidence: bothVerified("ep1", "m1"),
    runtimes: [rt("strands", ["openai-chat"])],
  });
  const res = createRouter(deps).route(makeRequest());
  assert.ok(res.route);
  assert.equal(res.route!.providerId, "ollama");
  assert.equal(res.route!.runtimeId, "strands");
  assert.equal(res.considered, 1);
});

test("eligibility: an endpoint with no models yields no candidates", () => {
  const deps = makeDeps({
    providers: [ollamaPreset],
    endpoints: [ep("ollama", "ep1", "loopback")],
    runtimes: [rt("strands", ["openai-chat"])],
  });
  const res = createRouter(deps).route(makeRequest());
  assert.equal(res.route, null);
  assert.equal(res.considered, 0);
  assert.equal(res.rejected.length, 0);
});
