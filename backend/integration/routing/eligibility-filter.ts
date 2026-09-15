import type { Candidate, RouterDeps } from "./router.js";
import type { RejectedCandidate } from "../core/types.js";

/**
 * Eligibility filter (M7): build candidates from the registries and drop
 * structurally-invalid ones. A candidate is a (provider, endpoint, model)
 * triple. Rejects when the provider is unknown or the endpoint is recorded as
 * unreachable. Does NOT apply policy (allowlists) or capability/privacy rules.
 */
export function eligibilityFilter(deps: RouterDeps): {
  kept: Candidate[];
  rejected: RejectedCandidate[];
} {
  const kept: Candidate[] = [];
  const rejected: RejectedCandidate[] = [];
  for (const endpoint of deps.endpoints.list()) {
    const provider = deps.providers.get(endpoint.providerId);
    if (!provider) {
      rejected.push({
        providerId: endpoint.providerId,
        endpointId: endpoint.endpointId,
        stage: "eligibility",
        reason: `unknown provider '${endpoint.providerId}'`,
      });
      continue;
    }
    const health = deps.endpoints.getHealth(endpoint.endpointId);
    if (health && health.reachable === false) {
      rejected.push({
        providerId: endpoint.providerId,
        endpointId: endpoint.endpointId,
        stage: "eligibility",
        reason: `endpoint unreachable${health.probeError ? `: ${health.probeError}` : ""}`,
      });
      continue;
    }
    for (const model of deps.models.listForEndpoint(endpoint.endpointId)) {
      const capabilities = deps.capabilities.listForModel(
        endpoint.endpointId,
        model.modelId,
      );
      kept.push({
        provider,
        endpoint,
        model,
        transport: provider.transport,
        capabilities,
      });
    }
  }
  return { kept, rejected };
}

