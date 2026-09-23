import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Action API v2 Frontend Client & SecurityWorker Interceptor", () => {
  const apiLibPath = path.resolve(__dirname, "../src/lib/api.ts");

  it("verifies HttpClient and OneShotPublicApi classes and types are exported", () => {
    const content = fs.readFileSync(apiLibPath, "utf-8");
    assert.ok(content.includes("export type SecurityWorker = () => Record<string, string>"));
    assert.ok(content.includes("export interface HttpClientConfig"));
    assert.ok(content.includes("export class HttpClient"));
    assert.ok(content.includes("export class OneShotPublicApi"));
    assert.ok(content.includes("export const defaultOneShotApi = new OneShotPublicApi()"));
  });

  it("verifies OneShotPublicApi exposes all canonical v2 action methods", () => {
    const content = fs.readFileSync(apiLibPath, "utf-8");
    assert.ok(content.includes("async getStatus("));
    assert.ok(content.includes("async promptAgent<"));
    assert.ok(content.includes("async executeTool<"));
    assert.ok(content.includes("async configureProvider<"));
    assert.ok(content.includes("async switchProvider<"));
    assert.ok(content.includes("async transitionStage<"));
    assert.ok(content.includes("async validateFixtures<"));
  });

  it("verifies SecurityWorker header injection interceptor and error propagation in HttpClient", async () => {
    // Import HttpClient and OneShotPublicApi directly from TypeScript file via tsx runner
    const { HttpClient, OneShotPublicApi } = await import("../src/lib/api.ts");

    let capturedHeaders = null;
    let capturedUrl = null;
    let capturedBody = null;

    // Mock global fetch for unit testing client behavior
    const originalFetch = global.fetch;
    try {
      global.fetch = async (url, options) => {
        capturedUrl = url;
        capturedHeaders = options.headers;
        capturedBody = options.body ? JSON.parse(options.body) : null;

        if (url.includes("/api/v2/getStatus")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              status: "healthy",
              currentStage: "research",
              gate1: { status: "pending" },
              gate2: { status: "pending" },
              providers: { mistral: { configured: true } },
              activeSessions: 1,
            }),
          };
        }

        if (url.includes("/api/v2/errorOp")) {
          return {
            ok: false,
            status: 400,
            statusText: "Bad Request",
            json: async () => ({ error: "Validation failed on input" }),
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, url, body: capturedBody }),
        };
      };

      // Test securityWorker dynamically injecting auth/session headers
      const client = new HttpClient({
        baseUrl: "http://localhost:8787",
        securityWorker: () => ({
          "X-Session-Id": "dynamic-sess-999",
          "Authorization": "Bearer dynamic-token-abc",
        }),
      });

      const api = new OneShotPublicApi(client);
      const statusRes = await api.getStatus();

      assert.strictEqual(statusRes.ok, true);
      assert.strictEqual(statusRes.status, "healthy");
      assert.strictEqual(capturedUrl, "http://localhost:8787/api/v2/getStatus");
      assert.strictEqual(capturedHeaders["X-Session-Id"], "dynamic-sess-999");
      assert.strictEqual(capturedHeaders["Authorization"], "Bearer dynamic-token-abc");
      assert.strictEqual(capturedHeaders["Content-Type"], "application/json");

      // Test error handling
      await assert.rejects(
        async () => {
          await client.post("/api/v2/errorOp", { invalid: true });
        },
        (err) => {
          assert.strictEqual(err.message, "Validation failed on input");
          assert.strictEqual(err.status, 400);
          assert.strictEqual(err.payload.error, "Validation failed on input");
          return true;
        }
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
