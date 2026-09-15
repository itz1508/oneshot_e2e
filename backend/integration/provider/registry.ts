import type { ProviderDefinition } from "../core/types.js";
import { ollamaPreset } from "./presets/ollama.js";
import { groqPreset } from "./presets/groq.js";
import { openaiPreset } from "./presets/openai.js";

/**
 * In-memory registry of neutral `ProviderDefinition`s. Source-controlled
 * presets are loaded by default; custom providers can be added at runtime.
 *
 * No file-backed override (Gap 13): persistence of user configuration is the
 * caller's responsibility (existing persistence + CredentialReference in
 * later milestones). No credentials are stored here.
 */
export interface ProviderRegistry {
  list(): readonly ProviderDefinition[];
  get(providerId: string): ProviderDefinition | undefined;
  has(providerId: string): boolean;
  add(provider: ProviderDefinition): void;
}

export const DEFAULT_PROVIDER_PRESETS: readonly ProviderDefinition[] = [
  ollamaPreset,
  groqPreset,
  openaiPreset,
];

export function createProviderRegistry(
  presets: readonly ProviderDefinition[] = DEFAULT_PROVIDER_PRESETS,
): ProviderRegistry {
  const byId = new Map<string, ProviderDefinition>();
  for (const p of presets) byId.set(p.providerId, p);
  return {
    list: () => [...byId.values()],
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    add: (p) => {
      if (byId.has(p.providerId)) {
        throw new Error(`provider already registered: ${p.providerId}`);
      }
      byId.set(p.providerId, p);
    },
  };
}
