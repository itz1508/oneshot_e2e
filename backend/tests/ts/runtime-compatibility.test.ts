import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeCompatibilityResolver } from "../../integration/routing/runtime-compatibility.js";
import type { RuntimeDefinition } from "../../integration/runtime/registry.js";
import type { ModelTransport } from "../../integration/core/types.js";

function rt(
  id: string,
  transports: readonly ModelTransport[],
): RuntimeDefinition {
  return { runtimeId: id, displayName: id, supportedTransports: transports };
}

test("runtime compatibility: compatible when transport supported and required capabilities verified", () => {
  const r = createRuntimeCompatibilityResolver();
  const res = r.resolve({
    runtime: rt("strands", ["openai-chat"]),
    transport: "openai-chat",
    capabilities: [
      { capability: "tool-use", state: "verified", source: "probe" },
      { capability: "structured-output", state: "verified", source: "probe" },
    ],
    required: ["tool-use", "structured-output"],
  });
  assert.equal(res.compatible, true);
  assert.equal(res.reasons.length, 0);
});

test("runtime compatibility: incompatible when transport is not supported", () => {
  const r = createRuntimeCompatibilityResolver();
  const res = r.resolve({
    runtime: rt("native", ["native"]),
    transport: "openai-chat",
    capabilities: [],
    required: [],
  });
  assert.equal(res.compatible, false);
  assert.ok(res.reasons.some((x) => x.includes("transport")));
});

test("runtime compatibility: incompatible when a required capability is missing", () => {
  const r = createRuntimeCompatibilityResolver();
  const res = r.resolve({
    runtime: rt("strands", ["openai-chat"]),
    transport: "openai-chat",
    capabilities: [],
    required: ["tool-use"],
  });
  assert.equal(res.compatible, false);
  assert.ok(res.reasons.some((x) => x.includes("missing")));
});

test("runtime compatibility: incompatible when required capability is failed/unknown/unsupported", () => {
  const r = createRuntimeCompatibilityResolver();
  for (const state of ["failed", "unknown", "unsupported"] as const) {
    const res = r.resolve({
      runtime: rt("strands", ["openai-chat"]),
      transport: "openai-chat",
      capabilities: [{ capability: "tool-use", state, source: "probe" }],
      required: ["tool-use"],
    });
    assert.equal(res.compatible, false, `state ${state} should be incompatible`);
    assert.ok(
      res.reasons.some((x) => x.includes("tool-use")),
      `state ${state} should report a tool-use reason`,
    );
  }
});

test("runtime compatibility: declared evidence is usable (not only verified)", () => {
  const r = createRuntimeCompatibilityResolver();
  const res = r.resolve({
    runtime: rt("strands", ["openai-chat"]),
    transport: "openai-chat",
    capabilities: [
      { capability: "tool-use", state: "declared", source: "provider-preset" },
    ],
    required: ["tool-use"],
  });
  assert.equal(res.compatible, true);
});
