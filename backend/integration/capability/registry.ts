import type {
  CapabilityEvidence,
  ModelCapability,
} from "../core/capability.js";

/**
 * In-memory capability evidence registry (M6). Stores per
 * (endpointId, modelId, capability) evidence records supporting all five
 * states (unknown/declared/verified/failed/unsupported). Probes (M6) and
 * declared presets write here; the router (M7) reads here. Evidence is
 * metadata only — no credentials.
 */
export interface CapabilityRegistry {
  record(
    endpointId: string,
    modelId: string,
    evidence: CapabilityEvidence,
  ): void;
  get(
    endpointId: string,
    modelId: string,
    capability: ModelCapability,
  ): CapabilityEvidence | undefined;
  listForModel(
    endpointId: string,
    modelId: string,
  ): readonly CapabilityEvidence[];
  listForEndpoint(endpointId: string): readonly CapabilityEvidence[];
  clear(endpointId: string, modelId: string): void;
}

export function createCapabilityRegistry(): CapabilityRegistry {
  const store = new Map<string, CapabilityEvidence>();
  const key = (ep: string, m: string, c: ModelCapability) =>
    `${ep}::${m}::${c}`;
  return {
    record: (ep, m, e) => store.set(key(ep, m, e.capability), e),
    get: (ep, m, c) => store.get(key(ep, m, c)),
    listForModel: (ep, m) =>
      [...store.entries()]
        .filter(([k]) => k.startsWith(`${ep}::${m}::`))
        .map(([, v]) => v),
    listForEndpoint: (ep) =>
      [...store.entries()]
        .filter(([k]) => k.startsWith(`${ep}::`))
        .map(([, v]) => v),
    clear: (ep, m) => {
      for (const k of [...store.keys()]) {
        if (k.startsWith(`${ep}::${m}::`)) store.delete(k);
      }
    },
  };
}
