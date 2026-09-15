import type { ProviderDefinition } from "../../core/types.js";

/** OpenAI preset: cloud, API-key auth, OpenAI chat transport. */
export const openaiPreset: ProviderDefinition = {
  providerId: "openai",
  displayName: "OpenAI",
  kind: "preset",
  transport: "openai-chat",
  authMethod: "api-key",
  requiresAuth: true,
  allowedHeaders: [],
};
