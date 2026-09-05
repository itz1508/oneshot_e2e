/**
 * transport — provider-layer HTTP transport helpers only.
 *
 * This module knows NOTHING about OneShot's ResearchDraft/Plan/Builder: it
 * provides the shared ModelProviderConfig shape, credential redaction, and a
 * generic HTTP/network error fallback. Provider-specific error payloads are
 * interpreted by each adapter, which then normalizes into the Phase 4A
 * categories; the generic mapping here is a last-resort fallback only.
 */

export interface ModelProviderConfig {
  model: string;
  baseUrl?: string;
  apiKey?: string;
  timeoutSeconds: number;
  maxOutputTokens?: number;
  temperature?: number;
  /** Injectable transport for deterministic tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** Redact the credential from any error/message surface. */
export function redactSecret(text: string, secret?: string): string {
  if (!secret) return text;
  return text.split(secret).join("[REDACTED]");
}

/** Generic fallback normalization — adapters should prefer payload-aware mapping. */
export function fallbackHttpCategory(status: number | undefined): string {
  if (status === 401 || status === 403) return "PROVIDER_AUTH_FAILURE";
  if (status !== undefined && status >= 500) return "PROVIDER_INTERNAL_FAILURE";
  if (status !== undefined) return "PROVIDER_NETWORK_FAILURE";
  return "PROVIDER_INTERNAL_FAILURE";
}

export function httpFailureDetail(
  provider: string,
  status: number | undefined,
  bodyPreview: string,
): string {
  const preview = bodyPreview.replace(/\s+/g, " ").trim().slice(0, 200);
  return `${provider} request failed with HTTP ${status ?? "unknown"}${preview ? ` — ${preview}` : ""}`;
}

export function networkFailureDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `PROVIDER_NETWORK_FAILURE: ${message}`;
}