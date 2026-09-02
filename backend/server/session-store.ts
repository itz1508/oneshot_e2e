import { randomBytes } from "node:crypto";

/**
 * In-memory browser-session store for cookie-based authentication.
 *
 * Sessions are intentionally stateful and live in process memory: a valid
 * session is bound to the server instance that created it. This is sufficient
 * for the single-instance `oneshot` server and the docker-compose deployment.
 *
 * Scaling beyond a single instance requires either sticky sessions or an
 * external session backend (e.g. Redis). The session ID and the CSRF token are
 * both 256-bit opaque random values; the server never stores the `ONESHOT_API_TOKEN`
 * or any password — the session is the only proof of authentication.
 */
export interface SessionRecord {
  sessionId: string;
  csrfToken: string;
  createdAt: number;
  expiresAt: number;
}

export class SessionStore {
  private sessions = new Map<string, SessionRecord>();
  private ttlMs: number;

  constructor(
    ttlMs = Math.max(60_000, Number(process.env.ONESHOT_SESSION_TTL_MS || 3_600_000)),
  ) {
    this.ttlMs = ttlMs;
  }

  /** Issue a new session and evict any that have already expired. */
  create(): SessionRecord {
    this.sweep();
    const record: SessionRecord = {
      sessionId: randomBytes(32).toString("base64url"),
      csrfToken: randomBytes(32).toString("base64url"),
      createdAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
    };
    this.sessions.set(record.sessionId, record);
    return record;
  }

  get(id: string): SessionRecord | null {
    if (!id) return null;
    const record = this.sessions.get(id);
    if (!record) return null;
    if (Date.now() >= record.expiresAt) {
      this.sessions.delete(id);
      return null;
    }
    return record;
  }

  revoke(id: string): boolean {
    return this.sessions.delete(id);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, record] of this.sessions) {
      if (now >= record.expiresAt) this.sessions.delete(id);
    }
  }
}
