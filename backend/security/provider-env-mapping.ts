/**
 * Approved environment-variable allowlist (M11, correction #4).
 *
 * The environment credential resolver may ONLY read variables on this explicit
 * allowlist. A browser/HTTP request can NEVER choose an arbitrary environment
 * variable name — there is no arbitrary `process.env[name]` lookup anywhere.
 *
 * Built-in providers map to explicitly approved variables:
 *   openai -> OPENAI_API_KEY
 *   groq   -> GROQ_API_KEY
 *   tavily -> TAVILY_API_KEY
 *
 * Custom providers may use only server-approved names matching:
 *   ^ONESHOT_PROVIDER_KEY_[A-Z0-9_]+$
 */

const BUILTIN_ENV_VARS: Readonly<Record<string, string>> = Object.freeze({
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  tavily: "TAVILY_API_KEY",
});

const CUSTOM_ENV_VAR_PATTERN = /^ONESHOT_PROVIDER_KEY_[A-Z0-9_]+$/;

/**
 * Resolve the approved env-var name for a provider, or undefined if not
 * approved. Built-ins are matched case-insensitively by provider id; custom
 * names must match the ONESHOT_PROVIDER_KEY_* pattern exactly.
 */
export function approvedEnvVarName(
  providerId: string,
  customName?: string,
): string | undefined {
  const id = (providerId || "").toLowerCase();
  if (BUILTIN_ENV_VARS[id]) return BUILTIN_ENV_VARS[id];
  if (customName && CUSTOM_ENV_VAR_PATTERN.test(customName)) return customName;
  return undefined;
}

/** True when a name is on the approved allowlist (built-in or ONESHOT_PROVIDER_KEY_*). Case-sensitive (env vars are case-sensitive on Linux). */
export function isApprovedEnvVarName(name: string): boolean {
  if ((Object.values(BUILTIN_ENV_VARS) as readonly string[]).includes(name)) {
    return true;
  }
  return CUSTOM_ENV_VAR_PATTERN.test(name);
}

export const BUILTIN_PROVIDER_ENV_VARS: Readonly<Record<string, string>> =
  BUILTIN_ENV_VARS;
export const CUSTOM_PROVIDER_ENV_VAR_PATTERN = CUSTOM_ENV_VAR_PATTERN.source;
