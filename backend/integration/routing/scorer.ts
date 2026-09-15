import type { Candidate, RouteRequest } from "./router.js";
import type { EndpointLocality } from "../core/types.js";

/**
 * Deterministic scorer (M7). Pure function of (candidate, request) → number
 * (higher is better). Components:
 *  - locality bonus (when preferLocal): loopback > container-host >
 *    private-network > unknown > cloud. Equal when not preferLocal.
 *  - capability verification: +50 per verified required capability, +20 per
 *    declared (usable but unverified).
 *  - transport preference: +30 when the candidate transport is in
 *    preferredTransports.
 *
 * Deterministic: the same inputs always yield the same score.
 */
function localityBonus(locality: EndpointLocality): number {
  switch (locality) {
    case "loopback":
      return 1000;
    case "container-host":
      return 800;
    case "private-network":
      return 600;
    case "cloud":
      return 0;
    default:
      return 100;
  }
}

export function scoreCandidate(c: Candidate, request: RouteRequest): number {
  let score = 0;
  score += request.policy.preferLocal
    ? localityBonus(c.endpoint.locality)
    : 100;
  for (const cap of request.required) {
    const ev = c.capabilities.find((e) => e.capability === cap);
    if (ev?.state === "verified") score += 50;
    else if (ev?.state === "declared") score += 20;
  }
  if (request.preferredTransports.includes(c.transport)) score += 30;
  return score;
}
