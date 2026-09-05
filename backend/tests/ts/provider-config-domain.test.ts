import test from "node:test";
import assert from "node:assert/strict";
import { ProviderManager } from "../../runtime/provider-manager.js";
import { LocalFileSecretStore } from "../../runtime/provider-secret-store.js";
import { FileProviderRuntimeConfigStore } from "../../runtime/provider-runtime-config.js";

test("catalog loads with all expected providers", async () => {
  const pm = new ProviderManager({
    projectRoot: ".",
    catalogPath: "backend/config/providers.json",
    secretStore: new LocalFileSecretStore("/tmp/test-secrets"),
    runtimeConfigStore: new FileProviderRuntimeConfigStore("/tmp/test-runtime"),
  });
  const providerIds = (await pm.list()).map((p) => p.id).sort();
  assert.deepEqual(providerIds.sort(), [
    "anthropic",
    "featherless",
    "gemini",
    "openai",
    "sample",
  ].sort());
});

test("environment credential takes precedence over local secret store", async () => {
  const pm = new ProviderManager({
    projectRoot: ".",
    catalogPath: "backend/config/providers.json",
    secretStore: new LocalFileSecretStore("/tmp/test-secrets"),
    runtimeConfigStore: new FileProviderRuntimeConfigStore("/tmp/test-runtime"),
  });
  // Set environment credential
  process.env.FEATHERLESS_API_KEY = "test-api-key";
  const status = await pm.getProviderStatus("featherless");
  assert.equal(status.credentialSource, "env-var");
  delete process.env.FEATHERLESS_API_KEY;
});

test("stable provider IDs", async () => {
  const pm = new ProviderManager({
    projectRoot: ".",
    catalogPath: "backend/config/providers.json",
    secretStore: new LocalFileSecretStore("/tmp/test-secrets"),
    runtimeConfigStore: new FileProviderRuntimeConfigStore("/tmp/test-runtime"),
  });
  const ids = (await pm.list()).map((p) => p.providerId).sort();
  assert.deepEqual(ids, ["anthropic", "featherless", "gemini", "openai", "sample"]);
});

test("active/configured/ready state is truthful", async () => {
  const pm = new ProviderManager({
    projectRoot: ".",
    catalogPath: "backend/config/providers.json",
    secretStore: new LocalFileSecretStore("/tmp/test-secrets"),
    runtimeConfigStore: new FileProviderRuntimeConfigStore("/tmp/test-runtime"),
  });
  const sample = (await pm.listProviderStatus()).find(
    (s) => s.providerId === "sample",
  )!;
  assert.equal(sample.configured, true);
  assert.equal(sample.credentialSource, "none");
  assert.equal(sample.active, true);

  const featherless = (await pm.listProviderStatus()).find(
    (s) => s.providerId === "featherless",
  )!;
  assert.equal(featherless.configured, true);
  assert.equal(featherless.credentialType, "api_key");
});
