/**
 * Header allowlist (M11, correction #6).
 *
 * Rejects — does NOT silently drop — dangerous custom headers. Returns a
 * normalized HEADER_NOT_ALLOWED error listing safe header names only. Checks
 * are case-insensitive. Custom headers are validated FIRST; OneShot-managed
 * authentication headers are added AFTER custom validation, never overridable by
 * custom input.
 */

/** Normalized error thrown when a custom header is forbidden or not permitted. */
export class HeaderNotAllowedError extends Error {
  readonly safeNames: readonly string[];
  constructor(safeNames: readonly string[]) {
    super(
      `HEADER_NOT_ALLOWED: forbidden header in custom headers; allowed: ${
        safeNames.length ? safeNames.join(", ") : "(none)"
      }`,
    );
    this.name = "HeaderNotAllowedError";
    this.safeNames = safeNames;
  }
}

// Hop-by-hop (RFC 7230 §6.1), plus dangerous/conflicting headers OneShot owns.
const FORBIDDEN_HEADERS = new Set<string>([
  // hop-by-hop
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  // host / cookies
  "host",
  "cookie",
  "set-cookie",
  // conflicting auth — OneShot manages credentials, not user-supplied headers
  "authorization",
  "x-api-key",
  // transport-managed
  "content-length",
  "content-type",
  // forwarding / spoofing surface
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "forwarded",
]);

/** True when a header name is forbidden (case-insensitive; also blocks any `Proxy-*`). */
export function isForbiddenHeaderName(name: string): boolean {
  const lower = (name || "").toLowerCase();
  if (!lower) return true;
  if (FORBIDDEN_HEADERS.has(lower)) return true;
  if (lower.startsWith("proxy-")) return true;
  return false;
}

export interface AllowedHeaderSet {
  /**
   * Validate custom headers. Throws HeaderNotAllowedError (listing safe names
   * only) on the first forbidden/unpermitted name. Returns the safe subset with
   * lowercased names.
   */
  validate(
    customHeaders: Readonly<Record<string, string>>,
  ): Record<string, string>;
  /** Names this set permits (for error messages). */
  permittedNames(): readonly string[];
}

/**
 * Build an allowlist from a provider's declared `allowedHeaders`. The effective
 * permitted set is the provider's list MINUS anything forbidden, so a provider
 * can never widen into a dangerous name. If the provider declares nothing, no
 * custom header is permitted (fail-closed).
 */
export function createHeaderAllowlist(
  providerAllowedHeaders: readonly string[] = [],
): AllowedHeaderSet {
  const permitted = new Set<string>();
  for (const h of providerAllowedHeaders) {
    const lower = (h || "").toLowerCase();
    if (lower && !isForbiddenHeaderName(lower)) permitted.add(lower);
  }
  const safe = [...permitted].sort();
  return {
    validate: (customHeaders) => {
      const out: Record<string, string> = {};
      for (const [name, value] of Object.entries(customHeaders)) {
        const lower = (name || "").toLowerCase();
        if (isForbiddenHeaderName(lower) || !permitted.has(lower)) {
          throw new HeaderNotAllowedError(safe);
        }
        out[lower] = String(value);
      }
      return out;
    },
    permittedNames: () => safe,
  };
}
