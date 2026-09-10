import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProviderManager } from "../../provider/manager.js";
import { LocalFileSecretStore } from "../../provider/secret-store.js";
import { FileProviderRuntimeConfigStore } from "../../provider/runtime-config.js";

function manager(mode: "production" | "sample" = "sample") {
  const root = mkdtempSync(join(tmpdir(), "oneshot-provider-manager-"));
  const pm = new ProviderManager({
    projectRoot: process.cwd(),
    mode,
    secretStore: new LocalFileSecretStore(join(root, "secrets")),
    runtimeConfigStore: new FileProviderRuntimeConfigStore(join(root, "providers.json")),
  });
  return { pm, root };
}

test("provider catalog contains only real model providers", async () => {
  const { pm, root } = manager();
  try {
    assert.deepEqual((await pm.list()).map((p) => p.id).sort(), ["anthropic", "gemini", "openai"]);
    assert.equal(await pm.get("sample"), undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("sample mode is Researcher runtime behavior, not Provider Configuration", async () => {
  const { pm, root } = manager();
  try {
    const captured = pm.captureForRun();
    assert.equal(captured.id, "sample");
    assert.equal(await pm.resolveForRun(captured.id, captured), undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("provider status never returns credential values", async () => {
  const { pm, root } = manager("production");
  try {
    await pm.setCredential("openai", {
      providerId: "openai", credentialType: "api_key", value: "private-provider-test-value", createdAt: new Date().toISOString(),
    });
    const status = await pm.getProviderStatus("openai");
    const serialized = JSON.stringify(status);
    assert.ok(!serialized.includes("private-provider-test-value"));
    assert.ok(!serialized.includes("apiKey"));
    assert.equal(status.configured, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
