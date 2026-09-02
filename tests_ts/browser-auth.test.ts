import test from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startHttpServer } from "../backend/server/http-server.js";

/**
 * Browser (cookie + CSRF) authentication E2E proof against the real HTTP
 * server: login -> session restore -> authenticated read -> CSRF mutation
 * -> logout/revocation, plus Bearer-token backward compatibility.
 */
const TOKEN = "oneshot-test-browser-auth-token";
const AUTH_HEADERS = { Authorization: `Bearer ${TOKEN}` };
const CSRF_HEADER = "x-oneshot-csrf";
type HeadersLike = Headers & { getSetCookie?: () => string[] };

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections?.();
  await new Promise<void>((resolveClose) => {
    server.close((error) => (error ? Promise.reject(error) : resolveClose()));
  });
}

function baseUrl(server: Server): string {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

async function launch(workspaceRoot: string): Promise<Server> {
  return startHttpServer(
    {} as never,
    {} as never,
    {} as never,
    resolve("ui"),
    0,
    undefined,
    undefined,
    undefined,
    undefined,
    { workspaceRoot },
  );
}

function setCookieLines(res: Response): string[] {
  const h = res.headers as HeadersLike;
  if (typeof h.getSetCookie === "function") return h.getSetCookie();
  const raw = h.get("set-cookie");
  return raw ? [raw] : [];
}

function sessionCookieValue(res: Response): string {
  const line = setCookieLines(res).find((c) =>
    c.startsWith("oneshot_session="),
  );
  assert.ok(line, "expected oneshot_session Set-Cookie");
  return line.split(";")[0];
}
test("browser session + CSRF authentication lifecycle", async () => {
  const saved = {
    token: process.env.ONESHOT_API_TOKEN,
    bind: process.env.ONESHOT_BIND_HOST,
    rateMax: process.env.API_RATE_LIMIT_MAX,
    rateWindow: process.env.API_RATE_LIMIT_WINDOW_MS,
  };
  process.env.ONESHOT_API_TOKEN = TOKEN;
  process.env.ONESHOT_BIND_HOST = "0.0.0.0";
  process.env.API_RATE_LIMIT_MAX = "1000";
  process.env.API_RATE_LIMIT_WINDOW_MS = "3600000";

  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "oneshot-browser-auth-"),
  );
  const workspaceRoot = join(temporaryRoot, "workspace");
  await mkdir(join(workspaceRoot, "authn-test"), { recursive: true });

  let server: Server | undefined;
  try {
    server = await launch(workspaceRoot);
    const base = baseUrl(server);

    // 1. Auth is enabled (token set) -> unauthenticated read is rejected.
    assert.equal((await fetch(`${base}/api/health`)).status, 401);

    // 2. Bearer-token backward compatibility: a valid bearer bypasses the
    //    cookie/CSRF gate on a read endpoint.
    assert.equal(
      (await fetch(`${base}/api/health`, { headers: AUTH_HEADERS })).status,
      200,
    );

    // 3a. Login with a wrong token is rejected.
    const badLogin = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "definitely-wrong" }),
    });
    assert.equal(badLogin.status, 401);
    assert.equal((await badLogin.json()).error, "invalid token");

    // 3b. Login with the operator token issues a session cookie + CSRF token.
    const loginRes = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: TOKEN }),
    });
    assert.equal(loginRes.status, 200);
    const cookie = sessionCookieValue(loginRes);
    assert.ok(cookie.startsWith("oneshot_session="));
    const csrf: string = (await loginRes.json()).csrf_token;
    assert.ok(csrf, "expected a csrf_token from login");

    const cookieHeaders = () => ({ cookie });

    // 4. Session restore: the issued cookie answers /auth/session.
    assert.equal(
      (await fetch(`${base}/auth/session`, { headers: cookieHeaders() })).status,
      200,
    );

    // 5. Authenticated read via session cookie (browser-auth path).
    assert.equal(
      (await fetch(`${base}/api/health`, { headers: cookieHeaders() })).status,
      200,
    );

    // 6a. CSRF-protected mutation: cookie WITHOUT the CSRF header -> 403.
    const noCsrf = await fetch(`${base}/v1/workspace/file`, {
      method: "POST",
      headers: { ...cookieHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ path: "authn-test/no-csrf.txt", content: "no" }),
    });
    assert.equal(noCsrf.status, 403);
    assert.equal((await noCsrf.json()).error, "csrf validation failed");

    // 6b. CSRF-protected mutation: cookie WITH the CSRF header succeeds and
    //     the file is actually written.
    const withCsrf = await fetch(`${base}/v1/workspace/file`, {
      method: "POST",
      headers: {
        ...cookieHeaders(),
        "content-type": "application/json",
        [CSRF_HEADER]: csrf,
      },
      body: JSON.stringify({ path: "authn-test/proof.txt", content: "browser" }),
    });
    assert.equal(withCsrf.status, 200);
    assert.equal(
      await readFile(join(workspaceRoot, "authn-test", "proof.txt"), "utf8"),
      "browser",
    );
    // 7. Bearer is CSRF-exempt even on a mutation (no cookie, no CSRF header).
    const bearerWrite = await fetch(`${base}/v1/workspace/file`, {
      method: "POST",
      headers: { ...AUTH_HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ path: "authn-test/bearer.txt", content: "bearer" }),
    });
    assert.equal(bearerWrite.status, 200);

    // 8. Logout revokes the session server-side and clears the cookie.
    const logoutRes = await fetch(`${base}/auth/logout`, {
      method: "POST",
      headers: cookieHeaders(),
    });
    assert.equal(logoutRes.status, 200);
    const clearedLine = setCookieLines(logoutRes).find((c) =>
      c.startsWith("oneshot_session="),
    );
    assert.ok(clearedLine, "logout must clear the session cookie");
    assert.match(clearedLine, /Max-Age=0/);

    // 9. The old cookie is useless now: the session was revoked server-side.
    assert.equal(
      (await fetch(`${base}/auth/session`, { headers: cookieHeaders() })).status,
      401,
    );
    assert.equal(
      (await fetch(`${base}/api/health`, { headers: cookieHeaders() })).status,
      401,
    );

    // 10. Bearer auth is independent of the revoked browser session.
    assert.equal(
      (await fetch(`${base}/api/health`, { headers: AUTH_HEADERS })).status,
      200,
    );
  } finally {
    if (server) await closeServer(server);
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("ONESHOT_API_TOKEN", saved.token);
    restore("ONESHOT_BIND_HOST", saved.bind);
    restore("API_RATE_LIMIT_MAX", saved.rateMax);
    restore("API_RATE_LIMIT_WINDOW_MS", saved.rateWindow);
    await rm(temporaryRoot, { recursive: true, force: true });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
});

