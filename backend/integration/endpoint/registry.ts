import type { EndpointDefinition, EndpointHealth } from "../core/types.js";

/**
 * In-memory endpoint registry. `EndpointDefinition` (configuration) is stored
 * separately from `EndpointHealth` (mutable, transient probe results). Health
 * is never persisted as canonical state (Gap 13: no file-backed override).
 */
export interface EndpointRegistry {
  list(): readonly EndpointDefinition[];
  get(endpointId: string): EndpointDefinition | undefined;
  add(endpoint: EndpointDefinition): void;
  remove(endpointId: string): void;
  setHealth(endpointId: string, health: EndpointHealth): void;
  getHealth(endpointId: string): EndpointHealth | undefined;
}

export function createEndpointRegistry(): EndpointRegistry {
  const defs = new Map<string, EndpointDefinition>();
  const health = new Map<string, EndpointHealth>();
  return {
    list: () => [...defs.values()],
    get: (id) => defs.get(id),
    add: (ep) => {
      if (defs.has(ep.endpointId)) {
        throw new Error(`endpoint already registered: ${ep.endpointId}`);
      }
      defs.set(ep.endpointId, ep);
    },
    remove: (id) => {
      defs.delete(id);
      health.delete(id);
    },
    setHealth: (id, h) => {
      health.set(id, h);
    },
    getHealth: (id) => health.get(id),
  };
}
