/**
 * ProviderManager — resolves catalog provider entries into live
 * ResearchProvider instances and manages the non-secret runtime configuration
 * (active provider, model/apiBase overrides) plus the write-only secret store.
 *
 * Security invariants (enforced here and verified by the test suite):
 *  - The browser may SUBMIT a credential but NEVER RETRIEVE it.
 *  - Catalog + status payloads never include credential values or
 *    secret-shaped fields (apiKey, value, secret, token, credential, ...).
 *  - process.env is never mutated as global run state; model/apiBase overrides
 *    come from the persisted non-secret runtime config on a per-run basis.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ProcessingEventBus } from "./event-bus.js";
import type { ResearchProvider } from "../role/researcher/provider.js";
import { FixtureResearchProvider } from "../role/researcher/tool/fixture-provider.js";
import {
  GeminiModelProvider,
  loadGeminiConfig,
} from "../role/researcher/provider/gemini/provider.js";
import {
  OpenAIModelProvider,
  loadOpenAIConfig,
} from "../role/researcher/provider/openai/provider.js";
import {
  AnthropicModelProvider,
  loadAnthropicConfig,
} from "../role/researcher/provider/anthropic/provider.js";
import type {
  ProviderCredential,
  ProviderSecretStore,
} from "./provider-secret-store.js";
import { LocalFileSecretStore } from "./provider-secret-store.js";
import {
  DEFAULTS,
  FileProviderRuntimeConfigStore,
  assertNoForbiddenFields,
  seedConfig,
} from "./provider-runtime-config.js";
import type {
  ProviderRuntimeConfig,
  ProviderRuntimeConfigStore,
  ProviderRuntimeSettings,
} from "./provider-runtime-config.js";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ProviderCatalogEntry {
  /** Catalog id (stable, git-tracked). Mirrors `providerId`. */
  id: string;
  /** Alias of `id`, kept for compatibility with older callers. */
  providerId: string;
  displayName: string;
  /** Catalog adapter type: "fixture" | "openai" | "anthropic" | "gemini". */
  adapter: string;
  protocol: string;
  apiBaseUrl: string;
  model: string;
  /** Non-secret credential metadata only — never the secret value. */
  credential: {
    type: string;
    source: string;
    configured: boolean;
  };
  enabled: boolean;
  editable: boolean;
  runtime: {
    model: string;
    apiBase?: string;
    timeoutSeconds: number;
    maxConcurrency: number;
    temperature?: number;
  };
}

export interface ProviderStatus extends ProviderCatalogEntry {
  supportsTemperature: boolean;
  /** Flat credential type: "none" | "api_key" | "oauth" | "google". */
  credentialType: string;
  /** Resolved non-secret credential source: none|env-var|local-secret-store. */
  credentialSource: string;
  /** True when this catalog entry is configured (enabled). */
  configured: boolean;
  /** True when this is the currently selected active provider. */
  active: boolean;
}

export interface ProviderManagerOptions {
  projectRoot: string;
  events?: ProcessingEventBus;
  catalogPath?: string;
  runtimePaths?: { root: string; config: string };
  secretStore?: ProviderSecretStore;
  runtimeConfigStore?: ProviderRuntimeConfigStore;
  /** @deprecated adapter resolution is now internal (from the catalog). */
  adapterRegistry?: unknown;
  mode?: "production" | "sample" | "test";
}

/** Non-secret directory of catalog providers (keyed by provider id). */
interface ProviderCatalog {
  providers: Record<string, ProviderCatalogEntry>;
}

const DEFAULT_CATALOG_NAME = "backend/config/providers.json";

// ---------------------------------------------------------------------------
// ProviderManager
// ---------------------------------------------------------------------------

export class ProviderManager {
  readonly catalog: ProviderCatalog = { providers: {} };
  private options: ProviderManagerOptions;
  private runtimeState: ProviderRuntimeConfig;
  private runtimePaths?: { root: string; config: string };
  private secretStore: ProviderSecretStore;
  private runtimeConfigStore?: ProviderRuntimeConfigStore;
  readonly mode: "production" | "sample" | "test";
  private catalogEnv: Record<string, string> = {};

