import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { parseBooleanEnv } from "../environment.js";
import { SessionStore, type SessionRecord } from "./session-store.js";

export const SESSION_COOKIE_NAME = "oneshot_session";
export const CSRF_HEADER_NAME = "x-oneshot-csrf";

type Bucket = { started: number; count: number };

/** Constant-time string comparison to resist timing leaks on the bearer token
 * and on the CSRF synchronizer token. */
function sameString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab); // compare equal-length to keep timing flat-ish
    return false;
  }
  return timingSafeEqual(ab, bb);
}

function parseCookies(
  header: string | string[] | undefined,
): Map<string, string> {
  const jar = new Map<string, string>();
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return jar;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const name = decodeURIComponent(part.slice(0, idx).trim());
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    if (name) jar.set(name, value);
  }
  return jar;
}

function isMutating(method: string | undefined): boolean {
  return (
    method === "POST" || method === "PUT" ||
    method === "PATCH" || method === "DELETE"
  );
}

export class HttpSecurity {
  private buckets = new Map<string, Bucket>();
  private windowMs = Math.max(
    1000,
    Number(process.env.API_RATE_LIMIT_WINDOW_MS || 900000),
  );
  private max = Math.max(1, Number(process.env.API_RATE_LIMIT_MAX || 100));
  private origin = process.env.CORS_ORIGIN || "http://localhost:8787";
  private token = (process.env.ONESHOT_API_TOKEN || "").trim();
  private sessions = new SessionStore();
  private allowInsecureHttp = parseBooleanEnv("ONESHOT_ALLOW_INSECURE_HTTP");
  private forceHttps = parseBooleanEnv("ONESHOT_FORCE_HTTPS");

  /** True when no operator token is configured; API is open (no login wall). */
  get authDisabled(): boolean {
    return !this.token;
  }

  /** Cookies are Secure unless the operator explicitly accepts plain-HTTP for a
   * local rc deployment, or forces HTTPS behind a TLS-terminating proxy. */
  private get secureCookies(): boolean {
    return this.forceHttps || !this.allowInsecureHttp;
  }

  tokenMatches(candidate: string): boolean {
    return Boolean(this.token) && sameString(candidate, this.token);
  }

  headers(res: ServerResponse): void {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("x-frame-options", "DENY");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader(
      "permissions-policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.setHeader(
      "content-security-policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; media-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    res.setHeader("access-control-allow-origin", this.origin);
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.setHeader(
      "access-control-allow-headers",
      "Content-Type,Authorization,X-Oneshot-CSRF",
    );
    res.setHeader("vary", "Origin");
  }
  /** Browser requests carry an `Origin` header; non-browser clients do not. */
  private sameOrigin(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (!origin) return true; // non-browser client → not CSRF-able
    if (!host) return false;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  private parseSessionId(req: IncomingMessage): string | null {
    const cookies = parseCookies(req.headers.cookie);
    const sid = cookies.get(SESSION_COOKIE_NAME);
    return sid && sid.length > 8 ? sid : null;
  }

  sessionFromRequest(req: IncomingMessage): SessionRecord | null {
    const sid = this.parseSessionId(req);
    return sid ? this.sessions.get(sid) : null;
  }

  createSession(): SessionRecord {
    return this.sessions.create();
  }

  revokeSession(req: IncomingMessage): boolean {
    const sid = this.parseSessionId(req);
    return sid ? this.sessions.revoke(sid) : false;
  }

  private cookieValue(session: SessionRecord | null): string {
    const parts = [
      `${SESSION_COOKIE_NAME}=${session ? session.sessionId : ""}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
    ];
    if (session) {
      parts.push(
        `Max-Age=${Math.floor((session.expiresAt - session.createdAt) / 1000)}`,
      );
    } else {
      parts.push("Max-Age=0");
    }
    if (this.secureCookies) parts.push("Secure");
    return parts.join("; ");
  }

  applySessionCookie(res: ServerResponse, session: SessionRecord): void {
    res.setHeader("set-cookie", this.cookieValue(session));
  }

  clearSessionCookie(res: ServerResponse): void {
    res.setHeader("set-cookie", this.cookieValue(null));
  }
  allowed(req: IncomingMessage, res: ServerResponse): boolean {
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return false;
    }
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    const protectedApi =
      pathname === "/api" || pathname.startsWith("/api/") ||
      pathname === "/v1" || pathname.startsWith("/v1/");
    const loginPath = req.method === "POST" && pathname === "/auth/login";
    if (protectedApi || loginPath) {
      const key = req.socket.remoteAddress || "unknown";
      const now = Date.now();
      const old = this.buckets.get(key);
      const b =
        !old || now - old.started >= this.windowMs
          ? { started: now, count: 0 }
          : old;
      b.count++;
      this.buckets.set(key, b);
      res.setHeader("x-ratelimit-limit", String(this.max));
      res.setHeader(
        "x-ratelimit-remaining",
        String(Math.max(0, this.max - b.count)),
      );
      if (b.count > this.max) {
        res.writeHead(429, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "rate limit exceeded" }));
        return false;
      }
    }
    if (protectedApi) {
      // 1. Bearer token pass-through — CSRF-exempt.
      const auth = req.headers.authorization;
      if (auth === `Bearer ${this.token}`) return true;
      // 2. Cookie session — same-origin plus CSRF on state changes.
      const session = this.sessionFromRequest(req);
      if (session) {
        if (!this.sameOrigin(req)) {
          res.writeHead(401, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "bad origin" }));
          return false;
        }
        if (isMutating(req.method)) {
          const headerToken = String(
            req.headers[CSRF_HEADER_NAME] || "",
          );
          if (!headerToken || !sameString(headerToken, session.csrfToken)) {
            res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ error: "csrf validation failed" }));
            return false;
          }
        }
        return true;
      }
      // 3. No valid credentials.
      if (this.token) {
        res.writeHead(401, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return false;
      }
      return true; // auth disabled
    }
    return true;
  }
}
