/**
 * normalizeBaseUrl — trailing-slash normalization for provider base URLs.
 *
 * The research/LLM adapters resolve `${base}/chat/completions`. Callers must
 * never be able to cause a path traversal or a malformed double-slash after a
 * user- or preset-supplied base URL, so we collapse trailing slashes here and
 * nowhere else.
 */
export function normalizeBaseUrl(baseUrl: string | undefined | null): string {
  return (baseUrl ?? "").trim().replace(/\/+$/, "");
}