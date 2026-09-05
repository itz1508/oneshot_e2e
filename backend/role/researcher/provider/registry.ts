/**
 * Provider adapter registry — the single place where provider construction
 * branching lives. ProviderManager delegates here; provider-specific details
 * (config loading, credential injection, event attachment) stay inside each
 * adapter factory.
 */
import type { ProcessingEventBus } from "../../../runtime/event-bus.js";
import type { ProviderRuntimeSettings } from "../../../runtime/provider-runtime-config.js";
import type { ResearchProvider } from "../provider.js";
import { FixtureResearchProvider } from "../tool/fixture-provider.js";
import {
  FeatherlessResearchProvider,
  loadFeatherlessConfig,
} from "./featherless/provider.js";
import {
  GeminiModelProvider,
  loadGeminiConfig,
} from "./gemini/provider.js";
import {
  OpenAIModelProvider,
  loadOpenAIConfig,
} from "./openai/provider.js";
import {
  AnthropicModelProvider,
  loadAnthropicConfig,
} from "./anthropic/provider.js";
import { RemoteChatResearchProvider } from "../remote-chat-research-provider.js";

export interface ProviderAdapterContext {
  projectRoot: string;
  settings: ProviderRuntimeSettings;
  /** Probe/run credential resolved by the ProviderManager (never persisted here). */
  credentialValue?: string;
  events?: ProcessingEventBus;
}

type AdapterFactory = (ctx: ProviderAdapterContext) => ResearchProvider;

/**
 * Central, historical-id alias map. Resolved by ProviderManager.resolveId()
 * for every public operation so legacy references keep working.
 */
export const PROVIDER_ID_ALIASES: Record<string, string> = {
  google: "gemini",
  adk_gemma2: "gemini",
};

export function resolveProviderId(id: string): string {
  return PROVIDER_ID_ALIASES[id] ?? id;
}

const FACTORIES: Record<string, AdapterFactory> = {
  fixture: () => new FixtureResearchProvider(),

  // Gemini: the working Google Gemini pipeline normalized behind the gemini
  // identity. Not duplicated — the adapter delegates to the existing
  // implementation and its draft flows through the ONE shared canonical
  // parser. "adk_gemma2" remains only as an internal legacy alias.
  gemini: (ctx) => createGeminiResearchProvider(ctx),

  // Internal legacy alias for the historical adapter key. Never surfaced.
  adk_gemma2: (ctx) => createGeminiResearchProvider(ctx),

  featherless: (ctx) => {
    const base = loadFeatherlessConfig(ctx.projectRoot);
    const provider = new FeatherlessResearchProvider(ctx.projectRoot, {
      ...base,
      model: ctx.settings.model || base.model,
      baseUrl: ctx.settings.apiBase || base.baseUrl,
      apiKey: ctx.credentialValue ?? base.apiKey,
      workerPoolSize: ctx.settings.parallelism ?? base.workerPoolSize,
      timeoutSeconds: ctx.settings.timeoutSeconds ?? base.timeoutSeconds,
    });
    if (ctx.events) provider.attachEvents?.(ctx.events);
    return provider;
  },

  openai: (ctx) => {
    const modelProvider = new OpenAIModelProvider(
      loadOpenAIConfig(ctx.projectRoot, ctx.settings, ctx.credentialValue),
    );
    return new RemoteChatResearchProvider({
      projectRoot: ctx.projectRoot,
      modelProvider,
      model: ctx.settings.model || "gpt-4o-mini",
      apiKey: ctx.credentialValue,
      timeoutSeconds: ctx.settings.timeoutSeconds ?? undefined,
      events: ctx.events,
    });
  },

  anthropic: (ctx) => {
    const modelProvider = new AnthropicModelProvider(
      loadAnthropicConfig(ctx.projectRoot, ctx.settings, ctx.credentialValue),
    );
    return new RemoteChatResearchProvider({
      projectRoot: ctx.projectRoot,
      modelProvider,
      model: ctx.settings.model || "claude-sonnet-4-5",
      apiKey: ctx.credentialValue,
      timeoutSeconds: ctx.settings.timeoutSeconds ?? undefined,
      events: ctx.events,
    });
  },
};

export function createProviderAdapter(
  adapter: string,
  ctx: ProviderAdapterContext,
): ResearchProvider {
  const factory = FACTORIES[adapter];
  if (!factory) throw new Error(`Unknown provider adapter: ${adapter}`);
  return factory(ctx);
}

function createGeminiResearchProvider(
  ctx: ProviderAdapterContext,
): ResearchProvider {
  const modelProvider = new GeminiModelProvider(
    loadGeminiConfig(ctx.projectRoot, ctx.settings, ctx.credentialValue),
    ctx.projectRoot,
  );
  return new RemoteChatResearchProvider({
    projectRoot: ctx.projectRoot,
    modelProvider,
    model: ctx.settings.model || "gemini-pipeline",
    apiKey: ctx.credentialValue,
    timeoutSeconds: ctx.settings.timeoutSeconds ?? undefined,
    events: ctx.events,
  });
}