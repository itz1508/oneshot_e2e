/**
 * OneShot Model Factory — Production-Grade Provider & Live Model Construction
 *
 * Implements:
 * 1. Singleton client cache via ModelClientCache (P1-4)
 * 2. Per-request timeout (60s) and retry (3x with exponential backoff) (P1-1)
 * 3. Provider failover via config.toml fallback chain (P1-2)
 * 4. Classified error handling via error-classification.ts (P1-3)
 * 5. Vercel AI SDK bridge for LanguageModelV1/V3 providers
 * 6. Fails fast with descriptive error if provider credentials are unconfigured.
 */

import { OpenAIModel } from "@strands-agents/sdk/models/openai"
import { isVercelLanguageModel, resolveVercelModel } from "../agents/vercel-provider-adapter.js"
import { getModelClientCache } from "./client-cache.js"
import { classifyModelError, type ClassifiedModelError, ModelErrorCode } from "./error-classification.js"

export interface ModelFactoryConfig {
  provider?: "gemini" | "openai" | "mistral" | "nebius" | "ollama" | "vercel" | "custom"
  apiKey?: string
  sessionToken?: string
  baseUrl?: string
  modelId?: string
  vercelModel?: unknown
  model?: unknown
  /** Override default timeout (ms). Default: 60000. */
  timeoutMs?: number
  /** Override default max retries. Default: 3. */
  maxRetries?: number
  /** Gemini-specific safety settings */
  safetySettings?: Array<{ category: string; threshold: string }>
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
} as const

/**
 * Resolves the provider name for a given config, used for fallback chain resolution.
 */
function resolveProviderName(config: ModelFactoryConfig): string {
  if (config.provider) return config.provider
  const mistralKey = config.apiKey || process.env.MISTRAL_API_KEY
  const geminiKey = config.apiKey || process.env.GEMINI_API_KEY
  const openaiKey = config.apiKey || process.env.OPENAI_API_KEY
  if (mistralKey && !geminiKey && !openaiKey) return "mistral"
  if (geminiKey) return "gemini"
  if (openaiKey) return "openai"
  return "unknown"
}

/**
 * Provider fallback chain from config.toml.
 * Returns the next provider to try on failure, or null if chain is exhausted.
 */
function getNextFallbackProvider(
  currentProvider: string,
  providers?: Array<{ name: string, fallback?: string }>
): string | null {
  if (!providers?.length) {
    // Default hardcoded fallback chain if no config.toml providers defined
    const defaultChain: Record<string, string> = {
      mistral: "gemini",
      gemini: "openai",
      openai: "nebius",
      nebius: "ollama",
    }
    return defaultChain[currentProvider] || null
  }

  const entry = providers.find(p => p.name === currentProvider)
  return entry?.fallback || null
}

/**
 * Creates or resolves an explicit live model for agent execution.
 * Uses the singleton ModelClientCache for connection reuse.
 * Production source does not import, instantiate, or fall back to MockModel.
 */
