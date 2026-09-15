import type {
  CapabilityEvidence,
  ModelCapability,
} from "../core/capability.js";

/**
 * The target a capability probe runs against (M6). Probes receive an APPROVED
 * endpoint+model from the caller (the router in M7); probes never scan or
 * discover endpoints themselves (security: no arbitrary network scanning).
 * `apiKey` is sent as a Bearer header and discarded — not stored on evidence.
 */
export interface ProbeTarget {
  readonly endpointId: string;
  readonly modelId: string;
  readonly baseUrl: string;
  readonly apiKey?: string;
}

/**
 * A capability probe tests ONE capability against an approved endpoint+model
 * and returns evidence in one of the five states. `verified`/`failed` come
 * from an actual call; `unsupported` is returned when the endpoint rejects the
 * capability shape entirely (e.g. 400 on a tools request).
 */
export interface CapabilityProbe {
  readonly capability: ModelCapability;
  probe(target: ProbeTarget): Promise<CapabilityEvidence>;
}

/** ISO timestamp helper for evidence records. */
export function nowIso(): string {
  return new Date().toISOString();
}
