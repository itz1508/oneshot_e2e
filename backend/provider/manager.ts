import { join } from "node:path";
import type { ProcessingEventBus } from "../runtime/event-bus.js";
import { createModelProvider } from "./adapter/index.js";
import { PROVIDERS, providerDefinition } from "./catalog.js";
import type { ModelProvider } from "./model-provider.js";
import type {
  ProviderCredential,
  ProviderSecretStore,
} from "./secret-store.js";
import { LocalFileSecretStore } from "./secret-store.js";
import {
  DEFAULTS,
  FileProviderRuntimeConfigStore,
  assertNoForbiddenFields,
  seedConfig,
} from "./runtime-config.js";
import type {
  ProviderRuntimeConfig,
  ProviderRuntimeConfigStore,
  ProviderRuntimeSettings,
} from "./runtime-config.js";

export interface ProviderCatalogEntry {
  id: string;
  providerId: string;
  displayName: string;
  adapter: string;
  protocol: string;
  apiBaseUrl: string;
  model: string;
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
  credentialType: string;
  credentialSource: string;
  configured: boolean;
  active: boolean;
}

export interface ProviderManagerOptions {
  projectRoot: string;
  events?: ProcessingEventBus;
  /** @deprecated Provider catalog is backend-owned and static. */
  catalogPath?: string;
  runtimePaths?: { root: string; config: string };
  secretStore?: ProviderSecretStore;
  runtimeConfigStore?: ProviderRuntimeConfigStore;
  mode?: "production" | "sample" | "test";
}

export interface CapturedProvider {
  id: string;
  model: string;
  configRevision: number;
  settings?: ProviderRuntimeSettings;
}

const DEFAULT_PROVIDER_ID = "<default>";

export class ProviderManager {
  readonly catalog: { providers: Record<string, ProviderCatalogEntry> } = {
    providers: {},
  };
  readonly mode: "production" | "sample" | "test";
  readonly projectRoot: string;
  private readonly events?: ProcessingEventBus;
  private readonly runtimePaths?: { root: string; config: string };
  private readonly secretStore: ProviderSecretStore;
  private readonly runtimeConfigStore?: ProviderRuntimeConfigStore;
  private runtimeState: ProviderRuntimeConfig;

  constructor(options: ProviderManagerOptions) {
    this.projectRoot = options.projectRoot;
    this.events = options.events;
    const mode = options.mode ?? process.env.ONESHOT_MODE ?? "production";
    if (!["production", "sample", "test"].includes(mode)) {
      throw new Error("Invalid runtime mode");
    }
    this.mode = mode as typeof this.mode;
    this.runtimePaths = options.runtimePaths;
    this.secretStore = options.secretStore ?? new LocalFileSecretStore();
    this.runtimeConfigStore =
      options.runtimeConfigStore ?? this.defaultRuntimeConfigStore();
    this.runtimeState = this.runtimeConfigStore?.load() ?? seedConfig();

    for (const definition of Object.values(PROVIDERS)) {
      const defaults = this.runtimeDefaults(definition.id);
      this.catalog.providers[definition.id] = {
        id: definition.id,
        providerId: definition.id,
        displayName: definition.displayName,
        adapter: definition.id,
        protocol: definition.protocol,
        apiBaseUrl: definition.defaultApiBase,
        model: defaults.model,
        credential: {
          type: definition.credentialType,
          source: "none",
          configured: false,
        },
        enabled: true,
        editable: true,
        runtime: {
          model: defaults.model,
          apiBase: defaults.apiBase,
          timeoutSeconds: defaults.timeoutSeconds ?? 300,
          maxConcurrency: defaults.parallelism ?? 2,
        },
      };
    }

    this.runtimeState.providers = Object.fromEntries(
      Object.entries(this.runtimeState.providers).filter(([id]) =>
        Boolean(providerDefinition(id)),
      ),
    );
    if (
      this.runtimeState.activeProvider !== DEFAULT_PROVIDER_ID &&
      !providerDefinition(this.runtimeState.activeProvider)
    ) {
      this.runtimeState.activeProvider = DEFAULT_PROVIDER_ID;
      this.bumpRevisionAndPersist();
    }
  }

