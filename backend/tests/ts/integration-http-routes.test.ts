import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { integrationDirectory } from "../../integration/runtime.js";
import { startHttpServer } from "../../server/http-server.js";

/**
 * HTTP-level coverage for the existing /api/integrations surface. Kept in its
 * own file because the shared-process runner force-exits while other suites
 * hold native handles (Python bridge), which crashes Windows teardown when
 * combined with an in-process HTTP server.
 */
function requestJson(
  base: string,
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<{ status: number; data: any }> {
  return new Promise((ok, fail) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    // keepAlive: false closes the socket after each response, so no pooled
    // socket races the runner's --test-force-exit on Windows teardown.
    const req = http.request(
      `${base}${path}`,
      {
        method,
        agent: new http.Agent({ keepAlive: false }),
        headers: {
          ...(payload === undefined
            ? {}
            : { "content-type": "application/json" }),
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          raw += chunk;
        });
        res.on("end", () => {
          ok({ status: res.statusCode || 0, data: JSON.parse(raw) });
        });
      },
    );
    req.on("error", fail);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}
async function fakeGeminiInstall(root: string): Promise<string> {
  const target = integrationDirectory(root, "gemini");
  const packageRoot = join(target, "node_modules", "@ai-sdk", "google");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(target, "package.json"),
    JSON.stringify({ name: "@oneshot/runtime-integration-gemini", private: true }),
    "utf8",
  );
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({
      name: "@ai-sdk/google",
      version: "4.0.67",
      type: "module",
      exports: "./index.js",
    }),
    "utf8",
  );
  await writeFile(
    join(packageRoot, "index.js"),
    "export function createGoogleGenerativeAI(options) { return (model) => ({ model, options }); }\n",
    "utf8",
  );
  return target;
}

test("integration routes list, install, and configure through the existing flow", async () => {
  const root = await mkdtemp(join(tmpdir(), "oneshot-integration-routes-"));
  const envBefore = {
    bind: process.env.ONESHOT_BIND_HOST,
    rateMax: process.env.API_RATE_LIMIT_MAX,
    rateWindow: process.env.API_RATE_LIMIT_WINDOW_MS,
    key: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    model: process.env.GEMINI_MODEL,
    baseURL: process.env.GEMINI_BASE_URL,
  };
  let server: Awaited<ReturnType<typeof startHttpServer>> | undefined;
  try {
    delete process.env.ONESHOT_BIND_HOST;
    process.env.API_RATE_LIMIT_MAX = "100";
    process.env.API_RATE_LIMIT_WINDOW_MS = "60000";
    await fakeGeminiInstall(root);

    server = await startHttpServer(
      {} as any,
      {} as any,
      {} as any,
      resolve("app/web/dist"),
      0,
      undefined,
      undefined,
      undefined,
      undefined,
      { workspaceRoot: root },
    );
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;

    // List reflects the pre-seeded install. Real npm download behavior is
    // covered by the install-command test in integration-package-runtime; the
    // route delegates to the same installIntegration code path.
    const list = await requestJson(base, "/api/integrations");
    assert.equal(list.status, 200);
    assert.ok(
      Array.isArray(list.data.integrations) && list.data.integrations.length > 0,
    );
    const gemini = list.data.integrations.find(
      (item: any) => item.id === "gemini",
    );
    assert.ok(gemini, "catalog entry must be listed");
    assert.equal(gemini.installed, true);

    // Configure persists env bindings through the existing route.
    const configured = await requestJson(
      base,
      "/api/integrations/gemini/configure",
      "POST",
      {
        apiKey: "route-key",
        model: "gemini-route-model",
        baseURL: "https://proxy.invalid/v1",
      },
    );
    assert.equal(configured.status, 200);
    assert.equal(configured.data.configured, true);
    assert.equal(process.env.GOOGLE_GENERATIVE_AI_API_KEY, "route-key");
    assert.equal(process.env.GEMINI_MODEL, "gemini-route-model");
    assert.equal(process.env.GEMINI_BASE_URL, "https://proxy.invalid/v1");

    // Unknown integration ids are rejected by the catalog, not by new surface.
    const unknownConfigure = await requestJson(
      base,
      "/api/integrations/does-not-exist/configure",
      "POST",
      { apiKey: "x", model: "m" },
    );
    assert.equal(unknownConfigure.status, 500);

    const unknownInstall = await requestJson(
      base,
      "/api/integrations/does-not-exist/install",
      "POST",
    );
    assert.equal(unknownInstall.status, 500);
  } finally {
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((ok, fail) =>
        server!.close((error) => (error ? fail(error) : ok())),
      );
      server = undefined;
    }
    if (envBefore.bind === undefined) {
      delete process.env.ONESHOT_BIND_HOST;
    } else {
      process.env.ONESHOT_BIND_HOST = envBefore.bind;
    }
    if (envBefore.rateMax === undefined) {
      delete process.env.API_RATE_LIMIT_MAX;
    } else {
      process.env.API_RATE_LIMIT_MAX = envBefore.rateMax;
    }
    if (envBefore.rateWindow === undefined) {
      delete process.env.API_RATE_LIMIT_WINDOW_MS;
    } else {
      process.env.API_RATE_LIMIT_WINDOW_MS = envBefore.rateWindow;
    }
    if (envBefore.key === undefined) {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    } else {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = envBefore.key;
    }
    if (envBefore.model === undefined) {
      delete process.env.GEMINI_MODEL;
    } else {
      process.env.GEMINI_MODEL = envBefore.model;
    }
    if (envBefore.baseURL === undefined) {
      delete process.env.GEMINI_BASE_URL;
    } else {
      process.env.GEMINI_BASE_URL = envBefore.baseURL;
    }
    await rm(root, { recursive: true, force: true });
  }
});