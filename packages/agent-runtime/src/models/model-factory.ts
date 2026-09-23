/**
 * OneShot Model Factory — Explicit Provider & Live Model Construction
 *
 * Implements strict live model resolution without silent MockModel fallbacks:
 * 1. Resolves Gemini OpenAIModel via GEMINI_API_KEY / ONESHOT_API_TOKEN.
 * 2. Resolves OpenAI OpenAIModel via OPENAI_API_KEY.
 * 3. Resolves Vercel LanguageModelV1 via vercel-provider-adapter.
 * 4. Fails fast with descriptive error if provider credentials are unconfigured in production.
 * 5. Test doubles are injected into the exact same model parameter in test suites.
 */

import { OpenAIModel } from "@strands-agents/sdk/models/openai";
import { isVercelLanguageModel, resolveVercelModel } from "../agents/vercel-provider-adapter.js";

export interface ModelFactoryConfig {
  provider?: "gemini" | "openai" | "mistral" | "nebius" | "ollama" | "vercel" | "custom";
  apiKey?: string;
  sessionToken?: string;
  baseUrl?: string;
  modelId?: string;
  vercelModel?: unknown;
  model?: unknown;
}

/**
 * Prebuilt Model Presets — Users only need to input their API key.
 * Endpoints, default models, and OpenAI OpenAPI-compatible schemas are pre-configured.
 */
export const MODEL_PRESETS = {
  mistral: {
    provider: "mistral" as const,
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    models: ["mistral-large-latest", "mistral-small-latest", "codestral-latest", "open-mistral-nemo"],
    envKey: "MISTRAL_API_KEY",
  },
  gemini: {
    provider: "gemini" as const,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    envKey: "GEMINI_API_KEY",
  },
  openai: {
    provider: "openai" as const,
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-5", "gpt-5-mini"],
    envKey: "OPENAI_API_KEY",
  },
  nebius: {
    provider: "nebius" as const,
    baseUrl: "https://api.studio.nebius.com/v1/",
    defaultModel: "moonshotai/Kimi-K2.5",
    models: ["moonshotai/Kimi-K2.5", "deepseek-ai/DeepSeek-R1-0528"],
    envKey: "NEBIUS_API_KEY",
  },
  ollama: {
    provider: "ollama" as const,
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    models: ["llama3.2", "mistral", "deepseek-r1", "phi3"],
    envKey: "OLLAMA_API_KEY",
  },
} as const;

/**
 * Creates or resolves an explicit live model for agent execution.
 * Production source does not import, instantiate, or fall back to MockModel.
 */
export function createLiveModel(config: ModelFactoryConfig = {}): OpenAIModel | unknown {
  // If an explicit model or Vercel model instance is already provided (e.g. Injected by caller or test double)
  if (config.model) {
    return config.model;
  }

  if (config.vercelModel) {
    return isVercelLanguageModel(config.vercelModel)
      ? config.vercelModel
      : resolveVercelModel(config.vercelModel);
  }

  const mistralKey = config.apiKey || process.env.MISTRAL_API_KEY || (process.env.OPENAI_BASE_URL?.includes("mistral.ai") ? process.env.OPENAI_API_KEY : undefined);
  const geminiKey = config.apiKey || process.env.GEMINI_API_KEY;
  const sessionToken = config.sessionToken || process.env.ONESHOT_API_TOKEN;
  const openaiKey = config.apiKey || process.env.OPENAI_API_KEY;
  const nebiusKey = config.apiKey || process.env.NEBIUS_API_KEY;

  // 1. Resolve Mistral Prebuilt Preset (Test Key Provider)
  if (config.provider === "mistral" || (mistralKey && !config.provider && !geminiKey && !openaiKey)) {
    if (!mistralKey) {
      throw new Error("Missing credentials for Mistral preset: MISTRAL_API_KEY must be provided.");
    }
    const baseURL = config.baseUrl || process.env.MISTRAL_BASE_URL || MODEL_PRESETS.mistral.baseUrl;
    const modelId = config.modelId || process.env.MISTRAL_MODEL || MODEL_PRESETS.mistral.defaultModel;

    return new OpenAIModel({
      api: "chat",
      modelId,
      apiKey: mistralKey,
      clientConfig: { baseURL },
    });
  }

  // 2. Resolve Ollama Prebuilt Preset (Non-API Local Provider)
  if (config.provider === "ollama") {
    const baseURL = config.baseUrl || process.env.OLLAMA_BASE_URL || MODEL_PRESETS.ollama.baseUrl;
    const modelId = config.modelId || process.env.OLLAMA_MODEL || MODEL_PRESETS.ollama.defaultModel;

    return new OpenAIModel({
      api: "chat",
      modelId,
      apiKey: "ollama",
      clientConfig: { baseURL },
    });
  }

  // 3. Resolve Gemini Prebuilt Preset
  if ((config.provider === "gemini" || !config.provider) && (geminiKey || sessionToken)) {
    const token = sessionToken || geminiKey;
    const baseURL =
      config.baseUrl ||
      process.env.GEMINI_BASE_URL ||
      MODEL_PRESETS.gemini.baseUrl;
    const modelId = config.modelId || process.env.GEMINI_MODEL || MODEL_PRESETS.gemini.defaultModel;

    return new OpenAIModel({
      api: "chat",
      modelId,
      apiKey: token,
      clientConfig: {
        baseURL,
        defaultHeaders: {
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
          ...(geminiKey ? { "x-goog-api-key": geminiKey } : {}),
        },
      },
    });
  }

  // 4. Resolve OpenAI Prebuilt Preset (or Mistral Drop-In via OPENAI_BASE_URL)
  if ((config.provider === "openai" || !config.provider) && openaiKey) {
    const baseURL = config.baseUrl || process.env.OPENAI_BASE_URL || MODEL_PRESETS.openai.baseUrl;
    const modelId = config.modelId || process.env.OPENAI_MODEL || MODEL_PRESETS.openai.defaultModel;

    return new OpenAIModel({
      api: "chat",
      modelId,
      apiKey: openaiKey,
      clientConfig: baseURL ? { baseURL } : undefined,
    });
  }

  // 5. Resolve Nebius Prebuilt Preset
  if (config.provider === "nebius" && nebiusKey) {
    const baseURL = config.baseUrl || process.env.NEBIUS_BASE_URL || MODEL_PRESETS.nebius.baseUrl;
    const modelId = config.modelId || process.env.NEBIUS_MODEL || MODEL_PRESETS.nebius.defaultModel;

    return new OpenAIModel({
      api: "chat",
      modelId,
      apiKey: nebiusKey,
      clientConfig: { baseURL },
    });
  }

  // Strict invariant: Missing credentials throw an explicit blocker in production,
  // NEVER silently falling back to a MockModel or simulated success.
  throw new Error(
    "Missing provider credentials: GEMINI_API_KEY, OPENAI_API_KEY, or MISTRAL_API_KEY must be configured in environment or passed explicitly. MockModel execution is absent from production."
  );
}
