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
import {
  createProviderAdapter,
  resolveProviderId,
} from "../role/researcher/provider/registry.js";
import type {
  ProviderCredential,
  ProviderSecretStore,
} from "./provider-secret-store.js";
import type { ResearchToolsConfig } from "./provider-runtime-config.js";
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
  /** Catalog adapter type: "fixture" | "gemini" | "featherless" | "openai" | "anthropic". */
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
  /** Optional normalized inference parameter (non-secret). */
  temperature?: number;
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

  /** Central historical-id alias resolution (e.g. google/adk_gemma2 → gemini). */
  private resolveId(id: string): string {
    return resolveProviderId(id);
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
      temperature: settings.temperature,
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
    const id = this.resolveId(providerId);
    if (!this.catalog.providers[id]) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    return this.buildStatus(id);
  }

  async get(providerId: string): Promise<ProviderStatus | undefined> {
    const id = this.resolveId(providerId);
    if (!this.catalog.providers[id]) return undefined;
    return this.buildStatus(id);
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
    researchTools?: ResearchToolsConfig;
  }): ProviderRuntimeConfig {
    assertNoForbiddenFields(patch.providers ?? {});
    if (patch.activeProvider !== undefined && patch.activeProvider !== "") {
      const active = this.resolveId(patch.activeProvider);
      if (!this.catalog.providers[active]) {
        throw new Error(`Unknown provider: ${patch.activeProvider}`);
      }
      this.runtimeState.activeProvider = active;
    }
    if (patch.providers) {
      for (const [rawId, changes] of Object.entries(patch.providers)) {
        const id = this.resolveId(rawId);
        if (!this.catalog.providers[id]) {
          throw new Error(`Unknown provider: ${rawId}`);
        }
        const current: ProviderRuntimeSettings =
          this.runtimeState.providers[id] ?? { enabled: true, model: "fixture" };
        this.runtimeState.providers[id] = {
          enabled: changes.enabled ?? current.enabled ?? true,
          model: changes.model ?? current.model ?? "fixture",
          apiBase: changes.apiBase ?? current.apiBase,
          timeoutSeconds: changes.timeoutSeconds ?? current.timeoutSeconds,
          parallelism: changes.parallelism ?? current.parallelism,
          temperature: changes.temperature ?? current.temperature,
        };
      }
    }
    // Research-tool configuration is non-secret (Tavily enablement/params).
    // Tavily is a research TOOL: enabling it never changes the model provider.
    if (patch.researchTools) {
      const tavily = patch.researchTools.tavily ?? {};
      const current = this.runtimeState.researchTools?.tavily ?? {};
      this.runtimeState.researchTools = {
        tavily: {
          enabled: tavily.enabled ?? current.enabled,
          searchDepth: tavily.searchDepth ?? current.searchDepth,
          maxResults: tavily.maxResults ?? current.maxResults,
        },
      };
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
    const id = this.resolveId(providerId);
    if (!this.catalog.providers[id]) {
      throw new Error(`Provider ${providerId} not found`);
    }
    const apply: Partial<ProviderRuntimeSettings> = {};
    if (patch.model !== undefined) apply.model = patch.model;
    if (patch.apiBase !== undefined) apply.apiBase = patch.apiBase;
    if (Object.keys(apply).length > 0) {
      this.saveRuntimeConfigPatch({ providers: { [id]: apply } });
    }
    return this.buildStatus(id);
  }

  async activate(providerId: string): Promise<ProviderStatus> {
    const id = this.resolveId(providerId);
    if (!this.catalog.providers[id]) {
      throw new Error(`Provider ${providerId} not found`);
    }
    this.saveRuntimeConfigPatch({ activeProvider: id });
    return this.buildStatus(id);
  }

  async test(
    providerId: string,
    transient?: ProviderCredential | null,
  ): Promise<ProviderTestResult> {
    const id = this.resolveId(providerId);
    const entry = this.catalog.providers[id];
    if (!entry) throw new Error(`Provider ${providerId} not found`);
    const settings = this.runtimeSettings(id);
    const model = entry.adapter === "fixture" ? undefined : settings.model;

    // Resolve the credential WITHOUT persisting a transient one. Precedence:
    // explicit transient value (probe-only) → server-side stored credential.
    // The value is only handed to the provider adapter for the probe.
    let credentialValue: string | undefined;
    if (entry.credential.type !== "none") {
      if (transient && typeof transient.value === "string" && transient.value) {
        credentialValue = transient.value;
      } else {
        const stored = await this.secretStore.get(id);
        credentialValue = stored?.value;
      }
    }

    let provider: ResearchProvider;
    try {
      provider = this.constructProvider(
        id,
        this.options.projectRoot,
        credentialValue,
      );
    } catch (error) {
      return {
        ok: false,
        provider: id,
        model,
        category: "PROVIDER_CONFIGURATION_FAILURE",
        message: PROVIDER_TEST_MESSAGES.PROVIDER_CONFIGURATION_FAILURE,
        detail: safeProbeDetail(error),
        retryable: false,
      };
    }

    try {
      const readiness = await withTimeout(
        provider.ready(`provider-test:${id}`),
        probeTimeoutMs(settings.timeoutSeconds),
      );
      if (readiness.ready) {
        return {
          ok: true,
          provider: id,
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
        provider: id,
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
        provider: id,
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
    const id = this.resolveId(providerId);
    if (!this.catalog.providers[id]) {
      throw new Error(`Provider ${providerId} not found`);
    }
    if (credential) {
      await this.secretStore.set(id, {
        ...credential,
        providerId: id,
      });
    } else {
      await this.secretStore.delete(id);
    }
    return this.buildStatus(id);
  }

  /**
   * Research-TOOL credential boundary (Tavily). Deliberately separate from
   * model providers: tools never appear in the ModelProvider registry, the
   * provider catalog, queue payloads, or run snapshots. Write-only from the
   * browser's perspective.
   */
  async setToolCredential(
    toolId: string,
    credential?: ProviderCredential,
  ): Promise<void> {
    if (toolId !== "tavily") {
      throw new Error(`Unknown research tool: ${toolId}`);
    }
    if (credential) {
      await this.secretStore.set(toolId, {
        ...credential,
        providerId: toolId,
      });
    } else {
      await this.secretStore.delete(toolId);
    }
  }

  async getToolCredential(
    toolId: string,
  ): Promise<ProviderCredential | undefined> {
    if (toolId !== "tavily") {
      throw new Error(`Unknown research tool: ${toolId}`);
    }
    return this.secretStore.get(toolId);
  }

  async createProvider(
    projectRoot?: string,
    _events?: ProcessingEventBus,
    _runId?: string,
  ): Promise<ResearchProvider> {
    const active = this.resolveId(
      this.runtimeState.activeProvider || "sample",
    );
    return this.constructProvider(
      active,
      projectRoot ?? this.options.projectRoot,
    );
  }

  async resolveForRun(
    providerId?: string,
    modelOverride?: string,
  ): Promise<ResearchProvider> {
    const requested = providerId || this.runtimeState.activeProvider || "sample";
    const id = this.resolveId(requested);
    const toolCredentials = await this.resolveResearchToolCredentials();
    return this.constructProvider(
      id,
      this.options.projectRoot,
      undefined,
      modelOverride,
      toolCredentials,
    );
  }

  /**
   * Server-side resolution of OPTIONAL research-tool credentials (BYOK).
   * Tavily is a research TOOL, not a model provider: its key never enters
   * the ModelProvider registry, queue payloads, or run snapshots.
   */
  private async resolveResearchToolCredentials(): Promise<{
    tavily?: { apiKey?: string };
  }> {
    const tavily = await this.secretStore.get("tavily");
    return { tavily: { apiKey: tavily?.value } };
  }

  protected constructProvider(
    providerId: string,
    projectRoot: string,
    credentialValue?: string,
    modelOverride?: string,
    toolCredentials?: { tavily?: { apiKey?: string } },
  ): ResearchProvider {
    const entry = this.catalog.providers[providerId];
    if (!entry) throw new Error(`Unknown provider: ${providerId}`);
    // Provider-specific construction details live in the adapter registry.
    // A captured modelOverride pins the queued run's model snapshot.
    const settings = this.runtimeSettings(providerId);
    return createProviderAdapter(entry.adapter, {
      projectRoot,
      settings:
        modelOverride !== undefined
          ? { ...settings, model: modelOverride }
          : settings,
      credentialValue,
      researchTools: this.runtimeState.researchTools,
      toolCredentials,
      events: this.options.events,
    });
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
    case "openai":
    case "anthropic":
      return "https";
    case "gemini":
      return "google-genai";
    default:
      return "unknown";
  }
}