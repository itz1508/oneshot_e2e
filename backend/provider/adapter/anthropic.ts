import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type {
  ModelGenerateRequest,
  ModelProvider,
  ModelProviderConfig,
} from "../model-provider.js";

export function createAnthropicModelProvider(
  config: ModelProviderConfig,
): ModelProvider {
  const client = createAnthropic({
    apiKey: config.apiKey,
    ...(config.apiBase ? { baseURL: config.apiBase } : {}),
  });
  const model = client(config.model);

  const run = async (input: ModelGenerateRequest): Promise<string> => {
    const temperature = input.temperature ?? config.temperature;
    const result = await generateText({
      model,
      ...(input.system ? { system: input.system } : {}),
      prompt: input.prompt,
      maxOutputTokens: input.maxOutputTokens ?? config.maxOutputTokens,
      ...(temperature === undefined ? {} : { temperature }),
      maxRetries: 2,
      timeout: config.timeoutSeconds * 1000,
    });
    const text = result.text?.trim();
    if (!text) throw new Error("Anthropic returned no text");
    return text;
  };

  return {
    id: "anthropic",
    model: config.model,
    generate: run,
    async ready() {
      try {
        await run({ prompt: "Reply with OK.", maxOutputTokens: 16, temperature: 0 });
        return {
          ready: true,
          provider: "anthropic",
          models: [config.model],
          detail: "Live model connection verified",
        };
      } catch {
        return {
          ready: false,
          provider: "anthropic",
          models: [config.model],
          detail: "Anthropic connection failed; check credential, model, and endpoint",
        };
      }
    },
  };
}
