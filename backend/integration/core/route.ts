import { isCapabilityUsable } from "./capability.js";
import type { CapabilityEvidence, ModelCapability } from "./capability.js";
import type { ResearchMode, RoutingPolicy } from "./policy.js";
import type {
  EndpointLocality,
  ModelTransport,
  RejectedCandidate,
} from "./types.js";

/**
 * The accepted, non-secret execution route snapshot. Persisted for run
 * reproducibility (M7 route snapshots). Contains no credentials; the runtime
 * adapter (M9+) receives this route and resolves credentials by reference.
 */
export interface ResolvedExecutionRoute {
  readonly routeId: string;
  readonly workflowId: string;
  readonly policy: RoutingPolicy;
  readonly runtimeId: string;
  readonly providerId: string;
  readonly endpointId: string;
  readonly baseUrl: string;
  readonly modelId: string;
  readonly transport: ModelTransport;
  readonly locality: EndpointLocality;
  readonly capabilities: readonly CapabilityEvidence[];
  readonly researchMode: ResearchMode;
  readonly researchProviderId?: string;
  readonly routeReason: string;
  readonly rejectedCandidates: readonly RejectedCandidate[];
  readonly createdAt: string;
  readonly expiresAt: string;
}

/** The set of model capabilities the route claims are usable (declared/verified). */
export function usableCapabilities(
  route: ResolvedExecutionRoute,
): ModelCapability[] {
  return route.capabilities
    .filter((c) => isCapabilityUsable(c))
    .map((c) => c.capability);
}

