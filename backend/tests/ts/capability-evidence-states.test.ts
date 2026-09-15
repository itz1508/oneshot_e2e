import test from "node:test";
import assert from "node:assert/strict";
import { createCapabilityRegistry } from "../../integration/capability/registry.js";
import {
  isCapabilityTerminal,
  isCapabilityUsable,
} from "../../integration/core/capability.js";
import type {
  CapabilitySource,
  CapabilityState,
  ModelCapability,
} from "../../integration/core/capability.js";

const STATES: readonly CapabilityState[] = [
  "unknown",
  "declared",
  "verified",
  "failed",
  "unsupported",
];

function ev(state: CapabilityState, source: CapabilitySource = "probe") {
  return {
    capability: "structured-output" as ModelCapability,
    state,
    source,
  };
}

test("CapabilityRegistry records and retrieves all five evidence states", () => {
  const r = createCapabilityRegistry();
  for (const s of STATES) {
    r.record("ep1", "m1", ev(s));
    assert.equal(r.get("ep1", "m1", "structured-output")?.state, s);
  }
});

test("CapabilityRegistry evidence is scoped by endpoint + model + capability", () => {
  const r = createCapabilityRegistry();
  r.record("ep1", "m1", { capability: "tool-use", state: "verified", source: "probe" });
  r.record("ep1", "m2", { capability: "tool-use", state: "failed", source: "probe" });
  r.record("ep2", "m1", { capability: "tool-use", state: "declared", source: "provider-preset" });
  assert.equal(r.get("ep1", "m1", "tool-use")?.state, "verified");
  assert.equal(r.get("ep1", "m2", "tool-use")?.state, "failed");
  assert.equal(r.get("ep2", "m1", "tool-use")?.state, "declared");
  assert.equal(r.get("ep1", "m1", "structured-output"), undefined);
});

test("isCapabilityUsable is true only for declared and verified", () => {
  for (const s of STATES) {
    assert.equal(
      isCapabilityUsable(ev(s)),
      s === "declared" || s === "verified",
    );
  }
});

test("isCapabilityTerminal is true for verified, failed, unsupported", () => {
  for (const s of STATES) {
    assert.equal(
      isCapabilityTerminal(ev(s)),
      s === "verified" || s === "failed" || s === "unsupported",
    );
  }
});

test("CapabilityRegistry listForModel/listForEndpoint/clear", () => {
  const r = createCapabilityRegistry();
  r.record("ep1", "m1", { capability: "tool-use", state: "verified", source: "probe" });
  r.record("ep1", "m1", { capability: "structured-output", state: "verified", source: "probe" });
  r.record("ep1", "m2", { capability: "tool-use", state: "failed", source: "probe" });
  r.record("ep2", "m1", { capability: "tool-use", state: "declared", source: "provider-preset" });
  assert.equal(r.listForModel("ep1", "m1").length, 2);
  assert.equal(r.listForEndpoint("ep1").length, 3);
  r.clear("ep1", "m1");
  assert.equal(r.listForModel("ep1", "m1").length, 0);
  assert.equal(r.listForEndpoint("ep1").length, 1);
});