  constructor(options: ProviderManagerOptions) {
    this.options = options;
    const mode = options.mode ?? process.env.ONESHOT_MODE ?? "production";
    if (!["production", "sample", "test"].includes(mode)) throw new Error("Invalid runtime mode");
    this.mode = mode as typeof this.mode;
    this.runtimePaths = options.runtimePaths;
    this.secretStore = options.secretStore ?? new LocalFileSecretStore();
    this.loadCatalog(
      resolve(options.projectRoot, options.catalogPath ?? DEFAULT_CATALOG_NAME),
    );
    this.runtimeConfigStore =
      options.runtimeConfigStore ?? this.defaultRuntimeConfigStore();
    this.runtimeState = this.runtimeConfigStore
      ? this.runtimeConfigStore.load()
      : seedConfig();
    const active = this.runtimeState.activeProvider;
    if (active === "google") this.runtimeState.activeProvider = "gemini";
    if (!this.catalog.providers[this.runtimeState.activeProvider]) {
      this.runtimeState.activeProvider = this.mode === "sample" ? "sample" : "<default>";
    }
    if (this.mode === "sample") {
      this.runtimeState.activeProvider = "sample";
      this.runtimeState.providers.sample = { enabled: true, model: "fixture" };
    }
    this.runtimeState.providers = Object.fromEntries(Object.entries(this.runtimeState.providers)
      .filter(([id]) => Boolean(this.catalog.providers[id])));
    if (active !== this.runtimeState.activeProvider) this.bumpRevisionAndPersist();
  }

  private defaultRuntimeConfigStore(): ProviderRuntimeConfigStore | undefined {
    if (this.runtimePaths?.config) {
      return new FileProviderRuntimeConfigStore(
        join(this.runtimePaths.config, "providers.json"),
      );
    }
    return undefined;
  }

  private runtimeDefaults(id: string): Partial<ProviderRuntimeSettings> {
    return DEFAULTS[id] ?? {};
  }

  private runtimeSettings(id: string): ProviderRuntimeSettings {
    const s = this.runtimeState.providers[id];
    const d = this.runtimeDefaults(id);
    return {
      enabled: s?.enabled ?? d.enabled ?? true,
      model: s?.model || d.model || "fixture",
      apiBase: s?.apiBase ?? d.apiBase,
      timeoutSeconds: s?.timeoutSeconds ?? d.timeoutSeconds,
      parallelism: s?.parallelism ?? d.parallelism,
      temperature: s?.temperature,
    };
  }

  private loadCatalog(catalogPath: string): void {
    let raw: {
      version?: number;
      providers?: Record<
        string,
        {
          label?: string;
          type?: string;
          credentialType?: string;
          credentialEnv?: string;
          model?: string;
          baseUrl?: string;
          enabled?: boolean;
          editable?: boolean;
        }
      >;
    };
    try {
      raw = JSON.parse(readFileSync(catalogPath, "utf8"));
    } catch {
      throw new Error(`Provider catalog not found: ${catalogPath}`);
    }
    const providers = raw?.providers ?? {};
    for (const [id, def] of Object.entries(providers)) {
      if (!def || typeof def !== "object" || !id) continue;
      if (!["openai", "anthropic", "gemini"].includes(id) &&
          !(id === "sample" && this.mode !== "production")) continue;
      const defaults = this.runtimeDefaults(id);
      const adapter = def.type ?? "fixture";
      const credentialType = def.credentialType ?? "none";
      this.catalogEnv[id] = def.credentialEnv ?? "";
      this.catalog.providers[id] = {
        id,
        providerId: id,
        displayName: def.label ?? id,
        adapter,
        protocol: protocolFor(adapter),
        apiBaseUrl: def.baseUrl ?? defaults.apiBase ?? "",
        model: def.model ?? defaults.model ?? "fixture",
        credential: {
          type: credentialType,
          source: "none",
          configured: false,
        },
        enabled: def.enabled ?? true,
        editable: def.editable ?? true,
        runtime: {
          model: defaults.model ?? "fixture",
          apiBase: defaults.apiBase,
          timeoutSeconds: defaults.timeoutSeconds ?? 300,
          maxConcurrency: defaults.parallelism ?? 2,
        },
      };
    }
  }

