import type { Candidate } from "./router.js";
import type { RejectedCandidate } from "../core/types.js";
import { isCloudLocality } from "../core/types.js";
import type { RoutingPolicy } from "../core/policy.js";

/**
 * Privacy filter (M7): the security gate. Rejects CLOUD endpoints based on
 * locality policy. Local endpoints (loopback/container-host/private-network)
 * always pass privacy (they are local; credential trust is a separate M11
 * decision). No model chooses its own route — this filter decides on locality.
 *
 * - `privacyFirst`: cloud is NEVER allowed.
 * - `preferLocal` without `allowCloudFallback`: cloud is rejected.
 * - otherwise (cloud fallback enabled, or not preferring local): cloud kept.
 */
export function privacyFilter(
  candidates: readonly Candidate[],
  policy: RoutingPolicy,
): { kept: Candidate[]; rejected: RejectedCandidate[] } {
  const kept: Candidate[] = [];
  const rejected: RejectedCandidate[] = [];
  for (const c of candidates) {
    if (isCloudLocality(c.endpoint.locality)) {
      if (policy.privacyFirst) {
        rejected.push({
          providerId: c.provider.providerId,
          endpointId: c.endpoint.endpointId,
          modelId: c.model.modelId,
          stage: "privacy",
          reason: "privacyFirst rejects cloud endpoint",
        });
        continue;
      }
      if (policy.preferLocal && !policy.allowCloudFallback) {
        rejected.push({
          providerId: c.provider.providerId,
          endpointId: c.endpoint.endpointId,
          modelId: c.model.modelId,
          stage: "privacy",
          reason:
            "cloud endpoint rejected (preferLocal, cloud fallback disabled)",
        });
        continue;
      }
    }
    kept.push(c);
  }
  return { kept, rejected };
}
