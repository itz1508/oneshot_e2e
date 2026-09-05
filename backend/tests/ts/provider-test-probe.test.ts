import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import {
  classifyProbeFailure,
  ProviderManager,
  type ProviderTestResult,
} from "../../runtime/provider-manager.js";
import { LocalFileSecretStore } from "../../runtime/provider-secret-store.js";
import type {
  ProviderCredential,
  ProviderSecretStore,
} from "../../runtime/provider-secret-store.js";
import { startHttpServer } from "../../server/http-server.js";
import type { ResearchProvider } from "../../role/researcher/provider.js";

const TOKEN = "provider-probe-test";
const AUTH = { Authorization: `Bearer ${TOKEN}` };

function makeManager(
  dir: string,
  secretStore: ProviderSecretStore = new LocalFileSecretStore(join(dir, "secrets")),
): ProviderManager {
  return new ProviderManager({
    projectRoot: process.cwd(),
    runtimePaths: {
      root: dir,
      config: join(dir, "config"),
    } as never,
    secretStore,
  });
}

function transientCredential(value: string): ProviderCredential {
  return {
    providerId: "featherless",
    credentialType: "api_key",
    value,
    createdAt: new Date().toISOString(),
  };
}

test("probe failure classification maps normalized categories", () => {
  assert.equal(
    classifyProbeFailure("PROVIDER_MODEL_FAILURE: model missing"),
    "PROVIDER_MODEL_FAILURE",
  );
  assert.equal(
    classifyProbeFailure("FEATHERLESS_API_KEY is not configured"),
    "PROVIDER_AUTH_FAILURE",
  );
  assert.equal(
    classifyProbeFailure("AuthenticationError: Error code: 401 - invalid api key"),
    "PROVIDER_AUTH_FAILURE",
  );
  assert.equal(
    classifyProbeFailure(
      "PROVIDER_AUTH_FAILURE: GEMINI_API_KEY or GOOGLE_API_KEY is required",
    ),
    "PROVIDER_AUTH_FAILURE",
  );
  assert.equal(
    classifyProbeFailure(
      "configured model google/gemma-4-31B-it was not returned by the live models endpoint",
    ),
    "PROVIDER_MODEL_FAILURE",
  );
  assert.equal(
    classifyProbeFailure("APIConnectionError: getaddrinfo ENOTFOUND api.host"),
    "PROVIDER_NETWORK_FAILURE",
  );
  assert.equal(
    classifyProbeFailure("readiness probe timed out after 30000ms"),
    "PROVIDER_NETWORK_FAILURE",
  );
  assert.equal(
    classifyProbeFailure("GOOGLE_CLOUD_PROJECT is required"),
    "PROVIDER_CONFIGURATION_FAILURE",
  );
  assert.equal(
    classifyProbeFailure("TypeError: Cannot read properties of undefined"),
    "PROVIDER_INTERNAL_FAILURE",
  );
});

test("sample fixture provider demonstrates real readiness (reads its fixture)", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "oneshot-probe-"));
  const pm = makeManager(tmp);
  const result: ProviderTestResult = await pm.test("sample");
  assert.equal(result.ok, true);
  assert.equal(result.provider, "sample");
  assert.ok(result.message, "success must carry the probe evidence detail");
  assert.equal(result.category, undefined);
});

test("missing credential reports PROVIDER_AUTH_FAILURE and never success", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "oneshot-probe-"));
  const savedKey = process.env.FEATHERLESS_API_KEY;
  delete process.env.FEATHERLESS_API_KEY;

  // Real-worker spawn coverage lives in featherless-provider.test.ts; here the
  // full ProviderManager.test() path (credential resolution → construct →
  // probe → classify) is exercised without a child process for determinism.
  class NoCredentialStubManager extends ProviderManager {
    protected override constructProvider(): ResearchProvider {
      return {
        async ready() {
          return {
            ready: false,
            provider: "featherless",
            models: ["google/gemma-4-31B-it"],
            detail:
              "PROVIDER_AUTH_FAILURE: FEATHERLESS_API_KEY is not configured",
          };
        },
      } as unknown as ResearchProvider;
    }
  }
  const pm = new NoCredentialStubManager({
    projectRoot: process.cwd(),
    runtimePaths: { root: tmp, config: join(tmp, "config") } as never,
  });
  try {
    const result = await pm.test("featherless");
    assert.equal(result.ok, false);
    assert.equal(result.category, "PROVIDER_AUTH_FAILURE");
    assert.equal(result.retryable, false);
  } finally {
    if (savedKey === undefined) delete process.env.FEATHERLESS_API_KEY;
    else process.env.FEATHERLESS_API_KEY = savedKey;
  }
});

