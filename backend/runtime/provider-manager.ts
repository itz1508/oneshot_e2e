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

/** Failure categories for provider connection/readiness probes (Phase 4A). */
export type ProviderTestCategory =
  | "PROVIDER_AUTH_FAILURE"
  | "PROVIDER_MODEL_FAILURE"
  | "PROVIDER_NETWORK_FAILURE"
  | "PROVIDER_CONFIGURATION_FAILURE"
  | "PROVIDER_INTERNAL_FAILURE";

/**
 * Normalized connection-test result. `ok: true` means the provider's real
 * readiness probe executed successfully — never merely that the catalog
 * entry, credential, or configuration exists. Never contains secrets.
 */
export interface ProviderTestResult {
  ok: boolean;
  provider: string;
  model?: string;
  category?: ProviderTestCategory;
  message: string;
  /** Safe, non-secret diagnostic detail from the probe. */
  detail?: string;
  retryable: boolean;
}

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
    transient?: ProviderCredential | null,
  ): Promise<ProviderTestResult> {
    const entry = this.catalog.providers[providerId];
    if (!entry) throw new Error(`Provider ${providerId} not found`);
    const settings = this.runtimeSettings(providerId);
    const model = entry.adapter === "fixture" ? undefined : settings.model;

    // Resolve the credential WITHOUT persisting a transient one. Precedence:
    // explicit transient value (probe-only) → server-side stored credential.
    // The value is only handed to the provider adapter for the probe.
    let credentialValue: string | undefined;
    if (entry.credential.type !== "none") {
      if (transient && typeof transient.value === "string" && transient.value) {
        credentialValue = transient.value;
      } else {
        const stored = await this.secretStore.get(providerId);
        credentialValue = stored?.value;
      }
    }

    let provider: ResearchProvider;
    try {
      provider = this.constructProvider(
        providerId,
        this.options.projectRoot,
        credentialValue,
      );
    } catch (error) {
      return {
        ok: false,
        provider: providerId,
        model,
        category: "PROVIDER_CONFIGURATION_FAILURE",
        message: PROVIDER_TEST_MESSAGES.PROVIDER_CONFIGURATION_FAILURE,
        detail: safeProbeDetail(error),
        retryable: false,
      };
    }

    try {
      const readiness = await withTimeout(
        provider.ready(`provider-test:${providerId}`),
        probeTimeoutMs(settings.timeoutSeconds),
      );
      if (readiness.ready) {
        return {
          ok: true,
          provider: providerId,
          model: readiness.models?.[0] ?? model,
          message:
            readiness.detail ||
            "Provider readiness verified by live readiness probe",
          retryable: false,
        };
      }
      const detail = safeProbeDetail(
        readiness.detail || "readiness probe returned not-ready",
        credentialValue,
      );
      const category = classifyProbeFailure(detail);
      return {
        ok: false,
        provider: providerId,
        model,
        category,
        message: PROVIDER_TEST_MESSAGES[category],
        detail,
        retryable: category === "PROVIDER_NETWORK_FAILURE",
      };
    } catch (error) {
      const detail = safeProbeDetail(error, credentialValue);
      const category = classifyProbeFailure(detail);
      return {
        ok: false,
        provider: providerId,
        model,
        category,
        message: PROVIDER_TEST_MESSAGES[category],
        detail,
        retryable:
          category === "PROVIDER_NETWORK_FAILURE" ||
          category === "PROVIDER_INTERNAL_FAILURE",
      };
    } finally {
      // Probe resources (worker pools, child processes) are always released.
      try {
        provider.close?.();
      } catch {
        // close is best-effort; probe result already carries the outcome.
      }
    }
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

  protected constructProvider(
    providerId: string,
    projectRoot: string,
    credentialValue?: string,
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
        apiKey: credentialValue ?? base.apiKey,
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
        apiKey: credentialValue ?? base.apiKey,
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

// ---------------------------------------------------------------------------
// Provider connection probe (Phase 4A)
// ---------------------------------------------------------------------------

const PROVIDER_TEST_MESSAGES: Record<ProviderTestCategory, string> = {
  PROVIDER_AUTH_FAILURE:
    "Authentication failed — the credential was rejected or is missing",
  PROVIDER_MODEL_FAILURE:
    "Model unavailable — the configured model was not accepted by the provider",
  PROVIDER_NETWORK_FAILURE:
    "Network failure — the provider could not be reached",
  PROVIDER_CONFIGURATION_FAILURE:
    "Configuration incomplete — required provider settings are missing or invalid",
  PROVIDER_INTERNAL_FAILURE:
    "Provider error — the readiness probe failed unexpectedly",
};

/**
 * Classify a probe failure into the normalized Phase 4A category.
 * Explicit category hints from worker health payloads take precedence;
 * otherwise safe, non-secret message text is matched with ordered rules.
 */
export function classifyProbeFailure(
  detail: string,
): ProviderTestCategory {
  const text = detail || "";
  const explicit = text.match(
    /PROVIDER_(AUTH|MODEL|NETWORK|CONFIGURATION|INTERNAL)_FAILURE/,
  );
  if (explicit) {
    return `PROVIDER_${explicit[1]}_FAILURE` as ProviderTestCategory;
  }
  if (
    /not configured|401|unauthorized|invalid[ _-]?api[ _-]?key|invalid_api_key|incorrect api key|authentication|api[ _-]?key|credential/i.test(
      text,
    )
  ) {
    return "PROVIDER_AUTH_FAILURE";
  }
  if (
    /model[s]?[^.\n]{0,60}(not available|not found|unavailable|does not exist|invalid|decommissioned|not returned)|(not available|not found|unavailable|not returned)[^.\n]{0,60}model/i.test(
      text,
    )
  ) {
    return "PROVIDER_MODEL_FAILURE";
  }
  if (
    /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|getaddrinfo|fetch failed|network|unreachable|connection (error|refused|reset|timed out)|timed?[ _-]?out/i.test(
      text,
    )
  ) {
    return "PROVIDER_NETWORK_FAILURE";
  }
  if (/not set|missing|incomplete|invalid config|is required/i.test(text)) {
    return "PROVIDER_CONFIGURATION_FAILURE";
  }
  return "PROVIDER_INTERNAL_FAILURE";
}

/** Non-secret, bounded diagnostic detail for probe results. Credential
 * values must never appear in probe output — providers sometimes echo the
 * rejected key in their error messages, so it is redacted here. */
function safeProbeDetail(error: unknown, redact?: string): string {
  let text = error instanceof Error ? error.message : String(error);
  if (redact) {
    text = text.split(redact).join("[REDACTED]");
  }
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}

function probeTimeoutMs(timeoutSeconds: number | undefined): number {
  const seconds = Number(timeoutSeconds);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds, 120) * 1000
    : 30_000;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`provider readiness probe timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
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