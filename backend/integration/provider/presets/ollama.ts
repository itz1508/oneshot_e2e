import type { ProviderDefinition } from "../../core/types.js";

/**
 * Ollama preset: a local, credential-free model server spoken to via its
 * OpenAI-compatible chat endpoint. Operational descriptor only (Gap 12: not
 * added to the canonical contract registry).
 */
export const ollamaPreset: ProviderDefinition = {
  providerId: "ollama",
  displayName: "Ollama",
  kind: "preset",
  transport: "openai-chat",
  authMethod: "none",
  requiresAuth: false,
  allowedHeaders: [],
};
