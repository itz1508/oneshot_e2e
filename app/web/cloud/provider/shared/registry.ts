import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ResearchProvider } from "../../provider.js";
import type { ProviderRuntimeSettings } from "../../provider-runtime-config.js";
import { FixtureResearchProvider } from "../fixture-provider.js";
import { AnthropicModelProvider, loadAnthropicConfig } from "../anthropic/provider.js";
import { GeminiModelProvider, loadGeminiConfig } from "../gemini/provider.js";
import { OpenAIModelProvider, loadOpenAIConfig } from "../openai/provider.js";

/** Default API base applied when the runtime settings carry no override. */
export const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
export const DEFAULT_ANTHROPIC_BASE = "https://api.anthropic.com/v1";
export const DEFAULT_GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

/**
 * Per-adapter control metadata plus provider construction for the catalog
 * adapters. Provider-specific strings, credential environments and config
 * literals live here so the manager and resolver stay adapter-agnostic.
 */
export interface ProviderResearchAdapter {
  /** Catalog id (stable, git-tracked). */
  readonly id: string;
  /** protocolFor catalog value. */
  readonly protocol: string;
  /** Public display name (never an implementation class name). */
  readonly displayName: string;
  /** Credential environment variable from the catalog. */
  readonly envVar: string;
  /** Alternative credential environment variable (e.g. Gemini GOOGLE_API_KEY). */
  readonly fallbackEnvVar?: string;
  /** Default model when no runtime settings exist. */
  readonly defaultModel: string;
  /** Default API base override applied to runtime settings. */
  readonly defaultApiBase?: string;
  /** Whether the runtime settings temperature may be forwarded to the model. */
  supportsTemperature(model: string): boolean;
  /** Construct the live provider with captured or active runtime settings. */
  create(
    projectRoot: string,
    settings: ProviderRuntimeSettings,
    apiKey: string,
  ): ResearchProvider;
  /**
   * Construct the provider from its environment-loaded defaults (the legacy
   * ONESHOT_RESEARCH_PROVIDER compatibility entrypoint).
   */
  createDefault(projectRoot: string): ResearchProvider;
}

export const PROVIDER_ADAPTERS: Record<string, ProviderResearchAdapter> = {
  openai: {
    id: "openai",
    protocol: "https",
    displayName: "OpenAI",
    envVar: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    defaultApiBase: DEFAULT_OPENAI_BASE,
    supportsTemperature: (model) => /^gpt-4/.test(model),
    create: (projectRoot, settings, apiKey) =>
      new OpenAIModelProvider(projectRoot, {
        ...loadOpenAIConfig(projectRoot),
        apiKey,
        temperature: settings.temperature,
        workerPoolSize: settings.parallelism ?? 2,
        timeoutSeconds: settings.timeoutSeconds ?? 300,
        model: settings.model,
        baseUrl: settings.apiBase || DEFAULT_OPENAI_BASE,
        testDraftFile: undefined,
      }),
    createDefault: (projectRoot) => new OpenAIModelProvider(projectRoot),
  },
  anthropic: {
    id: "anthropic",
    protocol: "https",
    displayName: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-20250514",
    defaultApiBase: DEFAULT_ANTHROPIC_BASE,
    supportsTemperature: (model) =>
      /^claude-(sonnet-4-20250514|3)/.test(model),
    create: (projectRoot, settings, apiKey) =>
      new AnthropicModelProvider(projectRoot, {
        ...loadAnthropicConfig(projectRoot),
        apiKey,
        temperature: settings.temperature,
        workerPoolSize: settings.parallelism ?? 2,
        timeoutSeconds: settings.timeoutSeconds ?? 300,
        model: settings.model,
        baseUrl: settings.apiBase || DEFAULT_ANTHROPIC_BASE,
        testDraftFile: undefined,
      }),
    createDefault: (projectRoot) => new AnthropicModelProvider(projectRoot),
  },
  gemini: {
    id: "gemini",
    protocol: "https",
    displayName: "Gemini",
    envVar: "GEMINI_API_KEY",
    fallbackEnvVar: "GOOGLE_API_KEY",
    defaultModel: "gemini-3.6-flash",
    defaultApiBase: DEFAULT_GEMINI_BASE,
    supportsTemperature: () => true,
    create: (projectRoot, settings, apiKey) =>
      new GeminiModelProvider(projectRoot, {
        ...loadGeminiConfig(projectRoot, settings.model),
        apiKey,
        temperature: settings.temperature,
        workerPoolSize: settings.parallelism ?? 2,
        timeoutSeconds: settings.timeoutSeconds ?? 300,
        baseUrl: settings.apiBase || DEFAULT_GEMINI_BASE,
        useVertexAi: false,
        testDraftFile: undefined,
      }),
    createDefault: (projectRoot) => new GeminiModelProvider(projectRoot),
  },
};

/** Stable placeholder id for the unconfigured production state. */
export const DEFAULT_PROVIDER_ID = "<default>";

/** Legacy alias ids accepted wherever an explicit provider id is expected. */
export function defaultProviderIdFor(id: string): string {
  return id === "google" ? "gemini" : id;
}

/**
 * The unconfigured production provider: never ready, never researchable.
 * Binding is explicit — production must not silently choose a model.
 */
export function createUnconfiguredProvider(): ResearchProvider {
  return {
    ready: async () => ({
      ready: false,
      provider: DEFAULT_PROVIDER_ID,
      models: [],
      detail: "Configure and activate a provider",
    }),
    research: async () => {
      throw new Error("Configure and activate a provider");
    },
  };
}

/**
 * Deterministic sample seed location, resolved against the project root with
 * a fallback to a repository-layout variant.
 */
export function resolveSeedFixture(projectRoot: string): string {
  const p1 = resolve(projectRoot, "app/fixtures/product/complete-success-seed.json");
  if (existsSync(p1)) return p1;
  const p2 = resolve(projectRoot, "fixtures/product/complete-success-seed.json");
  if (existsSync(p2)) return p2;
  return p1;
}

/** Deterministic sample provider for the given project root. */
export function fixtureProviderFor(projectRoot: string): ResearchProvider {
  return new FixtureResearchProvider(resolveSeedFixture(projectRoot));
}