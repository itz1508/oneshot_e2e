import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  SlidingWindowRateLimiter,
  applySecurityHeaders,
  parseJsonBody,
  checkAuthentication,
  PayloadTooLargeError,
} from "../../middleware/index.js";

describe("Production Security & Middleware Suite", () => {
  describe("SlidingWindowRateLimiter", () => {
    it("allows requests within rate limit and decrements remaining quota", () => {
      const limiter = new SlidingWindowRateLimiter({
        enabled: true,
        maxRequestsPerMinute: 5,
        windowSeconds: 60,
      });

      const r1 = limiter.checkLimit("client-1");
      assert.equal(r1.allowed, true);
      assert.equal(r1.limit, 5);
      assert.equal(r1.remaining, 4);

      const r2 = limiter.checkLimit("client-1");
      assert.equal(r2.allowed, true);
      assert.equal(r2.remaining, 3);
    });

    it("blocks requests when limit is exhausted and returns allowed=false with resetSeconds", () => {
      const limiter = new SlidingWindowRateLimiter({
        enabled: true,
        maxRequestsPerMinute: 2,
        windowSeconds: 60,
      });

      limiter.checkLimit("client-2"); // 1
      limiter.checkLimit("client-2"); // 2
      const blocked = limiter.checkLimit("client-2"); // 3 (exceeded)

      assert.equal(blocked.allowed, false);
      assert.equal(blocked.remaining, 0);
      assert.ok(blocked.resetSeconds > 0);
    });
  });

  describe("Security Headers & CORS Guard", () => {
    it("sets Helmet-grade security headers on response", () => {
      const headers: Record<string, string> = {};
      const mockRes = {
        setHeader: (k: string, v: string) => {
          headers[k.toLowerCase()] = v;
        },
      } as unknown as http.ServerResponse;

      const mockReq = {
        headers: {},
        method: "GET",
      } as unknown as http.IncomingMessage;

      const continued = applySecurityHeaders(mockReq, mockRes, {
        enabled: true,
        xContentTypeOptions: "nosniff",
        xFrameOptions: "DENY",
      });

      assert.equal(continued, true);
      assert.equal(headers["x-content-type-options"], "nosniff");
      assert.equal(headers["x-frame-options"], "DENY");
      assert.equal(headers["x-xss-protection"], "0");
      assert.equal(headers["access-control-allow-origin"], "*");
    });

    it("handles CORS OPTIONS preflight request with 204", () => {
      let statusCode = 0;
      let ended = false;
      const headers: Record<string, string> = {};

      const mockRes = {
        setHeader: (k: string, v: string) => {
          headers[k.toLowerCase()] = v;
        },
        writeHead: (code: number) => {
          statusCode = code;
        },
        end: () => {
          ended = true;
        },
      } as unknown as http.ServerResponse;

      const mockReq = {
        headers: { origin: "http://localhost:3000" },
        method: "OPTIONS",
      } as unknown as http.IncomingMessage;

      const continued = applySecurityHeaders(mockReq, mockRes, {
        allowedOrigins: ["http://localhost:3000"],
      });

      assert.equal(continued, false);
      assert.equal(statusCode, 204);
      assert.equal(ended, true);
      assert.equal(headers["access-control-allow-origin"], "http://localhost:3000");
    });
  });

  describe("Safe Request Body Parser", () => {
    it("rejects payloads that exceed byte size limit with PayloadTooLargeError", async () => {
      const { Readable } = await import("node:stream");
      const largePayload = JSON.stringify({ data: "x".repeat(1024) });

      const stream = Readable.from([largePayload]) as unknown as http.IncomingMessage;
      (stream as any).destroy = () => {};

      await assert.rejects(
        async () => {
          await parseJsonBody(stream, { maxBytes: 50 }); // 50 bytes limit
        },
        (err: any) => {
          return err instanceof PayloadTooLargeError && err.statusCode === 413;
        }
      );
    });

    it("successfully parses valid JSON payloads within limit", async () => {
      const { Readable } = await import("node:stream");
      const payload = JSON.stringify({ message: "valid payload", count: 42 });

      const stream = Readable.from([payload]) as unknown as http.IncomingMessage;
      (stream as any).destroy = () => {};

      const parsed = await parseJsonBody(stream, { maxBytes: 1024 });
      assert.equal(parsed.message, "valid payload");
      assert.equal(parsed.count, 42);
    });
  });

  describe("Authentication Guard", () => {
    it("permits public endpoints when auth is enabled", () => {
      const mockReq = { headers: {} } as unknown as http.IncomingMessage;
      const mockRes = {} as unknown as http.ServerResponse;

      const allowed = checkAuthentication(mockReq, mockRes, "/ping", {
        enabled: true,
        expectedToken: "secret-token-123",
      });
      assert.equal(allowed, true);
    });

    it("rejects unauthorized mutation requests with 401 when token is missing or invalid", () => {
      let statusCode = 0;
      let ended = false;
      const mockRes = {
        writeHead: (code: number) => {
          statusCode = code;
        },
        end: () => {
          ended = true;
        },
      } as unknown as http.ServerResponse;

      const mockReq = {
        headers: { authorization: "Bearer wrong-token" },
      } as unknown as http.IncomingMessage;

      const allowed = checkAuthentication(mockReq, mockRes, "/api/tool/execute", {
        enabled: true,
        expectedToken: "valid-secret-key-456",
      });

      assert.equal(allowed, false);
      assert.equal(statusCode, 401);
      assert.equal(ended, true);
    });

    it("authorizes request with valid timing-safe token", () => {
      const mockRes = {} as unknown as http.ServerResponse;
      const mockReq = {
        headers: { authorization: "Bearer valid-secret-key-456" },
      } as unknown as http.IncomingMessage;

      const allowed = checkAuthentication(mockReq, mockRes, "/api/tool/execute", {
        enabled: true,
        expectedToken: "valid-secret-key-456",
      });

      assert.equal(allowed, true);
    });

    it("fails closed when auth is enabled but no server token is configured", () => {
      // Regression: the guard used to `return true` here, so enabling auth in
      // config.toml with an unset or misspelled token variable produced a
      // silently unauthenticated server on a 0.0.0.0 bind.
      const mockReq = { headers: { authorization: "Bearer anything" } } as any;
      const mockRes = { writeHead: () => true, end: () => true } as any;

      const allowed = checkAuthentication(mockReq, mockRes, "/api/tool/execute", {
        enabled: true,
        apiKeyEnv: "ONESHOT_DEFINITELY_UNSET_TOKEN_VAR",
      });

      assert.equal(allowed, false, "must refuse, not allow, when no token is configured");
    });
  });
});
