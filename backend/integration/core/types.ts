/**
 * Operational domain types for the provider-neutral integration layer.
 *
 * These types describe WHAT the execution layer can be, not HOW it is wired.
 * They contain no credentials and no vendor SDK types. OneShot remains
 * authoritative for validation, persistence, and transitions; these types are
 * subordinate operational descriptors consumed by the router (M7) and runtime
 * adapters (M9+).
 *
 * M1 scope: types only. No existing workflow or runtime code is changed.
 */

/** How an endpoint came to be known. */
export type EndpointOrigin = "preset" | "user" | "discovery";

/**
 * Network locality of an endpoint. Locality belongs to endpoints, NOT
 * providers. `private-network` is local but NOT trusted automatically.
 */
export type EndpointLocality =
  | "loopback"
  | "container-host"
  | "private-network"
  | "cloud"
  | "unknown";

/** Transport used to invoke a model on an endpoint. */
export type ModelTransport =
  | "openai-chat"
  | "openai-responses"
  | "native"
  | "custom";

/** Authentication method an endpoint expects. */
export type AuthMethod = "none" | "api-key" | "bearer" | "header" | "custom";

/** Stage at which a candidate was rejected during deterministic routing. */
export type RoutingRejectionStage =
  | "eligibility"
  | "policy"
  | "capability"
  | "privacy"
  | "ranking";

/**
 * Stable, source-controlled provider definition. No credentials, no live
 * state. Custom providers are user-supplied instances of the same shape.
 */
export interface ProviderDefinition {
  readonly providerId: string;
  readonly displayName: string;
  /** "preset" for built-ins, "custom" for user-defined providers. */
  readonly kind: "preset" | "custom";
  /** Default transport this provider speaks when neutral. */
  readonly transport: ModelTransport;
  /** Auth the provider expects by default. */
  readonly authMethod: AuthMethod;
  /** True when the provider runs without credentials (e.g. local Ollama). */
  readonly requiresAuth: boolean;
  /**
   * Header names a user may attach to this provider's endpoints. The header
   * allowlist (M11) rejects dangerous names regardless of this list.
   */
  readonly allowedHeaders: readonly string[];
}

/**
 * Persisted endpoint configuration. Stored separately from mutable health.
 * Contains no credentials; credentials live in CredentialReference (M11).
 */
export interface EndpointDefinition {
  readonly endpointId: string;
  readonly providerId: string;
  readonly baseUrl: string;
  readonly authMethod: AuthMethod;
  readonly locality: EndpointLocality;
  readonly origin: EndpointOrigin;
  /** User-approved custom headers (already filtered by the M11 allowlist). */
  readonly allowedHeaders: readonly string[];
}

/**
 * Mutable, transient reachability/probe results for an endpoint. Not
 * canonical; never persisted as contract state.
 */
export interface EndpointHealth {
  readonly endpointId: string;
  readonly reachable: boolean;
  readonly latencyMs?: number;
  readonly lastProbedAt?: string;
  readonly probeError?: string;
  readonly redirectChain?: readonly string[];
  readonly dnsResolved?: boolean;
}

/**
 * A model exposed by an endpoint. Identity is provider-scoped: two providers
 * may expose the same `modelId` without collision because the resolved route
 * always carries `providerId` and `endpointId`.
 */
export interface ModelCandidate {
  readonly modelId: string;
  readonly providerId: string;
  readonly endpointId: string;
  readonly displayName: string;
  /** When false, the model was entered manually and not yet confirmed by discovery. */
  readonly discovered: boolean;
}

/** Why a candidate was rejected during routing. */
export interface RejectedCandidate {
  readonly providerId: string;
  readonly endpointId?: string;
  readonly modelId?: string;
  readonly stage: RoutingRejectionStage;
  readonly reason: string;
}

/**
 * Non-cloud localities. Note: `private-network` is local but NOT trusted
 * automatically; trust is a separate decision made by the privacy filter (M7).
 */
export function isLocalLocality(locality: EndpointLocality): boolean {
  return (
    locality === "loopback" ||
    locality === "container-host" ||
    locality === "private-network"
  );
}

/** Only `cloud` is a cloud locality. `unknown` is neither local nor cloud. */
export function isCloudLocality(locality: EndpointLocality): boolean {
  return locality === "cloud";
}
