import test from "node:test";
import assert from "node:assert/strict";
import { scoreCandidate } from "../../integration/routing/scorer.js";
import { createRouter } from "../../integration/routing/router.js";
import { ollamaPreset } from "../../integration/provider/presets/ollama.js";
import { openaiPreset } from "../../integration/provider/presets/openai.js";
import { DEFAULT_ROUTING_POLICY } from "../../integration/core/policy.js";
import {
  declaredEv,
  ep,
  makeDeps,
  makeRequest,
  mdl,
  rt,
  verifiedEv,
} from "./router-harness.js";

function mkCandidate(over: {
  locality?: import("../../integration/core/types.js").EndpointLocality;
  evidence?: import("../../integration/core/capability.js").CapabilityEvidence[];
  transport?: import("../../integration/core/types.js").ModelTransport;
}) {
  const provider = over.transport === "native" ? { ...ollamaPreset, transport: "native" as const } : ollamaPreset;
  return {
    provider,
    endpoint: ep("ollama", "ep1", over.locality ?? "loopback"),
    model: mdl("ollama", "ep1", "m1"),
    transport: over.transport ?? ollamaPreset.transport,
    capabilities: over.evidence ?? [
      verifiedEv("tool-use"),
      verifiedEv("structured-output"),
    ],
  };
}

test("scoring: preferLocal ranks loopback above cloud", () => {
  const loopback = mkCandidate({ locality: "loopback" });
  const cloud = mkCandidate({ locality: "cloud" });
  const req = makeRequest();
  assert.ok(
    scoreCandidate(loopback as any, req) > scoreCandidate(cloud as any, req),
  );
});

test("scoring: verified capabilities score higher than declared", () => {
  const verified = mkCandidate({
    evidence: [verifiedEv("tool-use"), verifiedEv("structured-output")],
  });
  const declared = mkCandidate({
    evidence: [declaredEv("tool-use"), declaredEv("structured-output")],
  });
  const req = makeRequest();
  assert.ok(
    scoreCandidate(verified as any, req) > scoreCandidate(declared as any, req),
  );
});

test("scoring: a preferred transport adds a bonus", () => {
  const preferred = mkCandidate({ transport: "openai-chat" });
  const other = mkCandidate({ transport: "native" });
  const req = makeRequest({ preferredTransports: ["openai-chat"] });
  assert.ok(
    scoreCandidate(preferred as any, req) > scoreCandidate(other as any, req),
  );
});

test("scoring: deterministic — same inputs always yield the same score", () => {
  const c = mkCandidate({ locality: "loopback" });
  const req = makeRequest();
  assert.equal(scoreCandidate(c as any, req), scoreCandidate(c as any, req));
});

test("scoring via router: the highest-scoring candidate wins", () => {
  const deps = makeDeps({
    providers: [ollamaPreset, openaiPreset],
    endpoints: [ep("ollama", "ep-o", "loopback"), ep("openai", "ep-c", "cloud")],
    models: [mdl("ollama", "ep-o", "m1"), mdl("openai", "ep-c", "m2")],
    evidence: [
      { endpointId: "ep-o", modelId: "m1", ev: verifiedEv("tool-use") },
      { endpointId: "ep-o", modelId: "m1", ev: verifiedEv("structured-output") },
      { endpointId: "ep-c", modelId: "m2", ev: verifiedEv("tool-use") },
      { endpointId: "ep-c", modelId: "m2", ev: verifiedEv("structured-output") },
    ],
    runtimes: [rt("strands", ["openai-chat"])],
  });
  // Allow cloud so both survive privacy; preferLocal then scores loopback highest.
  const res = createRouter(deps).route(
    makeRequest({
      policy: { ...DEFAULT_ROUTING_POLICY, allowCloudFallback: true },
    }),
  );
  assert.ok(res.route);
  assert.equal(res.route!.providerId, "ollama");
  assert.equal(res.route!.locality, "loopback");
});