  private defaultRuntimeConfigStore(): ProviderRuntimeConfigStore | undefined {
    if (!this.runtimePaths?.config) return undefined;
    return new FileProviderRuntimeConfigStore(
      join(this.runtimePaths.config, "providers.json"),
    );
  }

  private runtimeDefaults(id: string): ProviderRuntimeSettings {
    const definition = providerDefinition(id);
    const persistedDefault = DEFAULTS[id];
    return {
      enabled: persistedDefault?.enabled ?? true,
      model: persistedDefault?.model ?? definition?.defaultModel ?? "",
      apiBase: persistedDefault?.apiBase ?? definition?.defaultApiBase,
      timeoutSeconds: persistedDefault?.timeoutSeconds ?? 300,
      parallelism: persistedDefault?.parallelism ?? 2,
      temperature: persistedDefault?.temperature,
    };
  }

  private runtimeSettings(id: string): ProviderRuntimeSettings {
    const current = this.runtimeState.providers[id];
    const defaults = this.runtimeDefaults(id);
    return {
      enabled: current?.enabled ?? defaults.enabled,
      model: current?.model || defaults.model,
      apiBase: current?.apiBase ?? defaults.apiBase,
      timeoutSeconds: current?.timeoutSeconds ?? defaults.timeoutSeconds,
      parallelism: current?.parallelism ?? defaults.parallelism,
      temperature: current?.temperature,
    };
  }

  publicNameFor(id: string): string {
    return providerDefinition(id)?.displayName ?? DEFAULT_PROVIDER_ID;
  }

  private async credentialValue(
    id: string,
    transient?: ProviderCredential,
  ): Promise<string> {
    if (transient) return transient.value;
    const definition = providerDefinition(id);
    if (!definition) return "";
    return (
      process.env[definition.envVar]?.trim() ||
      (definition.fallbackEnvVar
        ? process.env[definition.fallbackEnvVar]?.trim()
        : "") ||
      (await this.secretStore.get(id))?.value ||
      ""
    );
  }

  private async credentialSource(id: string): Promise<string> {
    const definition = providerDefinition(id);
    if (!definition) return "none";
    if (
      process.env[definition.envVar]?.trim() ||
      (definition.fallbackEnvVar &&
        process.env[definition.fallbackEnvVar]?.trim())
    ) {
      return "env-var";
    }
    return (await this.secretStore.has(id)) ? "local-secret-store" : "none";
  }

