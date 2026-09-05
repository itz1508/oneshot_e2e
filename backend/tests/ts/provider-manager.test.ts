import test from "node:test";
import assert from "node:assert/strict";
import { ProviderManager } from "../../runtime/provider-manager.js";
import { LocalFileSecretStore } from "../../runtime/provider-secret-store.js";
import { FileProviderRuntimeConfigStore } from "../../runtime/provider-runtime-config.js";

test("returns configured providers", async () => {
  const pm = new ProviderManager({
    projectRoot: ".",
    catalogPath: "backend/config/providers.json",
    secretStore: new LocalFileSecretStore("/tmp/test-secrets"),
    runtimeConfigStore: new FileProviderRuntimeConfigStore("/tmp/test-runtime"),
  });
  const ids = (await pm.list()).map((p) => p.id).sort();
  assert.deepEqual(ids, ["adk_gemma2", "featherless", "sample"]);
});

test("never returns credential values", async () => {
  const pm = new ProviderManager({
    projectRoot: ".",
    catalogPath: "backend/config/providers.json",
    secretStore: new LocalFileSecretStore("/tmp/test-secrets"),
    runtimeConfigStore: new FileProviderRuntimeConfigStore("/tmp/test-runtime"),
  });
  const status = await pm.getProviderStatus("featherless");
  assert.ok(!JSON.stringify(status).includes("apiKey"));
  assert.ok(!JSON.stringify(status).includes("value"));
  assert.ok(!JSON.stringify(status).includes("secret"));
});

test("stable provider IDs", async () => {
  const pm1 = new ProviderManager({
    projectRoot: ".",
    catalogPath: "backend/config/providers.json",
    secretStore: new LocalFileSecretStore("/tmp/test-secrets"),
    runtimeConfigStore: new FileProviderRuntimeConfigStore("/tmp/test-runtime"),
  });
  const pm2 = new ProviderManager({
    projectRoot: ".",
    catalogPath: "backend/config/providers.json",
    secretStore: new LocalFileSecretStore("/tmp/test-secrets"),
    runtimeConfigStore: new FileProviderRuntimeConfigStore("/tmp/test-runtime"),
  });
  const ids1 = (await pm1.list()).map((p) => p.providerId).sort();
  const ids2 = Object.keys(pm2["catalog"].providers).sort();
  assert.deepEqual(ids1, ids2);
});

test("active/configured/ready state is truthful", async () => {
  const pm = new ProviderManager({
    projectRoot: ".",
    catalogPath: "backend/config/providers.json",
    secretStore: new LocalFileSecretStore("/tmp/test-secrets"),
    runtimeConfigStore: new FileProviderRuntimeConfigStore("/tmp/test-runtime"),
  });
  const sample = await pm.getProviderStatus("sample");
  assert.equal(sample.configured, true);
  assert.equal(sample.credentialSource, "none");
  assert.equal(sample.active, true);

  const featherless = await pm.getProviderStatus("featherless");
  assert.equal(featherless.configured, true);
  assert.equal(featherless.credentialType, "api_key");
  assert.equal(featherless.active, false);
});
