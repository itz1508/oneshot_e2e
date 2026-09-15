import type { Candidate } from "./router.js";
import type { EndpointLocality } from "../core/types.js";

/**
 * Stable tie-breaker (M7). Sort comparator (returns negative when `a` ranks
 * before `b`): higher score first; then locality rank (more-local first);
 * then lexicographic by (providerId, endpointId, modelId, runtimeId). The
 * result is fully deterministic — the same candidate set always yields the
 * same winner.
 */
function localityRank(locality: EndpointLocality): number {
  switch (locality) {
    case "loopback":
      return 0;
    case "container-host":
      return 1;
    case "private-network":
      return 2;
    case "cloud":
      return 4;
    default:
      return 3;
  }
}

function tieKey(c: Candidate): string {
  return [
    c.provider.providerId,
    c.endpoint.endpointId,
    c.model.modelId,
    c.runtime?.runtimeId ?? "",
  ].join("|");
}

export function tieBreaker(a: Candidate, b: Candidate): number {
  const sa = a.score ?? 0;
  const sb = b.score ?? 0;
  if (sa !== sb) return sb - sa;
  const la = localityRank(a.endpoint.locality);
  const lb = localityRank(b.endpoint.locality);
  if (la !== lb) return la - lb;
  const ka = tieKey(a);
  const kb = tieKey(b);
  if (ka < kb) return -1;
  if (ka > kb) return 1;
  return 0;
}
