import type { ModelProvider, ModelProviderConfig } from "../model-provider.js";
import { createAnthropicModelProvider } from "./anthropic.js";
import { createGoogleModelProvider } from "./google.js";
import { createOpenAIModelProvider } from "./openai.js";

export function createModelProvider(
  id: string,
  config: ModelProviderConfig,
): ModelProvider {
  switch (id) {
    case "openai":
      return createOpenAIModelProvider(config);
    case "anthropic":
      return createAnthropicModelProvider(config);
    case "gemini":
      return createGoogleModelProvider(config);
    default:
      throw new Error(`Unsupported provider: ${id}`);
  }
}
