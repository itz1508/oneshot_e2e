import type { ProviderDefinition } from "../../core/types.js";

/** Groq preset: cloud, API-key auth, OpenAI-compatible chat transport. */
export const groqPreset: ProviderDefinition = {
  providerId: "groq",
  displayName: "Groq",
  kind: "preset",
  transport: "openai-chat",
  authMethod: "api-key",
  requiresAuth: true,
  allowedHeaders: [],
};
