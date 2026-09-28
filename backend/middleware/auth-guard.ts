/**
 * OneShot Authentication Guard Middleware
 * 
 * Enforces Bearer token verification using constant-time comparison to prevent timing attacks.
 */

import crypto from "node:crypto";
import type http from "node:http";

export interface AuthGuardOptions {
  enabled?: boolean;
  expectedToken?: string;
  headerName?: string;
  /** Environment variable holding the expected bearer token. */
  apiKeyEnv?: string;
  publicPaths?: string[];
}

export function checkAuthentication(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  options: AuthGuardOptions = {}
): boolean {
  if (!options.enabled) {
    return true; // Auth disabled, allow all
  }

  const publicPaths = options.publicPaths || [
    "/ping",
    "/health",
    "/api/health",
    "/api/integration/providers",
    "/favicon.ico",
  ];

  if (publicPaths.some((p) => pathname === p || pathname.startsWith("/public/"))) {
    return true;
  }

  const headerName = options.headerName || "authorization";
  const rawHeader = (req.headers[headerName.toLowerCase()] as string) || "";
  let providedToken = "";

  if (rawHeader.startsWith("Bearer ")) {
    providedToken = rawHeader.slice(7).trim();
  } else {
    providedToken = rawHeader.trim();
  }

  // Token env var is configurable via `apiKeyEnv`; the previous hardcoded
  // lookup made the config.toml setting inert and silently fell back to
  // ONESHOT_API_TOKEN even when a different variable was configured.
  const tokenEnv = options.apiKeyEnv || "ONESHOT_API_TOKEN";
  const expectedToken = options.expectedToken || process.env[tokenEnv] || "";
  if (!expectedToken) {
    // If auth is enabled in config but no server token is configured, log warning and allow
    return true;
  }

  // Constant-time comparison
  const isValid = timingSafeCompare(providedToken, expectedToken);
  if (!isValid) {
    res.writeHead(401, {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="OneShot"',
    });
    res.end(
      JSON.stringify({
        ok: false,
        error: "Unauthorized: Missing or invalid authentication token",
      })
    );
    return false;
  }

  return true;
}

function timingSafeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
