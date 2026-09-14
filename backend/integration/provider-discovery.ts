export interface EndpointCandidate {
  id: string;
  url: string;
  label: string;
  source: "official" | "discovered" | "custom";
}

export interface DiscoveredModel {
  id: string;
  endpointUrl: string;
  capabilities?: {
    toolCalling?: boolean;
    streaming?: boolean;
    structuredOutput?: boolean;
  };
}

export interface ProviderDefinition {
  id: string;
  name: string;
  endpointCandidates: EndpointCandidate[];
  requiresApiKey: boolean;
  knownCapabilities?: {
    toolCalling?: boolean;
    streaming?: boolean;
    structuredOutput?: boolean;
  };
}

export const KNOWN_PROVIDERS: Record<string, ProviderDefinition> = {
  groq: {
    id: "groq",
    name: "Groq Cloud",
    requiresApiKey: true,
    endpointCandidates: [
      {
        id: "groq-official",
        url: "https://api.groq.com/openai/v1",
        label: "Official Groq Cloud",
        source: "official",
      },
    ],
    knownCapabilities: {
      toolCalling: true,
      streaming: true,
      structuredOutput: true,
    },
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    requiresApiKey: true,
    endpointCandidates: [
      {
        id: "openai-official",
        url: "https://api.openai.com/v1",
        label: "Official OpenAI API",
        source: "official",
      },
    ],
    knownCapabilities: {
      toolCalling: true,
      streaming: true,
      structuredOutput: true,
    },
  },
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    requiresApiKey: false,
    endpointCandidates: [
      {
        id: "ollama-default",
        url: "http://localhost:11434/v1",
        label: "Local Host (11434)",
        source: "official",
      },
    ],
  },
};

/**
 * Authenticated model discovery probe calling GET /models.
 */
export async function probeLiveModels(
  endpointUrl: string,
  apiKey?: string,
  signal?: AbortSignal,
): Promise<DiscoveredModel[]> {
  const cleanUrl = endpointUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (apiKey && apiKey.trim()) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }

  const res = await fetch(`${cleanUrl}/models`, {
    method: "GET",
    headers,
    signal: signal ?? AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    throw new Error(`Model probe failed: HTTP ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { data?: Array<{ id?: string; name?: string }> };
  const list = Array.isArray(data)
    ? (data as Array<{ id?: string; name?: string }>)
    : Array.isArray(data?.data)
      ? data.data
      : [];

  return list.map((item) => ({
    id: item.id || item.name || "unknown-model",
    endpointUrl: cleanUrl,
  }));
}

export interface ResolvedProviderConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  apiKeyPresent: boolean;
  requestedModelId?: string;
}

/**
 * Resolve provider configuration from environment variables.
 * Production and diagnostics share this exact resolution logic.
 */
export function resolveProviderConfiguration(): ResolvedProviderConfig {
  const explicitBase = (process.env.ONESHOT_BASE_URL || "").trim().replace(/\/+$/, "");
  const explicitKey = (process.env.ONESHOT_API_KEY || "").trim();
  const requestedModel = (
    process.env.ONESHOT_MODEL_ID ||
    process.env.GROQ_MODEL ||
    process.env.OPENAI_MODEL ||
    process.env.OLLAMA_MODEL ||
    ""
  ).trim() || undefined;

  // 1. Explicit ONESHOT_BASE_URL
  if (explicitBase) {
    const key =
      explicitKey ||
      (
        process.env.OPENAI_API_KEY ||
        process.env.GROQ_API_KEY ||
        process.env.FEATHERLESS_API_KEY ||
        ""
      ).trim();

    let provider = "custom";
    const lower = explicitBase.toLowerCase();
    if (lower.includes("groq.com")) provider = "groq";
    else if (lower.includes("openai.com")) provider = "openai";
    else if (lower.includes("featherless.ai")) provider = "featherless";
    else if (lower.includes("11434") || lower.includes("ollama")) provider = "ollama";

    return {
      provider,
      baseUrl: explicitBase,
      apiKey: key,
      apiKeyPresent: Boolean(key),
      requestedModelId: requestedModel,
    };
  }

  // 2. Groq
  if (process.env.GROQ_API_KEY?.trim()) {
    const key = process.env.GROQ_API_KEY.trim();
    const baseUrl = (process.env.GROQ_BASE_URL || KNOWN_PROVIDERS.groq.endpointCandidates[0].url)
      .trim()
      .replace(/\/+$/, "");
    return {
      provider: "groq",
      baseUrl,
      apiKey: key,
      apiKeyPresent: true,
      requestedModelId: requestedModel || "llama-3.3-70b-versatile",
    };
  }

  // 3. OpenAI
  if (process.env.OPENAI_API_KEY?.trim()) {
    const key = process.env.OPENAI_API_KEY.trim();
    const baseUrl = (process.env.OPENAI_BASE_URL || KNOWN_PROVIDERS.openai.endpointCandidates[0].url)
      .trim()
      .replace(/\/+$/, "");
    return {
      provider: "openai",
      baseUrl,
      apiKey: key,
      apiKeyPresent: true,
      requestedModelId: requestedModel || "gpt-4o-mini",
    };
  }

  // 4. Featherless
  if (process.env.FEATHERLESS_API_KEY?.trim()) {
    const key = process.env.FEATHERLESS_API_KEY.trim();
    const baseUrl = (process.env.FEATHERLESS_BASE_URL || "https://api.featherless.ai/v1")
      .trim()
      .replace(/\/+$/, "");
    return {
      provider: "featherless",
      baseUrl,
      apiKey: key,
      apiKeyPresent: true,
      requestedModelId: requestedModel,
    };
  }

  // 5. Ollama
  if (process.env.OLLAMA_BASE_URL?.trim()) {
    const baseUrl = process.env.OLLAMA_BASE_URL.trim().replace(/\/+$/, "");
    return {
      provider: "ollama",
      baseUrl,
      apiKey: (process.env.OLLAMA_API_KEY || "ollama").trim(),
      apiKeyPresent: true,
      requestedModelId: requestedModel || process.env.OLLAMA_MODEL || "gemma2:2b",
    };
  }

  // Fallback: unconfigured or partial
  return {
    provider: explicitKey ? "custom" : "none",
    baseUrl: "",
    apiKey: explicitKey,
    apiKeyPresent: Boolean(explicitKey),
    requestedModelId: requestedModel,
  };
}

