/**
 * In-memory registry of research providers. Research is a OneShot policy
 * (M12), not a model capability; this registry lists available research
 * adapters (e.g. Tavily) and supports `disable` so `local-only` mode can
 * remove a provider from eligibility without touching model capability
 * evidence.
 */
export interface ResearchProviderDefinition {
  readonly providerId: string;
  readonly displayName: string;
  readonly requiresAuth: boolean;
}

export interface ResearchRegistry {
  list(): readonly ResearchProviderDefinition[];
  get(providerId: string): ResearchProviderDefinition | undefined;
  has(providerId: string): boolean;
  add(provider: ResearchProviderDefinition): void;
  disable(providerId: string): void;
}

export function createResearchRegistry(
  presets: readonly ResearchProviderDefinition[] = [],
): ResearchRegistry {
  const byId = new Map<string, ResearchProviderDefinition>();
  for (const p of presets) byId.set(p.providerId, p);
  return {
    list: () => [...byId.values()],
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    add: (p) => {
      byId.set(p.providerId, p);
    },
    disable: (id) => {
      byId.delete(id);
    },
  };
}
