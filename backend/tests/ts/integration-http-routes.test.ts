import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

    // Configure persists the secret write-only and the non-secret config in
    // the gitignored state seam; no key is echoed back through the API.
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
    assert.equal(JSON.stringify(configured.data).includes("route-key"), false);
    const secrets = JSON.parse(
      await readFile(
        join(root, "app", "integration", "config", "secrets.secret.json"),
        "utf8",
      ),
    );
    assert.equal(secrets.keys.gemini, "route-key");
    const state = JSON.parse(
      await readFile(
        join(root, "app", "integration", "config", "state.local.json"),
        "utf8",
      ),
    );
    assert.equal(state.integrations.gemini.config.model, "gemini-route-model");
    assert.equal(
      state.integrations.gemini.config.baseURL,
      "https://proxy.invalid/v1",
    );

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

test("integration lifecycle: probe classification, enable guard, restart persistence, uninstall", async () => {
  const root = await mkdtemp(join(tmpdir(), "oneshot-integration-lifecycle-"));
  const envBefore = {
    bind: process.env.ONESHOT_BIND_HOST,
    rateMax: process.env.API_RATE_LIMIT_MAX,
    rateWindow: process.env.API_RATE_LIMIT_WINDOW_MS,
    key: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  };
  let server: Awaited<ReturnType<typeof startHttpServer>> | undefined;
  // Local fake provider: real HTTP, real probe classification, no external
  // network dependency and no manufactured success.
  let providerStatus = 200;
  const provider = http.createServer((_req, res) => {
    res.writeHead(providerStatus, { "content-type": "application/json" });
    res.end('{"models":[]}');
  });
  await new Promise<void>((ok) => provider.listen(0, "127.0.0.1", ok));
  const providerAddress = provider.address();
  assert.ok(providerAddress && typeof providerAddress === "object");
  const providerBase = `http://127.0.0.1:${providerAddress.port}`;

  const startServer = async () => {
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
    return `http://127.0.0.1:${address.port}`;
  };
  const stopServer = async () => {
    if (!server) return;
    server.closeAllConnections?.();
    await new Promise<void>((ok, fail) =>
      server!.close((error) => (error ? fail(error) : ok())),
    );
    server = undefined;
  };

  try {
    delete process.env.ONESHOT_BIND_HOST;
    process.env.API_RATE_LIMIT_MAX = "100";
    process.env.API_RATE_LIMIT_WINDOW_MS = "60000";
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    await fakeGeminiInstall(root);
    const base = await startServer();

    // package_missing: openai is not installed.
    const missingPkg = await requestJson(
      base,
      "/api/integrations/openai/test",
      "POST",
      { apiKey: "k", model: "gpt-5-mini", baseURL: providerBase },
    );
    assert.equal(missingPkg.status, 200);
    assert.equal(missingPkg.data.ok, false);
    assert.equal(missingPkg.data.status, "package_missing");

    // invalid_config: no key anywhere (no input, no secret, no env).
    const noKey = await requestJson(
      base,
      "/api/integrations/gemini/test",
      "POST",
      { model: "gemini-2.5-flash", baseURL: providerBase },
    );
    assert.equal(noKey.data.status, "invalid_config");

    // reachable: explicit key against the local fake provider.
    const reachable = await requestJson(
      base,
      "/api/integrations/gemini/test",
      "POST",
      { apiKey: "k", model: "gemini-2.5-flash", baseURL: providerBase },
    );
    assert.equal(reachable.data.ok, true);
    assert.equal(reachable.data.status, "reachable");
    assert.ok(reachable.data.last_test_at);

    // auth_failed: provider rejects the credential.
    providerStatus = 401;
    const authFailed = await requestJson(
      base,
      "/api/integrations/gemini/test",
      "POST",
      { apiKey: "bad-key", model: "gemini-2.5-flash", baseURL: providerBase },
    );
    assert.equal(authFailed.data.status, "auth_failed");
    providerStatus = 200;

    // unreachable: nothing listening on the target port.
    const unreachable = await requestJson(
      base,
      "/api/integrations/gemini/test",
      "POST",
      { apiKey: "k", model: "gemini-2.5-flash", baseURL: "http://127.0.0.1:1" },
    );
    assert.equal(unreachable.data.status, "unreachable");
    assert.equal(unreachable.data.ok, false);

    // Enable guard: a non-reachable last test blocks enablement.
    const denied = await requestJson(
      base,
      "/api/integrations/gemini/enable",
      "POST",
    );
    assert.equal(denied.status, 409);
    assert.notEqual(denied.data.state.last_test_status, "reachable");

    // Configure: secret persisted write-only; non-secret config in state file.
    const configured = await requestJson(
      base,
      "/api/integrations/gemini/configure",
      "POST",
      { apiKey: "persist-key", model: "gemini-persist", baseURL: providerBase },
    );
    assert.equal(configured.status, 200);
    assert.equal(configured.data.configured, true);
    assert.equal(JSON.stringify(configured.data).includes("persist-key"), false);

    // Probe now uses the stored secret + stored baseURL (empty body).
    const storedProbe = await requestJson(
      base,
      "/api/integrations/gemini/test",
      "POST",
      {},
    );
    assert.equal(storedProbe.data.status, "reachable");

    // Enable succeeds only after install + config + successful test.
    const enabled = await requestJson(
      base,
      "/api/integrations/gemini/enable",
      "POST",
    );
    assert.equal(enabled.status, 200);
    assert.equal(enabled.data.enabled, true);
    assert.deepEqual(enabled.data.capabilities, [
      "model.execute",
      "vision.inspect",
    ]);

    // Restart: state and credentials survive; new server reads them from disk.
    await stopServer();
    const base2 = await startServer();
    const afterRestart = await requestJson(base2, "/api/integrations");
    assert.equal(JSON.stringify(afterRestart.data).includes("persist-key"), false);
    const gemini2 = afterRestart.data.integrations.find(
      (item: any) => item.id === "gemini",
    );
    assert.equal(gemini2.installed, true);
    assert.equal(gemini2.configured, true);
    assert.equal(gemini2.enabled, true);
    assert.equal(gemini2.last_test_status, "reachable");

    // Uninstall removes package/state but preserves credentials by default.
    const uninstalled = await requestJson(
      base2,
      "/api/integrations/gemini/uninstall",
      "POST",
      {},
    );
    assert.equal(uninstalled.status, 200);
    assert.equal(uninstalled.data.installed, false);
    assert.equal(uninstalled.data.enabled, false);
    const secretsAfter = JSON.parse(
      await readFile(
        join(root, "app", "integration", "config", "secrets.secret.json"),
        "utf8",
      ),
    );
    assert.equal(secretsAfter.keys.gemini, "persist-key");

    // Credential deletion is a separate explicit confirmed action.
    await fakeGeminiInstall(root);
    const purged = await requestJson(
      base2,
      "/api/integrations/gemini/uninstall",
      "POST",
      { removeCredentials: true },
    );
    assert.equal(purged.status, 200);
    const secretsPurged = JSON.parse(
      await readFile(
        join(root, "app", "integration", "config", "secrets.secret.json"),
        "utf8",
      ),
    );
    assert.equal(secretsPurged.keys.gemini, undefined);
  } finally {
    await stopServer();
    await new Promise<void>((ok) => provider.close(() => ok()));
    if (envBefore.bind === undefined) delete process.env.ONESHOT_BIND_HOST;
    else process.env.ONESHOT_BIND_HOST = envBefore.bind;
    if (envBefore.rateMax === undefined) delete process.env.API_RATE_LIMIT_MAX;
    else process.env.API_RATE_LIMIT_MAX = envBefore.rateMax;
    if (envBefore.rateWindow === undefined) delete process.env.API_RATE_LIMIT_WINDOW_MS;
    else process.env.API_RATE_LIMIT_WINDOW_MS = envBefore.rateWindow;
    if (envBefore.key === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    else process.env.GOOGLE_GENERATIVE_AI_API_KEY = envBefore.key;
    await rm(root, { recursive: true, force: true });
  }
});