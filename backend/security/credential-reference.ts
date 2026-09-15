/**
 * Credential reference (M11). A NON-SECRET pointer to where a credential lives.
 *
 * Secret values NEVER travel in this object and never enter:
 *   - ResolvedExecutionRoute (the route is non-secret by design)
 *   - Provider / endpoint / model definitions
 *   - Conversation records
 *   - Browser state / API responses
 *   - Logs
 *   - Canonical workflow artifacts
 *
 * Resolution happens server-side, at invocation time only, via CredentialResolver.
 * The reference itself may be carried per-invocation (RuntimeInvocation.credentialRef)
 * but is NOT permanently bound to a shared runtime instance (correction #5).
 */

/** Where a credential is resolved from. */
export type CredentialSource = "environment" | "session" | "secret-store" | "none";

/** Ownership/scope of a credential reference (correction #9). */
export type CredentialScope = "process" | "principal" | "run";

export interface CredentialReference {
  /** Stable id. NEVER the secret value. */
  readonly credentialId: string;
  readonly providerId: string;
  readonly source: CredentialSource;
  readonly scope: CredentialScope;
  /** Principal or run that owns a session/secret-store reference. Undefined for process scope. */
  readonly ownerId?: string;
  /** Only for source:"environment". Must be allowlisted (see provider-env-mapping). A browser request may never choose this freely. */
  readonly envVarName?: string;
  /** Only for source:"secret-store". Opaque reference into an external secret manager. */
  readonly secretStoreRef?: string;
}

/** Typed credential resolution failures (correction #7). */
export type CredentialResolveError =
  | "CREDENTIAL_RESOLVER_UNAVAILABLE"
  | "CREDENTIAL_NOT_FOUND"
  | "CREDENTIAL_DENIED"
  | "CREDENTIAL_INVALID_REFERENCE"
  | "CREDENTIAL_NOT_REQUIRED";

/** Typed credential error. Carries a machine-readable code, never a secret. */
export class CredentialError extends Error {
  readonly code: CredentialResolveError;
  constructor(code: CredentialResolveError, message: string) {
    super(`${code}: ${message}`);
    this.name = "CredentialError";
    this.code = code;
  }
}

/** True when a reference carries no credential (e.g. local Ollama). Only "none" may resolve to undefined without error. */
export function isNoneRef(ref: CredentialReference): boolean {
  return ref.source === "none";
}

/** Structural equality of two references (by identity fields, never by secret). */
export function sameRef(
  a: CredentialReference,
  b: CredentialReference,
): boolean {
  return (
    a.credentialId === b.credentialId &&
    a.providerId === b.providerId &&
    a.source === b.source &&
    a.scope === b.scope &&
    (a.ownerId ?? "") === (b.ownerId ?? "")
  );
}

/**
 * A reference's providerId must match the target provider (correction #9). A
 * reference for one provider must not satisfy another without explicit policy.
 * Throws CREDENTIAL_INVALID_REFERENCE on mismatch.
 */
export function assertSameProvider(
  ref: CredentialReference,
  providerId: string,
): void {
  if (ref.providerId !== providerId) {
    throw new CredentialError(
      "CREDENTIAL_INVALID_REFERENCE",
      `credential ${ref.credentialId} belongs to provider '${ref.providerId}', not '${providerId}'`,
    );
  }
}

/** Redact a secret value to a non-revealing state token. Never returns the raw value. */
export function redactSecret(value: string | undefined | null): "set" | "unset" {
  return value && value.length > 0 ? "set" : "unset";
}

/** Build a "none" reference for a credential-free provider (e.g. Ollama). */
export function noneCredentialReference(providerId: string): CredentialReference {
  return {
    credentialId: `none:${providerId}`,
    providerId,
    source: "none",
    scope: "process",
  };
}
