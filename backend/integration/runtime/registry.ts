import type { ModelTransport } from "../core/types.js";

/**
 * Descriptor for an agent runtime. The executable `AgentRuntime` adapter
 * interface is introduced in M4; M2 registers descriptors only so the router
 * (M7) can reason about which runtimes exist and which transports they drive.
 */
export interface RuntimeDefinition {
  readonly runtimeId: string;
  readonly displayName: string;
  readonly supportedTransports: readonly ModelTransport[];
}

export interface RuntimeRegistry {
  list(): readonly RuntimeDefinition[];
  get(runtimeId: string): RuntimeDefinition | undefined;
  has(runtimeId: string): boolean;
  add(runtime: RuntimeDefinition): void;
}

export function createRuntimeRegistry(): RuntimeRegistry {
  const byId = new Map<string, RuntimeDefinition>();
  return {
    list: () => [...byId.values()],
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    add: (r) => {
      if (byId.has(r.runtimeId)) {
        throw new Error(`runtime already registered: ${r.runtimeId}`);
      }
      byId.set(r.runtimeId, r);
    },
  };
}
