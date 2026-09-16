/**
 * OneShot routing policy. Drives the deterministic router (M7). The policy
 * never travels into a model; it is consumed by the router only.
 */

export type RoutingMode = "manual" | "automatic";

export type ResearchMode = "disabled" | "local-only" | "external" | "hybrid";

export interface RoutingPolicy {
  readonly mode: RoutingMode;
  readonly preferLocal: boolean;
  readonly privacyFirst: boolean;
  readonly allowFallback: boolean;
  readonly allowCloudFallback: boolean;
  readonly researchMode: ResearchMode;
  /** When set, only these provider ids are eligible. */
  readonly allowedProviderIds?: readonly string[];
  /** When set, only these runtime ids are eligible. */
  readonly allowedRuntimeIds?: readonly string[];
}

/**
 * M16: Ollama-local routing policy. Ollama is treated as a local-only provider
 * by default, with no cloud fallback and local preference enabled.
 */
export const OLLAMA_LOCAL_POLICY: RoutingPolicy = {
  mode: "automatic",
  preferLocal: true,
  privacyFirst: true,
  allowFallback: false,
  allowCloudFallback: false,
  researchMode: "disabled",
  allowedProviderIds: ["ollama"],
};

/**
 * A privacy-preserving default for ordinary local runs: automatic, prefer
 * local, no cloud fallback, research disabled.
 */
export const DEFAULT_ROUTING_POLICY: RoutingPolicy = {
  mode: "automatic",
  preferLocal: true,
  privacyFirst: false,
  allowFallback: true,
  allowCloudFallback: false,
  researchMode: "disabled",
};