  /**
   * Return the public catalog entry for a provider id, or undefined if not found.
   * Used to resolve the user-facing provider name (label) without relying on
   * implementation class names.
   */
  getCatalogEntry(id: string): ProviderCatalogEntry | undefined {
    return this.catalog.providers[id];
  }

  /**
   * Resolve the public-facing provider name for a given provider id.
   * Returns "<default>" for the sample/fixture provider (unconfigured state),
   * the catalog display name for known providers, or the id as a fallback.
   */
  publicNameFor(id: string): string {
    if (id === "sample") return "<default>";
    const entry = this.catalog.providers[id];
    return ({ openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini" } as Record<string,string>)[id] ?? "<default>";
  }

  private async resolveCredentialSource(
    entry: ProviderCatalogEntry,
  ): Promise<string> {
    if (entry.credential.type === "none") return "none";
    const envName = this.catalogEnv[entry.id];
    if ((envName && process.env[envName]) || (entry.id === "gemini" && process.env.GOOGLE_API_KEY)) return "env-var";
    if ((await this.secretStore.get(entry.id))?.value.trim()) return "local-secret-store";
    return "none";
  }

  private async buildStatus(id: string): Promise<ProviderStatus> {
    const entry = this.catalog.providers[id];
    if (!entry) throw new Error(`Unknown provider: ${id}`);
    const settings = this.runtimeSettings(id);
    const source = await this.resolveCredentialSource(entry);
    const credentialConfigured =
      entry.credential.type === "none" || source !== "none";
    return {
      ...entry,
      supportsTemperature: id === "gemini" || (id === "openai" && /^gpt-4/.test(settings.model)) ||
        (id === "anthropic" && /^claude-(sonnet-4-20250514|3)/.test(settings.model)),
      active: this.runtimeState.activeProvider === id,
      configured: credentialConfigured,
      enabled: entry.enabled && settings.enabled,
      model: settings.model,
      credentialSource: source,
      credentialType: entry.credential.type,
      credential: {
        type: entry.credential.type,
        source,
        configured: credentialConfigured,
      },
      runtime: {
        model: settings.model,
        apiBase: settings.apiBase,
        timeoutSeconds: settings.timeoutSeconds ?? 300,
        maxConcurrency: settings.parallelism ?? 2,
        temperature: settings.temperature,
      },
    };
  }

  async list(): Promise<ProviderStatus[]> {
    return this.listProviderStatus();
  }

  async listProviderStatus(): Promise<ProviderStatus[]> {
    const out: ProviderStatus[] = [];
    for (const id of Object.keys(this.catalog.providers)) {
      out.push(await this.buildStatus(id));
    }
    return out;
  }

  async getProviderStatus(providerId: string): Promise<ProviderStatus> {
    if (!this.catalog.providers[providerId]) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    return this.buildStatus(providerId);
  }

  async get(providerId: string): Promise<ProviderStatus | undefined> {
    if (!this.catalog.providers[providerId]) return undefined;
    return this.buildStatus(providerId);
  }

  runtimeConfig(): ProviderRuntimeConfig {
    return structuredClone(this.runtimeState);
  }

  getRuntimeConfig(): ProviderRuntimeConfig {
    return structuredClone(this.runtimeState);
  }

  saveRuntimeConfigPatch(patch: {
    activeProvider?: string;
    providers?: Record<string, Partial<ProviderRuntimeSettings>>;
  }): ProviderRuntimeConfig {
    assertNoForbiddenFields(patch);
    const next = structuredClone(this.runtimeState);
    if (patch.activeProvider !== undefined) {
      if (patch.activeProvider !== "<default>" && !this.catalog.providers[patch.activeProvider])
        throw new Error("Unknown provider");
      next.activeProvider = patch.activeProvider;
    }
    for (const [id, changes] of Object.entries(patch.providers ?? {})) {
      if (!this.catalog.providers[id]) throw new Error("Unknown provider");
      if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw new Error("Invalid provider settings");
      const allowed = ["enabled", "model", "apiBase", "timeoutSeconds", "parallelism", "temperature"];
      if (Object.keys(changes).some(k => !allowed.includes(k))) throw new Error("Unknown provider setting");
      const settings = { ...this.runtimeSettings(id), ...changes };
      if (typeof settings.enabled !== "boolean" || typeof settings.model !== "string" ||
          !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(settings.model))
        throw new Error("Invalid provider model or enabled setting");
      for (const key of ["timeoutSeconds", "parallelism"] as const) {
        const n = settings[key];
        if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > (key === "parallelism" ? 16 : 900)))
          throw new Error("Invalid provider limits");
      }
      if (settings.temperature !== undefined && (!Number.isFinite(settings.temperature) ||
          settings.temperature < 0 || settings.temperature > (id === "anthropic" ? 1 : 2)))
        throw new Error("Invalid temperature");
      if (settings.apiBase) {
        const url = new URL(settings.apiBase);
        if (url.username || url.password || url.search || url.hash ||
            !(url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))))
          throw new Error("Provider URL must use HTTPS without credentials or query parameters");
      }
      next.providers[id] = settings;
    }
    if (next.activeProvider !== "<default>" && !next.providers[next.activeProvider]?.enabled)
      next.activeProvider = "<default>";
    this.runtimeState = next;
    this.bumpRevisionAndPersist();
    return structuredClone(this.runtimeState);
  }

  private bumpRevisionAndPersist(): void {
    this.runtimeState.revision = (this.runtimeState.revision ?? 0) + 1;
    if (this.runtimeConfigStore) {
      this.runtimeConfigStore.save(this.runtimeState);
    }
  }

  async update(
    providerId: string,
    patch: { model?: string; apiBase?: string; temperature?: number },
  ): Promise<ProviderStatus> {
    if (!this.catalog.providers[providerId]) {
      throw new Error(`Provider ${providerId} not found`);
    }
    const apply: Partial<ProviderRuntimeSettings> = {};
    if (patch.model !== undefined) apply.model = patch.model;
    if (patch.apiBase !== undefined) apply.apiBase = patch.apiBase;
    if (patch.temperature !== undefined) apply.temperature = patch.temperature;
    if (Object.keys(apply).length > 0) {
      this.saveRuntimeConfigPatch({ providers: { [providerId]: apply } });
    }
    return this.buildStatus(providerId);
  }

  async activate(providerId: string): Promise<ProviderStatus> {
    if (!this.catalog.providers[providerId]) {
      throw new Error(`Provider ${providerId} not found`);
    }
    const status = await this.buildStatus(providerId);
    if (!status.enabled || !status.credential.configured) throw new Error("Provider requires an enabled configuration and credential");
    this.saveRuntimeConfigPatch({ activeProvider: providerId });
    return this.buildStatus(providerId);
  }

  async test(
    providerId: string,
    _transient?: ProviderCredential | null,
    overrides?: Partial<ProviderRuntimeSettings>,
  ): Promise<{ ok: boolean; provider: string; error?: string }> {
    if (!this.catalog.providers[providerId]) {
      throw new Error(`Provider ${providerId} not found`);
    }
    let provider: ResearchProvider | undefined;
    try {
      const settings = { ...this.runtimeSettings(providerId), ...overrides };
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(settings.model)) throw new Error("Invalid model");
      provider = await this.constructProvider(providerId, this.options.projectRoot, settings, _transient ?? undefined);
      const status = await provider.ready("connection-test");
      return { ok: status.ready, provider: this.publicNameFor(providerId),
        ...(status.ready ? {} : { error: status.detail || "Connection failed" }) };
    } catch {
      return { ok: false, provider: this.publicNameFor(providerId), error: "Provider connection failed; check credential, model, and endpoint" };
    } finally { provider?.close?.(); }
  }

  async setCredential(
    providerId: string,
    credential?: ProviderCredential,
  ): Promise<ProviderStatus> {
    if (!this.catalog.providers[providerId]) {
      throw new Error(`Provider ${providerId} not found`);
    }
    if (credential) {
      if (credential.providerId !== providerId || credential.credentialType !== "api_key" || !credential.value.trim())
        throw new Error("Invalid credential");
      await this.secretStore.set(providerId, credential);
    } else {
      await this.secretStore.delete(providerId);
      if (this.runtimeState.activeProvider === providerId && !(await this.credentialValue(providerId)))
        this.runtimeState.activeProvider = "<default>";
    }
    this.bumpRevisionAndPersist();
    return this.buildStatus(providerId);
  }

  async createProvider(
    projectRoot?: string,
    _events?: ProcessingEventBus,
    _runId?: string,
  ): Promise<ResearchProvider> {
    const active = this.resolveActiveProviderId();
    return this.constructProvider(
      active,
      projectRoot ?? this.options.projectRoot,
    );
  }

  captureForRun() {
    const id = this.resolveActiveProviderId();
    if (id === "<default>") throw new Error("Configure and activate a provider before starting a run");
    const settings = this.runtimeSettings(id);
    if (!settings.enabled) throw new Error("Provider is disabled");
    return { id, model: settings.model, configRevision: this.runtimeState.revision, settings: structuredClone(settings) };
  }

  async resolveForRun(providerId?: string, captured?: { model?: string; configRevision?: number; settings?: ProviderRuntimeSettings }): Promise<ResearchProvider> {
    const id = providerId || this.resolveActiveProviderId();
    // Old envelopes lack full settings. Refuse changed revisions rather than silently rebinding.
    if (captured?.configRevision !== undefined && !captured.settings &&
        captured.configRevision !== this.runtimeState.revision)
      throw new Error("Captured provider configuration is unavailable; resubmit the run");
    return this.constructProvider(id, this.options.projectRoot,
      captured?.settings ?? (captured?.model ? { ...this.runtimeSettings(id), model: captured.model } : undefined));
  }

  private resolveActiveProviderId(): string {
    return this.catalog.providers[this.runtimeState.activeProvider] ? this.runtimeState.activeProvider : "<default>";
  }

  private async credentialValue(id: string, transient?: ProviderCredential): Promise<string> {
    if (transient) return transient.value;
    const env = this.catalogEnv[id];
    return (env && process.env[env]?.trim()) ||
      (id === "gemini" && process.env.GOOGLE_API_KEY?.trim()) ||
      (await this.secretStore.get(id))?.value || "";
  }

  private async constructProvider(
    providerId: string,
    projectRoot: string,
    captured?: ProviderRuntimeSettings,
    transient?: ProviderCredential,
  ): Promise<ResearchProvider> {
    if (providerId === "<default>") {
      return {
        ready: async () => ({ ready: false, provider: "<default>", models: [], detail: "Configure and activate a provider" }),
        research: async () => { throw new Error("Configure and activate a provider"); },
      };
    }
    const entry = this.catalog.providers[providerId];
    if (!entry) throw new Error("Unknown provider");
    const settings = captured ?? this.runtimeSettings(providerId);
    if (!settings.enabled) throw new Error("Provider is disabled");
    if (entry.adapter === "fixture" && this.mode !== "production")
      return new FixtureResearchProvider(resolve(projectRoot, "app/fixtures/product/complete-success-seed.json"));
    const apiKey = await this.credentialValue(providerId, transient);
    const shared = { apiKey, temperature: settings.temperature,
      workerPoolSize: settings.parallelism ?? 2, timeoutSeconds: settings.timeoutSeconds ?? 300 };
    let provider: ResearchProvider;
    if (entry.adapter === "openai") {
      provider = new OpenAIModelProvider(projectRoot, { ...loadOpenAIConfig(projectRoot), ...shared,
        model: settings.model, baseUrl: settings.apiBase || "https://api.openai.com/v1", testDraftFile: undefined });
    } else if (entry.adapter === "anthropic") {
      provider = new AnthropicModelProvider(projectRoot, { ...loadAnthropicConfig(projectRoot), ...shared,
        model: settings.model, baseUrl: settings.apiBase || "https://api.anthropic.com/v1", testDraftFile: undefined });
    } else if (entry.adapter === "gemini") {
      provider = new GeminiModelProvider(projectRoot, { ...loadGeminiConfig(projectRoot, settings.model), ...shared,
        baseUrl: settings.apiBase || "https://generativelanguage.googleapis.com/v1beta",
        useVertexAi: false, testDraftFile: undefined });
    } else throw new Error("Unsupported provider adapter");
    if (this.options.events) provider.attachEvents?.(this.options.events);
    return provider;
  }

  close(): void {
    this.options = this.options;
  }
}

function protocolFor(adapter: string): string {
  switch (adapter) {
    case "fixture":
      return "fixture://";
    case "openai":
      return "https";
    case "anthropic":
      return "https";
    case "gemini":
      return "https";
    default:
      return "unknown";
  }
}
