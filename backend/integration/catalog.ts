export interface IntegrationProbeSpec {
  /** HTTP method for the cheapest meaningful reachability probe. */
  method: "GET" | "POST";
  /** URL template; `{baseURL}` is replaced by the configured/default base URL. */
  urlTemplate: string;
  /** Default provider base URL used when the integration is not configured with one. */
  defaultBaseURL: string;
  /** Header templates; `{apiKey}` is replaced by the resolved credential. */
  headers: Record<string, string>;
  /** Optional JSON body template; string values may contain `{apiKey}`. */
  bodyTemplate?: Record<string, unknown>;
  /** Probe timeout in milliseconds. */
  timeoutMs: number;
}

export interface IntegrationPackageSpec {
  id: string;
  displayName: string;
  packageName: string;
  packageVersion: string;
  factoryExport: string;
  apiKeyEnv: string;
  baseURLEnv?: string;
  modelEnv: string;
  defaultModel: string;
  bundled: boolean;
  /** Capability IDs this integration advertises once enabled. */
  capabilities: string[];
  /** Whether the probe/model path requires a model name (default true). */
  requiresModel?: boolean;
  /** Declarative, integration-owned description of how its connection is tested. */
  probe: IntegrationProbeSpec;
}

/**
 * Curated install metadata only. OneShot does not implement vendor SDK behavior;
 * the installed package owns that implementation. Probe descriptors are
 * declarative per-integration metadata consumed by the generic probe engine —
 * core code never routes on provider names.
 */
const CATALOG: Record<string, IntegrationPackageSpec> = {
  gemini: {
    id: "gemini",
    displayName: "Gemini",
    packageName: "@ai-sdk/google",
    packageVersion: "4.0.67",
    factoryExport: "createGoogleGenerativeAI",
    apiKeyEnv: "GOOGLE_GENERATIVE_AI_API_KEY",
    baseURLEnv: "GEMINI_BASE_URL",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-2.5-flash",
    bundled: true,
    capabilities: ["model.execute", "vision.inspect"],
    probe: {
      method: "GET",
      urlTemplate: "{baseURL}/models",
      defaultBaseURL: "https://generativelanguage.googleapis.com/v1beta",
      headers: { "x-goog-api-key": "{apiKey}" },
      timeoutMs: 8000,
    },
  },
  openai: {
    id: "openai",
    displayName: "OpenAI",
    packageName: "@ai-sdk/openai",
    packageVersion: "4.0.65",
    factoryExport: "createOpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-5-mini",
    bundled: false,
    capabilities: ["model.execute"],
    probe: {
      method: "GET",
      urlTemplate: "{baseURL}/models",
      defaultBaseURL: "https://api.openai.com/v1",
      headers: { Authorization: "Bearer {apiKey}" },
      timeoutMs: 8000,
    },
  },
  anthropic: {
    id: "anthropic",
    displayName: "Anthropic",
    packageName: "@ai-sdk/anthropic",
    packageVersion: "4.0.52",
    factoryExport: "createAnthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-4-5",
    bundled: false,
    capabilities: ["model.execute"],
    probe: {
      method: "GET",
      urlTemplate: "{baseURL}/models",
      defaultBaseURL: "https://api.anthropic.com/v1",
      headers: {
        "x-api-key": "{apiKey}",
        "anthropic-version": "2023-06-01",
      },
      timeoutMs: 8000,
    },
  },
  nebius: {
    id: "nebius",
    displayName: "Nebius Token Factory",
    packageName: "@ai-sdk/openai",
    packageVersion: "4.0.65",
    factoryExport: "createOpenAI",
    apiKeyEnv: "NEBIUS_API_KEY",
    baseURLEnv: "NEBIUS_BASE_URL",
    modelEnv: "NEBIUS_MODEL",
    defaultModel: "",
    bundled: false,
    capabilities: ["model.execute"],
    probe: {
      method: "GET",
      urlTemplate: "{baseURL}/models",
      defaultBaseURL: "https://api.studio.nebius.com/v1",
      headers: { Authorization: "Bearer {apiKey}" },
      timeoutMs: 8000,
    },
  },
  tavily: {
    id: "tavily",
    displayName: "Tavily",
    packageName: "@tavily/core",
    packageVersion: "0.7.11",
    factoryExport: "tavily",
    apiKeyEnv: "TAVILY_API_KEY",
    baseURLEnv: "TAVILY_BASE_URL",
    modelEnv: "TAVILY_MODEL",
    defaultModel: "",
    bundled: false,
    requiresModel: false,
    capabilities: ["web.search"],
    probe: {
      method: "POST",
      urlTemplate: "{baseURL}/search",
      defaultBaseURL: "https://api.tavily.com",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer {apiKey}",
      },
      bodyTemplate: { query: "oneshot connectivity probe", max_results: 1 },
      timeoutMs: 8000,
    },
  },
};

export function integrationPackageSpec(id: string): IntegrationPackageSpec {
  const spec = CATALOG[id];
  if (!spec) throw new Error(`unsupported integration: ${id}`);
  return spec;
}

export function integrationCatalog(): IntegrationPackageSpec[] {
  return Object.values(CATALOG).map((spec) => ({ ...spec }));
}