/**
 * Non-secret runtime provider configuration.
 *
 * Stored separately from the git-tracked catalog. Contains ONLY user
 * selections and non-secret settings (provider, model, base URL, timeouts,
 * parallelism, enabled/disabled). It MUST NEVER contain credentials.
 *
 * Default location: `.runtime/config/providers.json` (within the runtime
 * directory, git-ignored). Resolved via the central runtime-path abstraction.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface ProviderRuntimeSettings {
  enabled: boolean;
  model: string;
  /** Non-secret optional override base URL. */
  apiBase?: string;
  timeoutSeconds?: number;
  parallelism?: number;
  /** Optional normalized inference parameter; omitted where unsupported. */
  temperature?: number;
}

/** Non-secret configuration for OPTIONAL research tools (not model providers). */
export interface ResearchToolsConfig {
  tavily?: {
    enabled?: boolean;
    searchDepth?: "basic" | "advanced";
    maxResults?: number;
  };
}

export interface ProviderRuntimeConfig {
  version: number;
  activeProvider: string;
  /** Per-provider non-secret settings. Keys are catalog provider IDs. */
  providers: Record<string, ProviderRuntimeSettings>;
  /** Optional research-tool configuration (Tavily). Non-secret. */
  researchTools?: ResearchToolsConfig;
  /** Monotonic revision counter for cache invalidation by the UI. */
  revision: number;
}

export interface ProviderRuntimeConfigStore {
  load(): ProviderRuntimeConfig;
  save(config: ProviderRuntimeConfig): void;
  touchRevision(): void;
}

const DEFAULTS: Record<string, Partial<ProviderRuntimeSettings>> = {
  sample: { enabled: true, model: "fixture" },
  gemini: {
    enabled: true,
    model: "gemma2:9b",
    apiBase: "http://localhost:11434",
    timeoutSeconds: 300,
    parallelism: 2,
  },
  adk_gemma2: {
    enabled: true,
    model: "gemma2:9b",
    apiBase: "http://localhost:11434",
    timeoutSeconds: 300,
    parallelism: 2,
  },
  featherless: {
    enabled: true,
    model: "google/gemma-4-31B-it",
    apiBase: "https://api.featherless.ai/v1",
    timeoutSeconds: 300,
    parallelism: 2,
  },
  openai: {
    enabled: true,
    model: "gpt-4o-mini",
    apiBase: "https://api.openai.com/v1",
    timeoutSeconds: 300,
    parallelism: 2,
  },
  anthropic: {
    enabled: true,
    model: "claude-sonnet-4-5",
    apiBase: "https://api.anthropic.com",
    timeoutSeconds: 300,
    parallelism: 2,
  },
};

function seedConfig(): ProviderRuntimeConfig {
  // Default to sample provider; provider selection should come from
  // the ProviderManager configuration/API, not from environment variables.
  // Environment-influenced provider selection is handled by the ProviderManager
  // through the runtime config store, not by the seed function.
  return {
    version: 1,
    activeProvider: "sample",
    providers: {
      sample: { enabled: true, model: "fixture" },
      adk_gemma2: {
        enabled: true,
        model: "gemma2:9b",
        apiBase: "http://localhost:11434",
        timeoutSeconds: 300,
        parallelism: 2,
      },
      featherless: {
        enabled: true,
        model: "google/gemma-4-31B-it",
        apiBase: "https://api.featherless.ai/v1",
        timeoutSeconds: 300,
        parallelism: 2,
      },
    },
    revision: 0,
  };
}

/** Fields that must never appear in the runtime config (secrets only). */
const FORBIDDEN_FIELDS = [
  "apiKey",
  "api_key",
  "key",
  "credential",
  "secret",
  "token",
  "password",
].map((f) => f.toLowerCase());

function stripForbidden(obj: Record<string, unknown>): void {
  for (const f of FORBIDDEN_FIELDS) {
    if (f in obj) delete (obj as any)[f];
  }
}

/**
 * Throw if any secret-shaped field appears (at any depth) in the given object.
 * Used on the browser-facing patch path so invalid input is REJECTED rather
 * than silently stripped — the caller must know their payload was invalid.
 */
