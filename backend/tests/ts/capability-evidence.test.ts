import test from "node:test";
import assert from "node:assert/strict";
import {
  isCapabilityTerminal,
  isCapabilityUsable,
  unknownCapability,
  type CapabilityEvidence,
} from "../../integration/core/capability.js";

function mk(
  state: CapabilityEvidence["state"],
  source: CapabilityEvidence["source"] = "probe",
): CapabilityEvidence {
  return { capability: "tool-use", state, source };
}

test("isCapabilityUsable is true only for declared and verified", () => {
  assert.equal(isCapabilityUsable(mk("declared")), true);
  assert.equal(isCapabilityUsable(mk("verified")), true);
  assert.equal(isCapabilityUsable(mk("unknown")), false);
  assert.equal(isCapabilityUsable(mk("failed")), false);
  assert.equal(isCapabilityUsable(mk("unsupported")), false);
});

test("isCapabilityTerminal is true for verified, failed, unsupported", () => {
  assert.equal(isCapabilityTerminal(mk("verified")), true);
  assert.equal(isCapabilityTerminal(mk("failed")), true);
  assert.equal(isCapabilityTerminal(mk("unsupported")), true);
  assert.equal(isCapabilityTerminal(mk("declared")), false);
  assert.equal(isCapabilityTerminal(mk("unknown")), false);
});

test("unknownCapability builds initial unknown evidence with inferred source", () => {
  const e = unknownCapability("structured-output");
  assert.equal(e.capability, "structured-output");
  assert.equal(e.state, "unknown");
  assert.equal(e.source, "inferred");
  assert.equal(isCapabilityUsable(e), false);
  assert.equal(isCapabilityTerminal(e), false);
});

test("CapabilityEvidence carries provenance, expiry, and failure reason", () => {
  const failed: CapabilityEvidence = {
    capability: "structured-output",
    state: "failed",
    source: "probe",
    checkedAt: "2026-09-14T00:00:00.000Z",
    expiresAt: "2026-09-14T01:00:00.000Z",
    failureReason: "model returned malformed JSON",
  };
  assert.equal(failed.state, "failed");
  assert.equal(failed.failureReason, "model returned malformed JSON");
  assert.equal(isCapabilityUsable(failed), false);
  assert.equal(isCapabilityTerminal(failed), true);
});

test("all five capability states are representable", () => {
  const states: CapabilityEvidence["state"][] = [
    "unknown",
    "declared",
    "verified",
    "failed",
    "unsupported",
  ];
  const evidence = states.map((s) => mk(s));
  assert.deepEqual(
    evidence.map((e) => e.state),
    states,
  );
});