  private async buildStatus(id: string): Promise<ProviderStatus> {
    const definition = providerDefinition(id);
    const entry = this.catalog.providers[id];
    if (!definition || !entry) throw new Error(`Unknown provider: ${id}`);
    const settings = this.runtimeSettings(id);
    const source = await this.credentialSource(id);
    const configured = source !== "none";
    return {
      ...entry,
      supportsTemperature: definition.supportsTemperature(settings.model),
      credentialType: definition.credentialType,
      credentialSource: source,
      configured,
      active: this.runtimeState.activeProvider === id,
      enabled: entry.enabled && settings.enabled,
      model: settings.model,
      apiBaseUrl: settings.apiBase ?? definition.defaultApiBase,
      credential: {
        type: definition.credentialType,
        source,
        configured,
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
    return Promise.all(Object.keys(this.catalog.providers).map((id) => this.buildStatus(id)));
  }

  async getProviderStatus(providerId: string): Promise<ProviderStatus> {
    return this.buildStatus(providerId);
  }

  async get(providerId: string): Promise<ProviderStatus | undefined> {
    if (!providerDefinition(providerId)) return undefined;
    return this.buildStatus(providerId);
  }

  runtimeConfig(): ProviderRuntimeConfig {
    return structuredClone(this.runtimeState);
  }

  getRuntimeConfig(): ProviderRuntimeConfig {
    return this.runtimeConfig();
  }

  saveRuntimeConfigPatch(patch: {
    activeProvider?: string;
    providers?: Record<string, Partial<ProviderRuntimeSettings>>;
  }): ProviderRuntimeConfig {
    assertNoForbiddenFields(patch);
    const next = structuredClone(this.runtimeState);
    if (patch.activeProvider !== undefined) {
      if (
        patch.activeProvider !== DEFAULT_PROVIDER_ID &&
        !providerDefinition(patch.activeProvider)
      ) {
        throw new Error("Unknown provider");
      }
      next.activeProvider = patch.activeProvider;
    }

    for (const [id, changes] of Object.entries(patch.providers ?? {})) {
      if (!providerDefinition(id)) throw new Error("Unknown provider");
      const allowed = [
        "enabled",
        "model",
        "apiBase",
        "timeoutSeconds",
        "parallelism",
        "temperature",
      ];
      if (Object.keys(changes).some((key) => !allowed.includes(key))) {
        throw new Error("Unknown provider setting");
      }
      const settings = { ...this.runtimeSettings(id), ...changes };
      if (
        typeof settings.enabled !== "boolean" ||
        typeof settings.model !== "string" ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(settings.model)
      ) {
        throw new Error("Invalid provider model or enabled setting");
      }
      if (
        settings.timeoutSeconds !== undefined &&
        (!Number.isInteger(settings.timeoutSeconds) ||
          settings.timeoutSeconds < 1 ||
          settings.timeoutSeconds > 900)
      ) {
        throw new Error("Invalid provider timeout");
      }
      if (
        settings.parallelism !== undefined &&
        (!Number.isInteger(settings.parallelism) ||
          settings.parallelism < 1 ||
          settings.parallelism > 16)
      ) {
        throw new Error("Invalid provider parallelism");
      }
      if (
        settings.temperature !== undefined &&
        (!Number.isFinite(settings.temperature) ||
          settings.temperature < 0 ||
          settings.temperature > (id === "anthropic" ? 1 : 2))
      ) {
        throw new Error("Invalid temperature");
      }
      if (settings.apiBase) {
        const url = new URL(settings.apiBase);
        if (
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          !(
            url.protocol === "https:" ||
            (url.protocol === "http:" &&
              ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
          )
        ) {
          throw new Error(
            "Provider URL must use HTTPS without credentials or query parameters",
          );
        }
      }
      next.providers[id] = settings;
    }

    if (
      next.activeProvider !== DEFAULT_PROVIDER_ID &&
      !next.providers[next.activeProvider]?.enabled
    ) {
      next.activeProvider = DEFAULT_PROVIDER_ID;
    }
    this.runtimeState = next;
    this.bumpRevisionAndPersist();
    return this.runtimeConfig();
  }

  private bumpRevisionAndPersist(): void {
    this.runtimeState.revision = (this.runtimeState.revision ?? 0) + 1;
    this.runtimeConfigStore?.save(this.runtimeState);
  }

  async update(
    providerId: string,
    patch: { model?: string; apiBase?: string; temperature?: number },
  ): Promise<ProviderStatus> {
    if (!providerDefinition(providerId)) throw new Error(`Provider ${providerId} not found`);
    const apply: Partial<ProviderRuntimeSettings> = {};
    if (patch.model !== undefined) apply.model = patch.model;
    if (patch.apiBase !== undefined) apply.apiBase = patch.apiBase;
    if (patch.temperature !== undefined) apply.temperature = patch.temperature;
    if (Object.keys(apply).length) {
      this.saveRuntimeConfigPatch({ providers: { [providerId]: apply } });
    }
    return this.buildStatus(providerId);
  }

  async activate(providerId: string): Promise<ProviderStatus> {
    if (!providerDefinition(providerId)) throw new Error(`Provider ${providerId} not found`);
    const status = await this.buildStatus(providerId);
    if (!status.enabled || !status.credential.configured) {
      throw new Error("Provider requires an enabled configuration and credential");
    }
    this.saveRuntimeConfigPatch({ activeProvider: providerId });
    return this.buildStatus(providerId);
  }

  async setCredential(
    providerId: string,
    credential?: ProviderCredential,
  ): Promise<ProviderStatus> {
    if (!providerDefinition(providerId)) throw new Error(`Provider ${providerId} not found`);
    if (credential) {
      if (
        credential.providerId !== providerId ||
        credential.credentialType !== "api_key" ||
        !credential.value.trim()
      ) {
        throw new Error("Invalid credential");
      }
      await this.secretStore.set(providerId, credential);
    } else {
      await this.secretStore.delete(providerId);
      if (
        this.runtimeState.activeProvider === providerId &&
        !(await this.credentialValue(providerId))
      ) {
        this.runtimeState.activeProvider = DEFAULT_PROVIDER_ID;
      }
    }
    this.bumpRevisionAndPersist();
    return this.buildStatus(providerId);
  }

  async test(
    providerId: string,
    transient?: ProviderCredential | null,
    overrides?: Partial<ProviderRuntimeSettings>,
  ): Promise<{ ok: boolean; provider: string; error?: string }> {
    if (!providerDefinition(providerId)) throw new Error(`Provider ${providerId} not found`);
    let model: ModelProvider | undefined;
    try {
      const settings = { ...this.runtimeSettings(providerId), ...overrides };
      model = await this.constructProvider(providerId, settings, transient ?? undefined);
      const readiness = await model.ready("connection-test");
      return readiness.ready
        ? { ok: true, provider: this.publicNameFor(providerId) }
        : {
            ok: false,
            provider: this.publicNameFor(providerId),
            error: readiness.detail || "Connection failed",
          };
    } catch {
      return {
        ok: false,
        provider: this.publicNameFor(providerId),
        error: "Provider connection failed; check credential, model, and endpoint",
      };
    } finally {
      model?.close?.();
    }
  }

  captureForRun(): CapturedProvider {
    if (this.mode === "sample") {
      return {
        id: "sample",
        model: "fixture",
        configRevision: this.runtimeState.revision,
      };
    }
    const id = this.runtimeState.activeProvider;
    if (id === DEFAULT_PROVIDER_ID || !providerDefinition(id)) {
      throw new Error("Configure and activate a provider before starting a run");
    }
    const settings = this.runtimeSettings(id);
    if (!settings.enabled) throw new Error("Provider is disabled");
    return {
      id,
      model: settings.model,
      configRevision: this.runtimeState.revision,
      settings: structuredClone(settings),
    };
  }

  async resolveForRun(
    providerId?: string,
    captured?: {
      model?: string;
      configRevision?: number;
      settings?: ProviderRuntimeSettings;
    },
  ): Promise<ModelProvider | undefined> {
    const id = providerId || this.runtimeState.activeProvider;
    if (id === "sample" && this.mode === "sample") return undefined;
    if (!providerDefinition(id)) throw new Error("Unknown provider");
    if (
      captured?.configRevision !== undefined &&
      !captured.settings &&
      captured.configRevision !== this.runtimeState.revision
    ) {
      throw new Error(
        "Captured provider configuration is unavailable; resubmit the run",
      );
    }
    const settings =
      captured?.settings ??
      (captured?.model
        ? { ...this.runtimeSettings(id), model: captured.model }
        : this.runtimeSettings(id));
    return this.constructProvider(id, settings);
  }

  async createProvider(): Promise<ModelProvider | undefined> {
    const captured = this.captureForRun();
    return this.resolveForRun(captured.id, captured);
  }

  private async constructProvider(
    providerId: string,
    settings: ProviderRuntimeSettings,
    transient?: ProviderCredential,
  ): Promise<ModelProvider> {
    const definition = providerDefinition(providerId);
    if (!definition) throw new Error("Unknown provider");
    if (!settings.enabled) throw new Error("Provider is disabled");
    const apiKey = await this.credentialValue(providerId, transient);
    if (!apiKey) throw new Error("Provider credential is not configured");
    const model = createModelProvider(providerId, {
      apiKey,
      model: settings.model,
      apiBase: settings.apiBase ?? definition.defaultApiBase,
      timeoutSeconds: settings.timeoutSeconds ?? 300,
      maxOutputTokens: 4096,
      temperature: settings.temperature,
    });
    return model;
  }

  close(): void {
    // AI SDK provider clients are request-scoped and do not own worker pools.
  }
}
