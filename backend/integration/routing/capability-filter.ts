import type { Candidate, RouteRequest, RouterDeps } from "./router.js";
import type { RejectedCandidate } from "../core/types.js";

/**
 * Capability filter (M7): for each candidate, find a runtime (filtered by
 * `allowedRuntimeIds`) that is COMPATIBLE with the model's transport AND has
 * usable evidence for every workflow-required capability (M6 runtime
 * compatibility). The first compatible runtime in registry order is attached.
 * Candidates with no compatible runtime are rejected. No model chooses its
 * own route — the router picks the runtime from evidence + transport.
 */
export function capabilityFilter(
  candidates: readonly Candidate[],
  request: RouteRequest,
  deps: RouterDeps,
): { kept: Candidate[]; rejected: RejectedCandidate[] } {
  const kept: Candidate[] = [];
  const rejected: RejectedCandidate[] = [];
  const allowedRuntimes = request.policy.allowedRuntimeIds;
  const runtimes = deps.runtimes
    .list()
    .filter(
      (r) => !allowedRuntimes || allowedRuntimes.includes(r.runtimeId),
    );
  for (const c of candidates) {
    let chosen = undefined;
    for (const r of runtimes) {
      const res = deps.compatibility.resolve({
        runtime: r,
        transport: c.transport,
        capabilities: c.capabilities,
        required: request.required,
      });
      if (res.compatible) {
        chosen = r;
        break;
      }
    }
    if (!chosen) {
      rejected.push({
        providerId: c.provider.providerId,
        endpointId: c.endpoint.endpointId,
        modelId: c.model.modelId,
        stage: "capability",
        reason: `no runtime compatible with transport '${c.transport}' and required capabilities [${request.required.join(", ")}]`,
      });
      continue;
    }
    kept.push({ ...c, runtime: chosen });
  }
  return { kept, rejected };
}
