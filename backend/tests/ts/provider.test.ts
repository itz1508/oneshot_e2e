import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProviderManager } from "../../provider/manager.js";
import { LocalFileSecretStore } from "../../provider/secret-store.js";
import { FileProviderRuntimeConfigStore } from "../../provider/runtime-config.js";

for (const id of ["openai", "anthropic", "gemini"] as const) {
  test(`${id} resolves to a model transport, never a Researcher`, async () => {
    const root = mkdtempSync(join(tmpdir(), `oneshot-${id}-`));
    const pm = new ProviderManager({
      projectRoot: process.cwd(), mode: "production",
      secretStore: new LocalFileSecretStore(join(root, "secrets")),
      runtimeConfigStore: new FileProviderRuntimeConfigStore(join(root, "providers.json")),
    });
    try {
      await pm.setCredential(id, { providerId: id, credentialType: "api_key", value: `test-${id}-key`, createdAt: new Date().toISOString() });
      await pm.activate(id);
      const captured = pm.captureForRun();
      const provider = await pm.resolveForRun(id, captured);
      assert.ok(provider);
      assert.equal(provider.id, id);
      assert.equal(typeof provider.generate, "function");
      assert.equal("research" in provider, false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
