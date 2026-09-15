import test from "node:test";
import assert from "node:assert/strict";
import { createRouter } from "../../integration/routing/router.js";
import { ollamaPreset } from "../../integration/provider/presets/ollama.js";
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

// Two equally-valid loopback candidates with identical evidence → identical
// scores → tie must be broken deterministically by lexicographic key.
function twoTiedDeps() {
  return makeDeps({
    providers: [ollamaPreset],
    endpoints: [ep("ollama", "ep-b", "loopback"), ep("ollama", "ep-a", "loopback")],
    models: [mdl("ollama", "ep-b", "z-model"), mdl("ollama", "ep-a", "a-model")],
    evidence: [
      ...bothVerified("ep-b", "z-model"),
      ...bothVerified("ep-a", "a-model"),
    ],
    runtimes: [rt("strands", ["openai-chat"])],
  });
}

test("tie-break: equal scores are broken deterministically by lexicographic key", () => {
  const deps = twoTiedDeps();
  const res = createRouter(deps).route(makeRequest());
  assert.ok(res.route);
  // Lexicographic key: (ollama|ep-a|a-model|strands) < (ollama|ep-b|z-model|strands)
  assert.equal(res.route!.endpointId, "ep-a");
  assert.equal(res.route!.modelId, "a-model");
});

test("tie-break: the same inputs always yield the same winner", () => {
  const deps = twoTiedDeps();
  const r1 = createRouter(deps).route(makeRequest());
  const r2 = createRouter(deps).route(makeRequest());
  assert.ok(r1.route && r2.route);
  assert.equal(r1.route!.routeId, r2.route!.routeId);
  assert.equal(r1.route!.endpointId, r2.route!.endpointId);
});

test("tie-break: a more-local candidate outranks a less-local one", () => {
  const deps = makeDeps({
    providers: [ollamaPreset],
    endpoints: [ep("ollama", "ep-loop", "loopback"), ep("ollama", "ep-net", "private-network")],
    // Distinct model ids: identity is provider-scoped, so the same modelId on
    // two endpoints of the same provider would collide (Gap 4).
    models: [mdl("ollama", "ep-loop", "m-loop"), mdl("ollama", "ep-net", "m-net")],
    evidence: [...bothVerified("ep-loop", "m-loop"), ...bothVerified("ep-net", "m-net")],
    runtimes: [rt("strands", ["openai-chat"])],
  });
  const res = createRouter(deps).route(makeRequest());
  assert.ok(res.route);
  // preferLocal scores loopback (1000) above private-network (600).
  assert.equal(res.route!.endpointId, "ep-loop");
  assert.equal(res.route!.locality, "loopback");
});