test("network and internal exceptions normalize with correct retryability", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "oneshot-probe-"));

  class NetworkStubManager extends ProviderManager {
    protected override constructProvider(): ResearchProvider {
      return {
        async ready() {
          throw new Error("APIConnectionError: getaddrinfo ENOTFOUND api.host");
        },
      } as unknown as ResearchProvider;
    }
  }
  const network = await new NetworkStubManager({
    projectRoot: process.cwd(),
    runtimePaths: { root: tmp, config: join(tmp, "config") } as never,
  }).test("featherless");
  assert.equal(network.ok, false);
  assert.equal(network.category, "PROVIDER_NETWORK_FAILURE");
  assert.equal(network.retryable, true);

  class InternalStubManager extends ProviderManager {
    protected override constructProvider(): ResearchProvider {
      return {
        async ready() {
          throw new TypeError("Cannot read properties of undefined");
        },
      } as unknown as ResearchProvider;
    }
  }
  const internal = await new InternalStubManager({
    projectRoot: process.cwd(),
    runtimePaths: { root: tmp, config: join(tmp, "config") } as never,
  }).test("featherless");
  assert.equal(internal.ok, false);
  assert.equal(internal.category, "PROVIDER_INTERNAL_FAILURE");
});

test("invalid model configuration does not report success", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "oneshot-probe-"));

  class ModelStubManager extends ProviderManager {
    protected override constructProvider(): ResearchProvider {
      return {
        async ready() {
          return {
            ready: false,
            provider: "featherless",
            models: ["google/gemma-4-31B-it"],
            detail:
              "PROVIDER_MODEL_FAILURE: configured model google/gemma-4-31B-it was not returned by the live models endpoint",
          };
        },
      } as unknown as ResearchProvider;
    }
  }
  const result = await new ModelStubManager({
    projectRoot: process.cwd(),
    runtimePaths: { root: tmp, config: join(tmp, "config") } as never,
  }).test("featherless");
  assert.equal(result.ok, false);
  assert.equal(result.category, "PROVIDER_MODEL_FAILURE");
  assert.equal(result.retryable, false);
});

test("transient probe credential is used but never persisted", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "oneshot-probe-"));
  const secretStore = new LocalFileSecretStore(join(tmp, "secrets"));
  let receivedCredential: string | undefined;

  class ProbeStubManager extends ProviderManager {
    protected override constructProvider(
      _providerId: string,
      _projectRoot: string,
      credentialValue?: string,
    ): ResearchProvider {
      receivedCredential = credentialValue;
      return {
        async ready() {
          return {
            ready: true,
            provider: "featherless",
            models: ["google/gemma-4-31B-it"],
            detail: "probe verified",
          };
        },
      } as unknown as ResearchProvider;
    }
  }
  const pm = new ProbeStubManager({
    projectRoot: process.cwd(),
    runtimePaths: { root: tmp, config: join(tmp, "config") } as never,
    secretStore,
  });
  const result = await pm.test("featherless", transientCredential("sk-transient-xyz"));
  assert.equal(result.ok, true);
  assert.equal(receivedCredential, "sk-transient-xyz");
  assert.equal(await secretStore.has("featherless"), false);
});

