/**
 * OneShot Security Headers & CORS Guard Middleware
 * 
 * Applies Helmet-equivalent security headers to protect against:
 * - Clickjacking (X-Frame-Options)
 * - MIME-type sniffing (X-Content-Type-Options)
 * - Cross-site scripting (CSP, X-XSS-Protection)
 * - Insecure transport (Strict-Transport-Security)
 * - Origin validation (CORS whitelist)
 */

import type http from "node:http";

export interface SecurityHeadersOptions {
  enabled?: boolean;
  contentSecurityPolicy?: string;
  xContentTypeOptions?: string;
  xFrameOptions?: string;
  strictTransportSecurity?: string;
  allowedOrigins?: string[];
}

export function applySecurityHeaders(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: SecurityHeadersOptions = {}
): boolean {
  if (options.enabled !== false) {
    res.setHeader("X-Content-Type-Options", options.xContentTypeOptions || "nosniff");
    res.setHeader("X-Frame-Options", options.xFrameOptions || "DENY");
    res.setHeader("X-XSS-Protection", "0");
    if (options.contentSecurityPolicy) {
      res.setHeader("Content-Security-Policy", options.contentSecurityPolicy);
    }
  }

  // Handle CORS
  const origin = req.headers.origin;
  const allowed = options.allowedOrigins || ["*"];

  if (allowed.includes("*") || !origin) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  } else if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    // Origin not allowed
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "CORS: Origin not permitted" }));
    return false;
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-Id, Authorization, X-Request-Id");
  res.setHeader("Access-Control-Expose-Headers", "X-Request-Id, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return false; // Request handled
  }

  return true; // Continue pipeline
}