export function createLiveModel(config: ModelFactoryConfig = {}): OpenAIModel | unknown {
  // If an explicit model or Vercel model instance is already provided (e.g. Injected by caller or test double)
  if (config.model) {
    return config.model
  }

  if (config.vercelModel) {
    return isVercelLanguageModel(config.vercelModel)
      ? config.vercelModel
      : resolveVercelModel(config.vercelModel)
  }

  const cache = getModelClientCache()
  const timeout = config.timeoutMs ?? 60_000
  const maxRetries = config.maxRetries ?? 3

  const mistralKey = config.apiKey || process.env.MISTRAL_API_KEY || (process.env.OPENAI_BASE_URL?.includes("mistral.ai") ? process.env.OPENAI_API_KEY : undefined)
  const geminiKey = config.apiKey || process.env.GEMINI_API_KEY
  const sessionToken = config.sessionToken || process.env.ONESHOT_API_TOKEN
  const openaiKey = config.apiKey || process.env.OPENAI_API_KEY
  const nebiusKey = config.apiKey || process.env.NEBIUS_API_KEY

  // 1. Resolve Mistral Prebuilt Preset (Test Key Provider)
  if (config.provider === "mistral" || (mistralKey && !config.provider && !geminiKey && !openaiKey)) {
    if (!mistralKey) {
      throw new Error("Missing credentials for Mistral preset: MISTRAL_API_KEY must be provided.")
    }
    const baseURL = config.baseUrl || process.env.MISTRAL_BASE_URL || MODEL_PRESETS.mistral.baseUrl
    const modelId = config.modelId || process.env.MISTRAL_MODEL || MODEL_PRESETS.mistral.defaultModel

    return cache.getOrCreate("mistral", modelId, mistralKey, baseURL, {
      timeout,
      maxRetries,
    })
  }

  // 2. Resolve Ollama Prebuilt Preset (Non-API Local Provider)
  if (config.provider === "ollama") {
    const baseURL = config.baseUrl || process.env.OLLAMA_BASE_URL || MODEL_PRESETS.ollama.baseUrl
    const modelId = config.modelId || process.env.OLLAMA_MODEL || MODEL_PRESETS.ollama.defaultModel

    return cache.getOrCreate("ollama", modelId, "ollama", baseURL, {
      timeout: timeout * 2, // Local models may be slower to load
      maxRetries: 1, // Local models don't benefit from retries the same way
    })
  }

  // 3. Resolve Gemini Prebuilt Preset
  if ((config.provider === "gemini" || !config.provider) && (geminiKey || sessionToken)) {
    const token = sessionToken || geminiKey
    const baseURL =
      config.baseUrl ||
      process.env.GEMINI_BASE_URL ||
      MODEL_PRESETS.gemini.baseUrl
    const modelId = config.modelId || process.env.GEMINI_MODEL || MODEL_PRESETS.gemini.defaultModel

    return cache.getOrCreate("gemini", modelId, token!, baseURL, {
      timeout,
      maxRetries,
      defaultHeaders: {
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        ...(geminiKey ? { "x-goog-api-key": geminiKey } : {}),
      },
    })
  }

  // 4. Resolve OpenAI Prebuilt Preset (or Mistral Drop-In via OPENAI_BASE_URL)
  if ((config.provider === "openai" || !config.provider) && openaiKey) {
    const baseURL = config.baseUrl || process.env.OPENAI_BASE_URL || MODEL_PRESETS.openai.baseUrl
    const modelId = config.modelId || process.env.OPENAI_MODEL || MODEL_PRESETS.openai.defaultModel

    return cache.getOrCreate("openai", modelId, openaiKey, baseURL, {
      timeout,
      maxRetries,
    })
  }

  // 5. Resolve Nebius Prebuilt Preset
  if (config.provider === "nebius" && nebiusKey) {
    const baseURL = config.baseUrl || process.env.NEBIUS_BASE_URL || MODEL_PRESETS.nebius.baseUrl
    const modelId = config.modelId || process.env.NEBIUS_MODEL || MODEL_PRESETS.nebius.defaultModel

    return cache.getOrCreate("nebius", modelId, nebiusKey, baseURL, {
      timeout,
      maxRetries,
    })
  }

  // Strict invariant: Missing credentials throw an explicit blocker in production,
  // NEVER silently falling back to a MockModel or simulated success.
  throw new Error(
    "Missing provider credentials: GEMINI_API_KEY, OPENAI_API_KEY, or MISTRAL_API_KEY must be configured in environment or passed explicitly. MockModel execution is absent from production."
  )
}

/**
 * Creates a live model with automatic provider failover.
 *
 * On transient failures (rate limit, server error, timeout, connection error),
 * attempts the next provider in the fallback chain defined in config.toml.
 * Permanent failures (auth, invalid request, content filtered) are thrown immediately.
 *
 * @param config - Model factory configuration
 * @param providers - Provider fallback chain from config.toml (optional)
 * @param maxFallbacks - Maximum number of fallback attempts (default: 3)
 * @returns The model instance, or throws a ClassifiedModelError
 */
export function createLiveModelWithFallback(
  config: ModelFactoryConfig = {},
  providers?: Array<{ name: string, fallback?: string }>,
  maxFallbacks: number = 3
): { model: OpenAIModel | unknown, provider: string, fallbacksUsed: number } {
  const errors: ClassifiedModelError[] = []
  let currentProvider = resolveProviderName(config)
  let currentConfig = { ...config }
  let fallbackCount = 0

  while (fallbackCount <= maxFallbacks) {
    try {
      const model = createLiveModel(currentConfig)
      return {
        model,
        provider: currentProvider,
        fallbacksUsed: fallbackCount,
      }
    } catch (err: unknown) {
      const classified = classifyModelError(err, currentProvider)
      errors.push(classified)

      // Permanent errors — do not try fallback
      if (!classified.retryEligible) {
        throw classified
      }

      // Try next provider in the fallback chain
      const nextProvider = getNextFallbackProvider(currentProvider, providers)
      if (!nextProvider) {
        // Chain exhausted — throw the last classified error with context
        const exhaustedError: ClassifiedModelError = {
          ...classified,
          message: `All providers exhausted. Last error from ${currentProvider}: ${classified.message}. ` +
            `Tried: ${errors.map(e => e.provider).join(' → ')}`,
          code: ModelErrorCode.PROVIDER_UNAVAILABLE,
        }
        throw exhaustedError
      }

      currentProvider = nextProvider
      currentConfig = {
        ...config,
        provider: nextProvider as ModelFactoryConfig['provider'],
        apiKey: undefined, // Let the factory resolve credentials from environment
        baseUrl: undefined, // Let the factory resolve base URL from presets
        modelId: undefined, // Let the factory resolve default model from presets
      }
      fallbackCount++
    }
  }

  // Should not reach here, but satisfy TypeScript
  throw new Error(`Fallback chain exceeded maximum depth (${maxFallbacks})`)
}

export { ModelClientCache, getModelClientCache } from "./client-cache.js"
export {
  classifyModelError,
  type ClassifiedModelError,
  ModelErrorCode,
} from "./error-classification.js"
