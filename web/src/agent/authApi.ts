/**
 * Browser session-authentication API for the OneShot React IDE.
 *
 * The browser authenticates with an opaque, in-memory session cookie
 * (`oneshot_session`) obtained from `POST /auth/login` by exchanging the
 * operator's `ONESHOT_API_TOKEN`. Cookie-authenticated state-changing requests
 * must carry the issued CSRF synchronizer token in the `X-Oneshot-CSRF` header;
 * GET requests and Bearer-token requests are CSRF-exempt.
 *
 * See BROWSER_AUTH_PROPOSAL.md for the full security model.
 */
export interface AuthSession {
  ok: boolean;
  csrf_token: string;
  expires_at: string;
}

export const CSRF_HEADER_NAME = "X-Oneshot-CSRF";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

let csrfToken: string | null = null;
let onAuthRequired: (() => void) | null = null;

/**
 * Register a callback (used by App.tsx) invoked when a 401 indicates the
 * session has expired or been revoked and the UI must re-surface the login form.
 */
export function setAuthRequiredHandler(cb: () => void): void {
  onAuthRequired = cb;
}

export function currentCsrfToken(): string | null {
  return csrfToken;
}

/** Exchange a token for a session cookie and CSRF token. */
export async function login(token: string): Promise<AuthSession> {
  const res = await fetch("/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Login failed: ${res.status}`);
  }
  const session: AuthSession = await res.json();
  csrfToken = session.csrf_token;
  return session;
}

/** Probe the active session; resolves null when no (or an expired) session. */
export async function restoreSession(): Promise<AuthSession | null> {
  const res = await fetch("/auth/session", { credentials: "same-origin" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Session check failed: ${res.status}`);
  const session: AuthSession = await res.json();
  csrfToken = session.csrf_token;
  return session;
}

/** Revoke the current session and clear the cookie. */
export async function logout(): Promise<void> {
  const headers: Record<string, string> = {};
  if (csrfToken) headers[CSRF_HEADER_NAME] = csrfToken;
  const res = await fetch("/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers,
  });
  csrfToken = null;
  if (!res.ok) throw new Error(`Logout failed: ${res.status}`);
}

/**
 * Wrapper around fetch that attaches the session cookie (same-origin) and the
 * CSRF synchronizer token on state-changing requests. On a 401, notifies the
 * registered auth-required handler so the IDE can show the login form again.
 */
export async function fetchAuthed(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  if (MUTATING.has(method) && csrfToken) {
    headers.set(CSRF_HEADER_NAME, csrfToken);
  }
  const response = await fetch(input, {
    ...init,
    method,
    headers,
    credentials: "same-origin",
  });
  if (response.status === 401) onAuthRequired?.();
  return response;
}