export function assertNoForbiddenFields(
  input: unknown,
  path = "providers",
): void {
  if (!input || typeof input !== "object") return;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = `${path}.${k}`;
    if (FORBIDDEN_FIELDS.includes(k.toLowerCase())) {
      throw new Error(`Forbidden field in runtime config patch: ${key}`);
    }
    assertNoForbiddenFields(v, key);
  }
}

/** Validate the structural shape of a loaded runtime config (no secrets). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateStructural(
  raw: unknown,
): ProviderRuntimeConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return undefined;
  const activeProvider =
    typeof r.activeProvider === "string" && r.activeProvider
      ? r.activeProvider
      : undefined;
  const providers =
    r.providers && typeof r.providers === "object" && !Array.isArray(r.providers)
      ? (r.providers as Record<string, unknown>)
      : {};
  if (!activeProvider) return undefined;

  const out: ProviderRuntimeConfig = {
    version: 1,
    activeProvider,
    providers: {},
    revision: typeof r.revision === "number" ? r.revision : 0,
  };

  for (const [id, v] of Object.entries(providers)) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    stripForbidden(o);
    const entry: ProviderRuntimeSettings = {
      enabled: o.enabled === undefined ? true : Boolean(o.enabled),
      model: typeof o.model === "string" && o.model ? o.model : "fixture",
      apiBase: typeof o.apiBase === "string" ? o.apiBase : undefined,
      timeoutSeconds:
        typeof o.timeoutSeconds === "number" ? o.timeoutSeconds : undefined,
      parallelism:
        typeof o.parallelism === "number" ? o.parallelism : undefined,
      temperature:
        typeof o.temperature === "number" ? o.temperature : undefined,
    };
    out.providers[id] = entry;
  }

  // Optional research-tool configuration (non-secret). Tavily enablement
  // controls whether web evidence is collected; it never selects a model.
  if (isRecord(r.researchTools) && isRecord(r.researchTools.tavily)) {
    const t = r.researchTools.tavily as Record<string, unknown>;
    out.researchTools = {
      tavily: {
        enabled: t.enabled === undefined ? undefined : Boolean(t.enabled),
        searchDepth:
          t.searchDepth === "basic" || t.searchDepth === "advanced"
            ? t.searchDepth
            : undefined,
        maxResults:
          typeof t.maxResults === "number" ? t.maxResults : undefined,
      },
    };
  }

  // Ensure the active provider exists, merging in defaults if absent.
  if (!out.providers[activeProvider]) {
    const d = DEFAULTS[activeProvider] ?? { model: "fixture" };
    out.providers[activeProvider] = {
      enabled: d.enabled ?? true,
      model: (d.model as string) ?? "fixture",
      apiBase: d.apiBase as string | undefined,
      timeoutSeconds: d.timeoutSeconds as number | undefined,
      parallelism: d.parallelism as number | undefined,
    };
  }
    return out;
}

export class FileProviderRuntimeConfigStore
  implements ProviderRuntimeConfigStore
{
  constructor(private path: string) {}

  load(): ProviderRuntimeConfig {
    if (!existsSync(this.path)) {
      const seeded = seedConfig();
      this.save(seeded);
      return seeded;
    }
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf8"));
      const parsed = validateStructural(raw);
      if (parsed) {
        const seeded = seedConfig();
        const merged = { ...seeded.providers, ...parsed.providers } as Record<
          string,
          ProviderRuntimeSettings
        >;
        return { ...parsed, providers: merged };
      }
    } catch {
      /* corrupt file — fall through to fresh seed */
    }
    const seeded = seedConfig();
    this.save(seeded);
    return seeded;
  }

  save(config: ProviderRuntimeConfig): void {
    const dir = dirname(this.path);
    mkdirSync(dir, { recursive: true });
    // Defensive: strip any credential-shaped fields before persistence.
    const cleaned = JSON.parse(
      JSON.stringify(config),
    ) as ProviderRuntimeConfig;
    for (const v of Object.values(cleaned.providers)) {
      const o = v as unknown as Record<string, unknown>;
      stripForbidden(o);
    }
    cleaned.revision = (config.revision ?? 0) + 1;
    cleaned.version = 1;
    writeFileSync(this.path, JSON.stringify(cleaned, null, 2) + "\n", "utf8");
  }

  touchRevision(): void {
    const cfg = this.load();
    cfg.revision = (cfg.revision ?? 0) + 1;
    this.save(cfg);
  }
}

export { seedConfig, validateStructural, DEFAULTS };
