import type { Candidate, RouteRequest } from "./router.js";
import type { RejectedCandidate } from "../core/types.js";

/**
 * Policy filter (M7): apply hard policy constraints that are NOT locality or
 * capability based. Currently `allowedProviderIds` (when set, only those
 * providers remain). `allowedRuntimeIds` is applied during runtime selection
 * in the capability filter. `preferredTransports` is a scoring preference
 * (scorer), not a hard reject.
 */
export function policyFilter(
  candidates: readonly Candidate[],
  request: RouteRequest,
): { kept: Candidate[]; rejected: RejectedCandidate[] } {
  const kept: Candidate[] = [];
  const rejected: RejectedCandidate[] = [];
  const allowedProviders = request.policy.allowedProviderIds;
  for (const c of candidates) {
    if (
      allowedProviders &&
      !allowedProviders.includes(c.provider.providerId)
    ) {
      rejected.push({
        providerId: c.provider.providerId,
        endpointId: c.endpoint.endpointId,
        modelId: c.model.modelId,
        stage: "policy",
        reason: `provider '${c.provider.providerId}' not in allowedProviderIds`,
      });
      continue;
    }
    kept.push(c);
  }
  return { kept, rejected };
}
