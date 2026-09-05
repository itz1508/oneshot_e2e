/**
 * Provider Secret Store abstraction.
 *
 * Single responsibility: persist/retrieve provider API credentials.
 * This interface is provider-agnostic and storage-agnostic so that
 * `ProviderManager` (and the HTTP layer) never depend on a concrete
 * backend. The default local implementation stores JSON files outside
 * the OneShot workspace; it is never web-served.
 *
 * Security invariants enforced everywhere:
 *  - A credential may be SUBMITTED by the browser (write-only).
 *  - A credential may NEVER be RETRIEVED by the browser.
 *  - `get()` is used only by the backend to feed a live ResearchProvider.
 *  - Credential contents never appear in logs, error messages, job payloads,
 *    Redis progress, or ProcessingEvent payloads.
 *
 * Swappable implementations (no consumer changes):
 *  - macOS Keychain
 *  - Windows Credential Manager
 *  - Linux Secret Service / D-Bus
 *  - Docker Secrets (read-only file mount)
 *  - Kubernetes Secrets
 *  - AWS Secrets Manager / GCP Secret Manager / Azure Key Vault
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import os from "node:os";

/** A stored credential. The `value` holds the raw secret material. */
export interface ProviderCredential {
  providerId: string;
  /** Human-oriented, non-secret label (e.g. "api_key"). */
  credentialType: "api_key" | "oauth" | "google";
  /** The secret material — e.g. the API key. Never serialized to the browser. */
  value: string;
  /** ISO timestamp of creation/last update. */
  createdAt: string;
}

/** Write-only result returned to the browser after a credential is set. */
export interface CredentialWriteResult {
  providerId: string;
  credentialSource: "local-secret-store";
  stored: boolean;
}

export interface ProviderSecretStore {
  /** Whether a credential exists for the given provider (no disclosure). */
  has(providerId: string): Promise<boolean>;
  /** Retrieve the credential for backend use only. Never call from HTTP responses. */
  get(providerId: string): Promise<ProviderCredential | undefined>;
  /** Persist/replace a credential. */
  set(providerId: string, credential: ProviderCredential): Promise<void>;
    /** Delete a credential if present. */
  delete(providerId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Platform-native default secret directory
// ---------------------------------------------------------------------------

function defaultSecretsDir(): string {
  const explicit = process.env.ONESHOT_SECRETS_DIR;
  if (explicit) return resolve(explicit);

  const home = os.homedir();
  if (process.platform === "darwin") {
    return resolve(
      home,
      "Library",
      "Application Support",
      "OneShot",
      "secrets",
    );
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    return resolve(appData, "OneShot", "secrets");
  }
  // Linux / POSIX — freedesktop-style user config dir
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg ? resolve(xdg) : resolve(home, ".config", "oneshot");
  return resolve(base, "secrets");
}

/**
 * Local JSON-backed secret store.
 *
 * - Lives OUTSIDE the OneShot workspace (OS user config directory).
 * - Never web-served (the HTTP layer only calls `has`/`get` for backend
 *   provider construction and `set`/`delete` on authenticated write requests).
 * - Files are restricted to current OS user where supported.
 * - Errors never print credential contents.
 */
export class LocalFileSecretStore implements ProviderSecretStore {
  readonly secretsDir: string;

  constructor(secretsDir?: string) {
    this.secretsDir = resolve(secretsDir ?? defaultSecretsDir());
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!existsSync(this.secretsDir)) {
      mkdirSync(this.secretsDir, { recursive: true });
    }
    try {
      chmodSync(this.secretsDir, 0o700);
    } catch {
      /* permission restriction unsupported on this platform (e.g. some Windows) */
    }
  }

  private pathFor(providerId: string): string {
    // providerId is a catalog key ("sample", "featherless", "adk_gemma2") —
    // a short identifier, never user input that can escape.
    const safe = providerId.replace(/[^a-z0-9_-]/g, "_");
    return join(this.secretsDir, `${safe}.json`);
  }

  async has(providerId: string): Promise<boolean> {
    return existsSync(this.pathFor(providerId));
  }

  async get(providerId: string): Promise<ProviderCredential | undefined> {
    const p = this.pathFor(providerId);
    if (!existsSync(p)) return undefined;
    try {
      const raw = readFileSync(p, "utf8");
      const parsed = JSON.parse(raw) as ProviderCredential;
      // Structural validation only — we never log `value`.
      if (
        typeof parsed?.providerId === "string" &&
        typeof parsed?.value === "string" &&
        typeof parsed?.credentialType === "string"
      ) {
        return parsed;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  async set(providerId: string, credential: ProviderCredential): Promise<void> {
    this.ensureDir();
    const p = this.pathFor(providerId);
    const content = JSON.stringify(credential, null, 2) + "\n";
    writeFileSync(p, content, "utf8");
    try {
      // Restrict to owner read/write only.
      chmodSync(p, 0o600);
    } catch {
      /* permission restriction unsupported */
    }
  }

  async delete(providerId: string): Promise<void> {
    const p = this.pathFor(providerId);
    if (existsSync(p)) {
      try {
        unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }

  /** Best-effort cleanup of an empty store directory. */
  async clear(): Promise<void> {
    if (!existsSync(this.secretsDir)) return;
    try {
      rmdirSync(this.secretsDir, { recursive: true });
    } catch {
      /* ignore non-empty or permission errors */
    }
  }
}

export { defaultSecretsDir };
