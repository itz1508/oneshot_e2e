import type { CapabilityEvidence } from "../core/capability.js";
import type { ResearchMode, RoutingPolicy } from "../core/policy.js";
import type { ResolvedExecutionRoute } from "../core/route.js";
import type {
  EndpointDefinition,
  ModelCandidate,
  ModelTransport,
  ProviderDefinition,
  RejectedCandidate,
} from "../core/types.js";
import type { ProviderRegistry } from "../provider/registry.js";
import type { EndpointRegistry } from "../endpoint/registry.js";
import type { ModelRegistry } from "../model/registry.js";
import type { CapabilityRegistry } from "../capability/registry.js";
import type { RuntimeDefinition, RuntimeRegistry } from "../runtime/registry.js";
import type { RuntimeCompatibilityResolver } from "./runtime-compatibility.js";
import { eligibilityFilter } from "./eligibility-filter.js";
import { policyFilter } from "./policy-filter.js";
import { capabilityFilter } from "./capability-filter.js";
import { privacyFilter } from "./privacy-filter.js";
import { scoreCandidate } from "./scorer.js";
import { tieBreaker } from "./tie-breaker.js";

/**
 * A routing candidate (M7 internal). A (provider, endpoint, model) triple
 * with the model's transport and capability evidence. `runtime` is attached
 * by the capability filter; `score` by the scorer.
 */
export interface Candidate {
  readonly provider: ProviderDefinition;
  readonly endpoint: EndpointDefinition;
  readonly model: ModelCandidate;
  readonly transport: ModelTransport;
  readonly capabilities: readonly CapabilityEvidence[];
  readonly runtime?: RuntimeDefinition;
  readonly score?: number;
}

export interface RouterDeps {
  readonly providers: ProviderRegistry;
  readonly endpoints: EndpointRegistry;
  readonly models: ModelRegistry;
  readonly capabilities: CapabilityRegistry;
  readonly runtimes: RuntimeRegistry;
  readonly compatibility: RuntimeCompatibilityResolver;
}

/** What the router is asked to resolve. `required`/`preferredTransports` come from ExecutionRequirements (M3). */
export interface RouteRequest {
  readonly workflowId: string;
  readonly runId: string;
  readonly policy: RoutingPolicy;
  readonly required: readonly import("../core/capability.js").ModelCapability[];
  readonly preferredTransports: readonly ModelTransport[];
  readonly researchMode: ResearchMode;
}

export interface RouteResult {
  readonly route: ResolvedExecutionRoute | null;
  readonly rejected: readonly RejectedCandidate[];
  /** Number of candidates that passed eligibility (the initial pool). */
  readonly considered: number;
}

export interface Router {
  route(request: RouteRequest): RouteResult;
}

const ROUTE_TTL_MS = 60_000;

function buildRoute(
  winner: Candidate,
  request: RouteRequest,
  rejected: readonly RejectedCandidate[],
): ResolvedExecutionRoute {
  const now = new Date().toISOString();
  return {
    routeId: `route:${request.runId}:${winner.provider.providerId}:${winner.endpoint.endpointId}:${winner.model.modelId}`,
    workflowId: request.workflowId,
    policy: request.policy,
    runtimeId: winner.runtime!.runtimeId,
    providerId: winner.provider.providerId,
    endpointId: winner.endpoint.endpointId,
    baseUrl: winner.endpoint.baseUrl,
    modelId: winner.model.modelId,
    transport: winner.transport,
    locality: winner.endpoint.locality,
    capabilities: winner.capabilities,
    researchMode: request.researchMode,
    routeReason: `score=${winner.score} locality=${winner.endpoint.locality} transport=${winner.transport} runtime=${winner.runtime!.runtimeId}`,
    rejectedCandidates: rejected,
    createdAt: now,
    expiresAt: new Date(Date.now() + ROUTE_TTL_MS).toISOString(),
  };
}

/**
 * Deterministic router (M7). Pipeline: eligibility → policy → capability
 * (runtime selection) → privacy → score → stable tie-break. The same inputs
 * always yield the same route (or the same null + rejections). No model
 * chooses its own route; the privacy filter decides on locality.
 */
export function createRouter(deps: RouterDeps): Router {
  return {
    route: (request) => {
      const allRejected: RejectedCandidate[] = [];

      const eligible = eligibilityFilter(deps);
      allRejected.push(...eligible.rejected);
      const considered = eligible.kept.length;

      const afterPolicy = policyFilter(eligible.kept, request);
      allRejected.push(...afterPolicy.rejected);

      const afterCapability = capabilityFilter(afterPolicy.kept, request, deps);
      allRejected.push(...afterCapability.rejected);

      const afterPrivacy = privacyFilter(afterCapability.kept, request.policy);
      allRejected.push(...afterPrivacy.rejected);

      const scored = afterPrivacy.kept.map((c) => ({
        ...c,
        score: scoreCandidate(c, request),
      }));
      scored.sort(tieBreaker);

      const winner = scored[0];
      if (!winner) {
        return { route: null, rejected: allRejected, considered };
      }
      return {
        route: buildRoute(winner, request, allRejected),
        rejected: allRejected,
        considered,
      };
    },
  };
}
