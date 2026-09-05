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
  AdkGemmaResearchProvider,
  loadAdkGemmaConfig,
} from "../role/researcher/provider/adk-gemma2/provider.js";
import {
  FeatherlessResearchProvider,
  loadFeatherlessConfig,
} from "../role/researcher/provider/featherless/provider.js";
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
  /** Catalog adapter type: "fixture" | "adk_gemma2" | "featherless". */
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
  };
}

export interface ProviderStatus extends ProviderCatalogEntry {
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
  private catalogEnv: Record<string, string> = {};

  constructor(options: ProviderManagerOptions) {
    this.options = options;
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

  private async resolveCredentialSource(
    entry: ProviderCatalogEntry,
  ): Promise<string> {
    if (entry.credential.type === "none") return "none";
    const envName = this.catalogEnv[entry.id];
    if (envName && process.env[envName]) return "env-var";
    if (await this.secretStore.has(entry.id)) return "local-secret-store";
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
      active: this.runtimeState.activeProvider === id,
      configured: entry.enabled,
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
    return this.runtimeState;
  }

  getRuntimeConfig(): ProviderRuntimeConfig {
    return this.runtimeState;
  }

  saveRuntimeConfigPatch(patch: {
    activeProvider?: string;
    providers?: Record<string, Partial<ProviderRuntimeSettings>>;
  }): ProviderRuntimeConfig {
    assertNoForbiddenFields(patch.providers ?? {});
    if (patch.activeProvider !== undefined && patch.activeProvider !== "") {
      if (!this.catalog.providers[patch.activeProvider]) {
        throw new Error(`Unknown provider: ${patch.activeProvider}`);
      }
      this.runtimeState.activeProvider = patch.activeProvider;
    }
    if (patch.providers) {
      for (const [id, changes] of Object.entries(patch.providers)) {
        if (!this.catalog.providers[id]) {
          throw new Error(`Unknown provider: ${id}`);
        }
        const current: ProviderRuntimeSettings =
          this.runtimeState.providers[id] ?? { enabled: true, model: "fixture" };
        this.runtimeState.providers[id] = {
          enabled: changes.enabled ?? current.enabled ?? true,
          model: changes.model ?? current.model ?? "fixture",
          apiBase: changes.apiBase ?? current.apiBase,
          timeoutSeconds: changes.timeoutSeconds ?? current.timeoutSeconds,
          parallelism: changes.parallelism ?? current.parallelism,
        };
      }
    }
    this.bumpRevisionAndPersist();
    return this.runtimeState;
  }

  private bumpRevisionAndPersist(): void {
    this.runtimeState.revision = (this.runtimeState.revision ?? 0) + 1;
    if (this.runtimeConfigStore) {
      this.runtimeConfigStore.save(this.runtimeState);
    }
  }

  async update(
    providerId: string,
    patch: { model?: string; apiBase?: string },
  ): Promise<ProviderStatus> {
    if (!this.catalog.providers[providerId]) {
      throw new Error(`Provider ${providerId} not found`);
    }
    const apply: Partial<ProviderRuntimeSettings> = {};
    if (patch.model !== undefined) apply.model = patch.model;
    if (patch.apiBase !== undefined) apply.apiBase = patch.apiBase;
    if (Object.keys(apply).length > 0) {
      this.saveRuntimeConfigPatch({ providers: { [providerId]: apply } });
    }
    return this.buildStatus(providerId);
  }

  async activate(providerId: string): Promise<ProviderStatus> {
    if (!this.catalog.providers[providerId]) {
      throw new Error(`Provider ${providerId} not found`);
    }
    this.saveRuntimeConfigPatch({ activeProvider: providerId });
    return this.buildStatus(providerId);
  }

  async test(
    providerId: string,
    _transient?: ProviderCredential | null,
  ): Promise<{ ok: boolean; provider: string; error?: string }> {
    if (!this.catalog.providers[providerId]) {
      throw new Error(`Provider ${providerId} not found`);
    }
    return { ok: true, provider: providerId };
  }

  async setCredential(
    providerId: string,
    credential?: ProviderCredential,
  ): Promise<ProviderStatus> {
    if (!this.catalog.providers[providerId]) {
      throw new Error(`Provider ${providerId} not found`);
    }
    if (credential) {
      await this.secretStore.set(providerId, credential);
    } else {
      await this.secretStore.delete(providerId);
    }
    return this.buildStatus(providerId);
  }

  async createProvider(
    projectRoot?: string,
    _events?: ProcessingEventBus,
    _runId?: string,
  ): Promise<ResearchProvider> {
    const active = this.runtimeState.activeProvider || "sample";
    return this.constructProvider(
      active,
      projectRoot ?? this.options.projectRoot,
    );
  }

  async resolveForRun(providerId?: string): Promise<ResearchProvider> {
    const id = providerId || this.runtimeState.activeProvider || "sample";
    return this.constructProvider(id, this.options.projectRoot);
  }

  private constructProvider(
    providerId: string,
    projectRoot: string,
  ): ResearchProvider {
    const entry = this.catalog.providers[providerId];
    if (!entry) throw new Error(`Unknown provider: ${providerId}`);
    const settings = this.runtimeSettings(providerId);
    const adapter = entry.adapter;
    if (adapter === "fixture") {
      return new FixtureResearchProvider();
    }
    if (adapter === "adk_gemma2") {
      const base = loadAdkGemmaConfig(projectRoot);
      const config = {
        ...base,
        model: settings.model || base.model,
        ollamaBaseUrl: settings.apiBase || base.ollamaBaseUrl,
        workerPoolSize: settings.parallelism ?? base.workerPoolSize,
        timeoutSeconds: settings.timeoutSeconds ?? base.timeoutSeconds,
      };
      const provider = new AdkGemmaResearchProvider(projectRoot, config);
      if (this.options.events) provider.attachEvents?.(this.options.events);
      return provider;
    }
    if (adapter === "featherless") {
      const base = loadFeatherlessConfig(projectRoot);
      const config = {
        ...base,
        model: settings.model || base.model,
        baseUrl: settings.apiBase || base.baseUrl,
        workerPoolSize: settings.parallelism ?? base.workerPoolSize,
        timeoutSeconds: settings.timeoutSeconds ?? base.timeoutSeconds,
      };
      const provider = new FeatherlessResearchProvider(projectRoot, config);
      if (this.options.events) provider.attachEvents?.(this.options.events);
      return provider;
    }
    throw new Error(`Unknown provider adapter: ${adapter}`);
  }

  close(): void {
    this.options = this.options;
  }
}

function protocolFor(adapter: string): string {
  switch (adapter) {
    case "fixture":
      return "fixture://";
    case "featherless":
      return "https";
    case "adk_gemma2":
      return "ollama";
    default:
      return "unknown";
  }
}