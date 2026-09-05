import test from "node:test";
import assert from "node:assert/strict";
import { ProviderManager } from "../../runtime/provider-manager.js";
import { LocalFileSecretStore } from "../../runtime/provider-secret-store.js";
import { FileProviderRuntimeConfigStore } from "../../runtime/provider-runtime-config.js";

test("returns configured providers", async () => {
  const pm = new ProviderManager({
    projectRoot: ".",
    mode: "sample",
    catalogPath: "backend/config/providers.json",
    secretStore: new LocalFileSecretStore("/tmp/test-secrets"),
    runtimeConfigStore: new FileProviderRuntimeConfigStore("/tmp/test-runtime"),
  });
  const ids = (await pm.list()).map((p) => p.id).sort();
  assert.deepEqual(ids, ["anthropic", "gemini", "openai", "sample"]);
});

test("never returns credential values", async () => {
  const pm = new ProviderManager({
    projectRoot: ".",
    mode: "sample",
    catalogPath: "backend/config/providers.json",
    secretStore: new LocalFileSecretStore("/tmp/test-secrets"),
    runtimeConfigStore: new FileProviderRuntimeConfigStore("/tmp/test-runtime"),
  });
  const status = await pm.getProviderStatus("openai");
  assert.ok(!JSON.stringify(status).includes("apiKey"));
  assert.ok(!JSON.stringify(status).includes("value"));
  assert.ok(!JSON.stringify(status).includes("secret"));
});

test("stable provider IDs", async () => {
  const pm1 = new ProviderManager({
    projectRoot: ".",
    mode: "sample",
    catalogPath: "backend/config/providers.json",
    secretStore: new LocalFileSecretStore("/tmp/test-secrets"),
    runtimeConfigStore: new FileProviderRuntimeConfigStore("/tmp/test-runtime"),
  });
  const pm2 = new ProviderManager({
    projectRoot: ".",
    mode: "sample",
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
    mode: "sample",
    catalogPath: "backend/config/providers.json",
    secretStore: new LocalFileSecretStore("/tmp/test-secrets"),
    runtimeConfigStore: new FileProviderRuntimeConfigStore("/tmp/test-runtime"),
  });
  const sample = await pm.getProviderStatus("sample");
  assert.equal(sample.configured, true);
  assert.equal(sample.credentialSource, "none");
  assert.equal(sample.active, true);

  const openai = await pm.getProviderStatus("openai");
  assert.equal(openai.configured, false);
  assert.equal(openai.credentialType, "api_key");
  assert.equal(openai.active, false);
});

test("public name resolution does not leak implementation class names", async () => {
  const pm = new ProviderManager({
    projectRoot: ".",
    mode: "sample",
    catalogPath: "backend/config/providers.json",
    secretStore: new LocalFileSecretStore("/tmp/test-secrets"),
    runtimeConfigStore: new FileProviderRuntimeConfigStore("/tmp/test-runtime"),
  });
  // sample → <default>
  assert.equal(pm.publicNameFor("sample"), "<default>");
  // public providers → their display names
  assert.equal(pm.publicNameFor("openai"), "OpenAI");
  assert.equal(pm.publicNameFor("anthropic"), "Anthropic");
  assert.equal(pm.publicNameFor("gemini"), "Gemini");
  // no implementation class names leak
  const allNames = ["sample", "openai", "anthropic", "gemini"].map((id) => pm.publicNameFor(id));
  for (const name of allNames) {
    assert.ok(!name.includes("Provider"), `name "${name}" should not include "Provider"`);
    assert.ok(!name.includes("ResearchProvider"), `name "${name}" should not include "ResearchProvider"`);
    assert.ok(!name.includes("ModelProvider"), `name "${name}" should not include "ModelProvider"`);
    assert.ok(!name.includes("Featherless"), `name "${name}" should not include "Featherless"`);
    assert.ok(!name.includes("AdkGemma"), `name "${name}" should not include "AdkGemma"`);
  }
});
