/**
 * Credential resolver (M11). A SERVICE held by a runtime; the runtime resolves
 * the CredentialReference PER invocation (correction #5). Secret values are
 * server-side, in-memory, never logged, never persisted, never returned.
 *
 * Fail-closed (correction #7): only source:"none" may resolve to undefined
 * (empty string) without error. An unavailable secret-store throws
 * CREDENTIAL_RESOLVER_UNAVAILABLE.
 */
import {
  CredentialError,
  type CredentialReference,
  isNoneRef,
} from "./credential-reference.js";
import { approvedEnvVarName } from "./provider-env-mapping.js";

export interface CredentialResolver {
  /**
   * Resolve a reference to its secret string. Throws CredentialError on
   * failure. Returns "" for source:"none". The returned value is in-memory only
   * and must be discarded by the caller after use.
   */
  resolve(ref: CredentialReference): Promise<string>;
  /** Redacted description for logs/API responses (never the value). */
  describe(ref: CredentialReference): {
    readonly source: CredentialReference["source"];
    readonly state: "set" | "unset";
  };
}

/** Environment-source resolver. Reads ONLY approved env vars (correction #4). */
export class EnvironmentCredentialResolver implements CredentialResolver {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}
  async resolve(ref: CredentialReference): Promise<string> {
    if (isNoneRef(ref)) return "";
    if (ref.source !== "environment") {
      throw new CredentialError(
        "CREDENTIAL_INVALID_REFERENCE",
        `environment resolver cannot resolve source '${ref.source}'`,
      );
    }
    const name = approvedEnvVarName(ref.providerId, ref.envVarName);
    if (!name) {
      throw new CredentialError(
        "CREDENTIAL_INVALID_REFERENCE",
        `no approved env var for provider '${ref.providerId}'${
          ref.envVarName ? ` (rejected name: ${ref.envVarName})` : ""
        }`,
      );
    }
    const value = this.env[name];
    if (value === undefined || value === "") {
      throw new CredentialError(
        "CREDENTIAL_NOT_FOUND",
        `approved env var '${name}' is not set`,
      );
    }
    return value;
  }
  describe(ref: CredentialReference) {
    if (isNoneRef(ref)) return { source: ref.source, state: "unset" as const };
    const name = approvedEnvVarName(ref.providerId, ref.envVarName);
    const v = name ? this.env[name] : undefined;
    const set = !!(v && v !== "");
    return {
      source: ref.source,
      state: set ? ("set" as const) : ("unset" as const),
    };
  }
}

/**
 * Session credential store (correction #2, #9). In-memory, expiring, clearable,
 * and owned. The policy gates who may call set(); a reference for one provider
 * cannot satisfy another; an expired entry is rejected.
 */
export interface SessionCredentialStore {
  set(ref: CredentialReference, value: string, ttlMs: number): void;
  get(ref: CredentialReference): string;
  has(ref: CredentialReference): boolean;
  clear(ownerId?: string): void;
  clearExpired(): number;
}

interface SessionEntry {
  value: string;
  expiresAt: number;
  ownerId?: string;
  providerId: string;
}

export class InMemorySessionCredentialStore implements SessionCredentialStore {
  private entries = new Map<string, SessionEntry>();
  constructor(private readonly clock: () => number = Date.now) {}
  set(ref: CredentialReference, value: string, ttlMs: number): void {
    if (ref.scope === "process") {
      throw new CredentialError(
        "CREDENTIAL_INVALID_REFERENCE",
        "process-scope reference cannot use the session store",
      );
    }
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new CredentialError(
        "CREDENTIAL_INVALID_REFERENCE",
        "session credential ttlMs must be a positive finite number",
      );
    }
    this.entries.set(ref.credentialId, {
      value,
      expiresAt: this.clock() + ttlMs,
      ownerId: ref.ownerId,
      providerId: ref.providerId,
    });
  }
  get(ref: CredentialReference): string {
    const e = this.entries.get(ref.credentialId);
    if (!e) {
      throw new CredentialError(
        "CREDENTIAL_NOT_FOUND",
        `session credential '${ref.credentialId}' not found`,
      );
    }
    if (this.clock() >= e.expiresAt) {
      this.entries.delete(ref.credentialId);
      throw new CredentialError(
        "CREDENTIAL_NOT_FOUND",
        `session credential '${ref.credentialId}' expired`,
      );
    }
    if (ref.providerId !== e.providerId) {
      throw new CredentialError(
        "CREDENTIAL_INVALID_REFERENCE",
        `session credential '${ref.credentialId}' provider mismatch`,
      );
    }
    if (e.ownerId && ref.ownerId && e.ownerId !== ref.ownerId) {
      throw new CredentialError(
        "CREDENTIAL_DENIED",
        `session credential '${ref.credentialId}' owned by another principal`,
      );
    }
    return e.value;
  }
  has(ref: CredentialReference): boolean {
    const e = this.entries.get(ref.credentialId);
    if (!e) return false;
    if (this.clock() >= e.expiresAt) {
      this.entries.delete(ref.credentialId);
      return false;
    }
    return ref.providerId === e.providerId;
  }
  clear(ownerId?: string): void {
    if (ownerId === undefined) {
      this.entries.clear();
      return;
    }
    for (const [k, v] of this.entries) {
      if (v.ownerId === ownerId) this.entries.delete(k);
    }
  }
  clearExpired(): number {
    const now = this.clock();
    let n = 0;
    for (const [k, v] of this.entries) {
      if (now >= v.expiresAt) {
        this.entries.delete(k);
        n++;
      }
    }
    return n;
  }
}

/**
 * Secret-store reference resolver (correction #7). M11 stores the reference
 * only; no backend is wired. Resolution FAILS CLOSED with
 * CREDENTIAL_RESOLVER_UNAVAILABLE. Only source:"none" resolves without error.
 */
export class SecretStoreReferenceResolver implements CredentialResolver {
  async resolve(ref: CredentialReference): Promise<string> {
    if (isNoneRef(ref)) return "";
    if (ref.source !== "secret-store") {
      throw new CredentialError(
        "CREDENTIAL_INVALID_REFERENCE",
        `secret-store resolver cannot resolve source '${ref.source}'`,
      );
    }
    throw new CredentialError(
      "CREDENTIAL_RESOLVER_UNAVAILABLE",
      "secret-store backend is not configured",
    );
  }
  describe(ref: CredentialReference) {
    return { source: ref.source, state: "unset" as const };
  }
}

/** Dispatches resolution by `source`. Held by a runtime as a neutral service. */
export class DispatchingCredentialResolver implements CredentialResolver {
  constructor(
    private readonly env: CredentialResolver,
    private readonly session: SessionCredentialStore,
    private readonly secretStore: CredentialResolver,
  ) {}
  async resolve(ref: CredentialReference): Promise<string> {
    if (isNoneRef(ref)) return "";
    switch (ref.source) {
      case "environment":
        return this.env.resolve(ref);
      case "session":
        return this.session.get(ref);
      case "secret-store":
        return this.secretStore.resolve(ref);
      default:
        throw new CredentialError(
          "CREDENTIAL_INVALID_REFERENCE",
          `unknown credential source '${
            (ref as { source: string }).source
          }'`,
        );
    }
  }
  describe(ref: CredentialReference) {
    if (isNoneRef(ref)) return { source: ref.source, state: "unset" as const };
    if (ref.source === "environment") return this.env.describe(ref);
    if (ref.source === "session") {
      return {
        source: ref.source,
        state: this.session.has(ref) ? ("set" as const) : ("unset" as const),
      };
    }
    return { source: ref.source, state: "unset" as const };
  }
}