test("probe results never disclose stored credential values", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "oneshot-probe-"));
  const secretValue = "sk-stored-secret-9876543210";
  const secretStore = new LocalFileSecretStore(join(tmp, "secrets"));
  await secretStore.set("featherless", {
    providerId: "featherless",
    credentialType: "api_key",
    value: secretValue,
    createdAt: new Date().toISOString(),
  });

  class EchoStubManager extends ProviderManager {
    protected override constructProvider(
      _providerId: string,
      _projectRoot: string,
      credentialValue?: string,
    ): ResearchProvider {
      return {
        async ready() {
          throw new Error(`probe failed for credential ${credentialValue ?? "none"}`);
        },
      } as unknown as ResearchProvider;
    }
  }
  const pm = new EchoStubManager({
    projectRoot: process.cwd(),
    runtimePaths: { root: tmp, config: join(tmp, "config") } as never,
    secretStore,
  });
  const result = await pm.test("featherless");
  assert.equal(result.ok, false);
  assert.ok(!JSON.stringify(result).includes(secretValue));
});

test("provider resources are closed after the probe completes", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "oneshot-probe-"));
  let closeCount = 0;

  class ClosingStubManager extends ProviderManager {
    protected override constructProvider(): ResearchProvider {
      return {
        async ready() {
          return {
            ready: false,
            provider: "featherless",
            models: [],
            detail: "not ready on purpose",
          };
        },
        close() {
          closeCount += 1;
        },
      } as unknown as ResearchProvider;
    }
  }
  const pm = new ClosingStubManager({
    projectRoot: process.cwd(),
    runtimePaths: { root: tmp, config: join(tmp, "config") } as never,
  });
  const result = await pm.test("featherless");
  assert.equal(result.ok, false);
  assert.equal(closeCount, 1, "probe provider must be closed exactly once");
});

test("HTTP /test endpoint reflects the normalized probe result", async () => {
  const savedToken = process.env.ONESHOT_API_TOKEN;
  process.env.ONESHOT_API_TOKEN = TOKEN;
  const tmp = await mkdtemp(join(tmpdir(), "oneshot-probe-http-"));
  const projectRoot = join(tmp, "project");
  const uiRoot = join(tmp, "ui");
  let server: Server | undefined;
  try {
    await mkdir(join(projectRoot, "backend", "config"), { recursive: true });
    await writeFile(
      join(projectRoot, "backend", "config", "providers.json"),
      JSON.stringify({
        version: 1,
        providers: {
          sample: { label: "OneShot Sample", type: "fixture", credentialType: "none" },
        },
      }),
    );
    await mkdir(uiRoot, { recursive: true });
    await writeFile(join(uiRoot, "index.html"), "<html>ok</html>");
    const pm = makeManager(tmp);
    server = await startHttpServer(
      {} as never,
      {} as never,
      {} as never,
      uiRoot,
      0,
      undefined,
      undefined,
      undefined,
      undefined,
      { workspaceRoot: tmp },
      undefined,
      pm,
      false,
    );
    const a = server.address();
    assert.ok(a && typeof a === "object");
    const base = `http://127.0.0.1:${(a as any).port}`;

    const tested = await (
      await fetch(`${base}/api/providers/sample/test`, {
        method: "POST",
        headers: { "content-type": "application/json", ...AUTH },
        body: "{}",
      })
    ).json();
    assert.equal(tested.ok, true);
    assert.equal(tested.provider, "sample");

    const status = await fetch(`${base}/api/providers/unknown/test`, {
      method: "POST",
      headers: { "content-type": "application/json", ...AUTH },
      body: "{}",
    });
    assert.equal(status.status, 404);
  } finally {
    if (savedToken === undefined) delete process.env.ONESHOT_API_TOKEN;
    else process.env.ONESHOT_API_TOKEN = savedToken;
    if (server) {
      // Let keep-alive sockets and async handles settle before teardown —
      // an immediate close races libuv handle teardown on Windows.
      await new Promise<void>((ok) => setTimeout(ok, 100));
      server.closeAllConnections?.();
      await new Promise<void>((ok) => server!.close(() => ok()));
      await new Promise<void>((ok) => setTimeout(ok, 50));
    }
  }
});

