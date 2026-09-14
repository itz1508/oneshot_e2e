import { URL } from "node:url";

export interface IntegrationPackageSpec {
  id: string;
  displayName: string;
  packageName: string;
  packageVersion: string;
  factoryExport: string;
  apiKeyEnv: string;
  baseURLEnv?: string;
  /** Canonical provider endpoint used when the user does not supply a base URL. */
  defaultBaseURL?: string;
  modelEnv: string;
  defaultModel: string;
  bundled: boolean;
}

/**
 * Curated install metadata only. OneShot does not implement vendor SDK behavior;
 * the installed package owns that implementation.
 *
 * `defaultBaseURL` is a verified per-provider constant (never `api.<id>.com`
 * string-concatenated — several providers do not follow that pattern). It lets
 * a user configure a known provider with an API key alone; the base URL is
 * resolved server-side and validated before it is stored.
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
    defaultBaseURL: "https://generativelanguage.googleapis.com",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-2.5-flash",
    bundled: true,
  },
  openai: {
    id: "openai",
    displayName: "OpenAI",
    packageName: "@ai-sdk/openai",
    packageVersion: "4.0.65",
    factoryExport: "createOpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    baseURLEnv: "OPENAI_BASE_URL",
    defaultBaseURL: "https://api.openai.com/v1",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-5-mini",
    bundled: false,
  },
  anthropic: {
    id: "anthropic",
    displayName: "Anthropic",
    packageName: "@ai-sdk/anthropic",
    packageVersion: "4.0.52",
    factoryExport: "createAnthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    baseURLEnv: "ANTHROPIC_BASE_URL",
    defaultBaseURL: "https://api.anthropic.com",
    modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-4-5",
    bundled: false,
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

/** Reject link-local, loopback, private, and carrier-grade v4 literals. */
function isBlockedIPv4(host: string): boolean {
  const parts = host.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true; // 10/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 169 && b === 254) return true; // link-local 169.254/16
  if (a === 0 || a === 127) return true; // 0/8, loopback 127/8
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade 100.64/10
  return false;
}

/**
 * Resolve the base URL for a provider. When the user supplies a base URL it is
 * validated (http/https only, no userinfo, no localhost/private/link-local);
 * otherwise the curated `defaultBaseURL` is used. Throws on an unsafe value.
 * Mirrors the plan's §13.3 outbound URL policy.
 */
export function resolveIntegrationBaseURL(id: string, provided?: string): string {
  const spec = integrationPackageSpec(id);
  const value = (provided || "").trim();
  if (!value) {
    if (spec.defaultBaseURL) return spec.defaultBaseURL;
    throw new Error(`integration ${id} requires a base URL`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`invalid base URL for ${id}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`base URL for ${id} must use http or https`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`base URL for ${id} must not contain userinfo`);
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error(`base URL for ${id} must use an internet-reachable host`);
  }
  if (isBlockedIPv4(host)) {
    throw new Error(`base URL for ${id} must use an internet-reachable host`);
  }
  return value.replace(/\/+$/, "");
}
