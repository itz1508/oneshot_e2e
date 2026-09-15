/**
 * Capability evidence for a model+endpoint. No boolean flags: each capability
 * is a state with provenance and optional expiry/failure reason.
 *
 * Model capabilities and research integration capabilities are SEPARATE; this
 * file describes MODEL capabilities only (structured output, tool use,
 * streaming). Research integration is a OneShot policy (M12), not a model
 * capability.
 */

export type CapabilityState =
  | "unknown"
  | "declared"
  | "verified"
  | "failed"
  | "unsupported";

export type CapabilitySource =
  | "provider-preset"
  | "model-discovery"
  | "probe"
  | "manual"
  | "inferred";

export type ModelCapability = "tool-use" | "structured-output" | "streaming";

export interface CapabilityEvidence {
  readonly capability: ModelCapability;
  readonly state: CapabilityState;
  readonly source: CapabilitySource;
  readonly checkedAt?: string;
  readonly expiresAt?: string;
  readonly failureReason?: string;
}

/** True when the state means "known to be usable" (declared or verified). */
export function isCapabilityUsable(e: CapabilityEvidence): boolean {
  return e.state === "declared" || e.state === "verified";
}

/** True when the state is a final, non-retryable outcome for this evidence. */
export function isCapabilityTerminal(e: CapabilityEvidence): boolean {
  return (
    e.state === "verified" ||
    e.state === "failed" ||
    e.state === "unsupported"
  );
}

/** Build evidence at the initial `unknown` state with an `inferred` source. */
export function unknownCapability(
  capability: ModelCapability,
): CapabilityEvidence {
  return { capability, state: "unknown", source: "inferred" };
}
