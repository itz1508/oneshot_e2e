import type { ModelCandidate } from "../core/types.js";

/**
 * In-memory model registry. Identity is provider-scoped (Gap 4): two
 * providers may expose the same `modelId` without collision. `get`/`remove`
 * take `(providerId, modelId)`. No hard-coded catalog (model hints arrive in
 * M17); this registry holds discovered or manually entered candidates only.
 */
export interface ModelRegistry {
  list(): readonly ModelCandidate[];
  listForProvider(providerId: string): readonly ModelCandidate[];
  listForEndpoint(endpointId: string): readonly ModelCandidate[];
  add(model: ModelCandidate): void;
  get(providerId: string, modelId: string): ModelCandidate | undefined;
  remove(providerId: string, modelId: string): void;
}

export function createModelRegistry(): ModelRegistry {
  const models = new Map<string, ModelCandidate>();
  const key = (providerId: string, modelId: string) => `${providerId}::${modelId}`;
  return {
    list: () => [...models.values()],
    listForProvider: (pid) =>
      [...models.values()].filter((m) => m.providerId === pid),
    listForEndpoint: (eid) =>
      [...models.values()].filter((m) => m.endpointId === eid),
    add: (m) => {
      const k = key(m.providerId, m.modelId);
      models.set(k, m);
    },
    get: (pid, mid) => models.get(key(pid, mid)),
    remove: (pid, mid) => {
      models.delete(key(pid, mid));
    },
  };
}
