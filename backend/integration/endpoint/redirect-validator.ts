import type { UrlValidator } from "./url-validator.js";
import type { PortPolicy } from "./port-policy.js";
import { isMetadataHost } from "./metadata-blocklist.js";

/**
 * Redirect validator (M8). A redirect target MUST be re-validated (protocol,
 * port, metadata) before it is followed — prevents redirect-based SSRF to a
 * metadata IP. Pure.
 */
export interface RedirectValidationResult {
  readonly ok: boolean;
  readonly reason?: string;
}

export interface RedirectValidators {
  readonly url: UrlValidator;
  readonly port: PortPolicy;
}

export function validateRedirect(
  target: string,
  validators: RedirectValidators,
): RedirectValidationResult {
  const u = validators.url.validate(target);
  if (!u.ok) {
    return { ok: false, reason: `redirect target invalid: ${u.reason}` };
  }
  if (!validators.port.isAllowed(u.port)) {
    return { ok: false, reason: `redirect target port not allowed: ${u.port}` };
  }
  if (isMetadataHost(u.host)) {
    return {
      ok: false,
      reason: `redirect target is a metadata host: ${u.host}`,
    };
  }
  return { ok: true };
}
