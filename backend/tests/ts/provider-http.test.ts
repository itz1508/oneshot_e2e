import test from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startHttpServer } from "../../server/http-server.js";
import { ProviderManager } from "../../runtime/provider-manager.js";
import { LocalFileSecretStore } from "../../runtime/provider-secret-store.js";
import { FileProviderRuntimeConfigStore } from "../../runtime/provider-runtime-config.js";
import { AdkGemmaResearchProvider } from "../../role/researcher/provider/adk-gemma2/provider.js";

const TOKEN = "provider-http-test";
const AUTH = { Authorization: `Bearer ${TOKEN}` };

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections?.();
  await new Promise<void>((ok, fail) =>
    server.close((err) => (err ? fail(err) : ok())),
  );
}

async function putJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json", ...AUTH },
    body: JSON.stringify(body),
  });
}

async function postJson(url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...AUTH },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
test("provider HTTP endpoints: list/get/update/test/activate + 404s", async () => {
  const savedToken = process.env.ONESHOT_API_TOKEN;
  process.env.ONESHOT_API_TOKEN = TOKEN;
  const tmp = await mkdtemp(join(tmpdir(), "oneshot-provider-http-"));
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
          featherless: { label: "Featherless AI", type: "featherless", credentialType: "api_key", credentialEnv: "FEATHERLESS_API_KEY" },
        },
      }),
    );
    await mkdir(uiRoot, { recursive: true });
    await writeFile(join(uiRoot, "index.html"), "<html>ok</html>");
    const pm = new ProviderManager({
      projectRoot,
      secretStore: new LocalFileSecretStore(join(tmp, "secrets")),
      runtimeConfigStore: new FileProviderRuntimeConfigStore(join(tmp, "runtime-config", "providers.json")),
    });
    server = await startHttpServer({} as any, {} as any, {} as any, uiRoot, 0, undefined, undefined, undefined, undefined, { workspaceRoot: tmp }, undefined, pm, false);
    const a = server.address();
    assert.ok(a && typeof a === "object");
    const base = `http://127.0.0.1:${(a as any).port}`;
    const list = await (await fetch(`${base}/api/providers`, { headers: AUTH })).json();
    assert.equal(list.activeProvider, "sample");
    assert.ok(Array.isArray(list.providers));
    const sample = list.providers.find((p: any) => p.id === "sample");
    assert.ok(sample, "sample provider listed");
    assert.equal(typeof sample.editable, "boolean");
    assert.ok(!JSON.stringify(list).includes("apiKey"));
    assert.ok(!JSON.stringify(list).includes("value"));
    const detail = await (await fetch(`${base}/api/providers/sample`, { headers: AUTH })).json();
    assert.equal(detail.id, "sample");
    assert.equal(detail.configured, true);
    const updated = await (await putJson(`${base}/api/providers/sample`, { model: "fixture-x" })).json();
    assert.equal(updated.id, "sample");
    assert.equal(updated.runtime.model, "fixture-x");
    const tested = await (await postJson(`${base}/api/providers/sample/test`, {})).json();
    assert.equal(tested.ok, true);
    assert.equal(tested.provider, "sample");
    assert.ok(!JSON.stringify(tested).includes("apiKey"));
    const activated = await (await postJson(`${base}/api/providers/featherless/activate`, {})).json();
    assert.equal(activated.activeProvider, "featherless");
    assert.equal(activated.provider.id, "featherless");
    const list2 = await (await fetch(`${base}/api/providers`, { headers: AUTH })).json();
    assert.equal(list2.activeProvider, "featherless");
    assert.equal((await fetch(`${base}/api/providers/unknown`, { headers: AUTH })).status, 404);
    assert.equal((await putJson(`${base}/api/providers/unknown`, { model: "x" })).status, 404);
    assert.equal((await postJson(`${base}/api/providers/unknown/activate`, {})).status, 404);
  } finally {
    if (server) await closeServer(server);
    process.env.ONESHOT_API_TOKEN = savedToken;
    await rm(tmp, { recursive: true, force: true });
  }
});
test("static UI denies HTTP reads of .env / .git / .runtime / credentials", async () => {
  const savedToken = process.env.ONESHOT_API_TOKEN;
  process.env.ONESHOT_API_TOKEN = TOKEN;
  const tmp = await mkdtemp(join(tmpdir(), "oneshot-static-deny-"));
  const uiRoot = join(tmp, "ui");
  let server: Server | undefined;
  try {
    await mkdir(uiRoot, { recursive: true });
    await writeFile(join(uiRoot, "index.html"), "<html>ok</html>");
    await writeFile(join(uiRoot, ".env"), "SECRET=must-never-leak-via-http");
    await mkdir(join(uiRoot, ".git"), { recursive: true });
    await writeFile(join(uiRoot, ".git", "config"), "git-data");
    await mkdir(join(uiRoot, ".runtime", "config"), { recursive: true });
    await writeFile(join(uiRoot, ".runtime", "config", "providers.json"), `{"activeProvider":"sample"}`);
    await mkdir(join(uiRoot, "credentials"), { recursive: true });
    await writeFile(join(uiRoot, "credentials", "x.json"), "cred-data");
    server = await startHttpServer({} as any, {} as any, {} as any, uiRoot, 0, undefined, undefined, undefined, undefined, { workspaceRoot: tmp }, undefined, undefined, false);
    const a = server.address();
    assert.ok(a && typeof a === "object");
    const base = `http://127.0.0.1:${(a as any).port}`;
    const index = await fetch(`${base}/index.html`, { headers: AUTH });
    assert.equal(index.status, 200);
    for (const rel of [".env", ".git/config", ".runtime/config/providers.json", "credentials/x.json"]) {
      const res = await fetch(`${base}/${rel}`, { headers: AUTH });
      assert.equal(res.status, 404, `${rel} should be denied`);
      const body = await res.text();
      assert.ok(!body.includes("must-never-leak"), `${rel} leaked secret`);
      assert.ok(!body.includes("git-data"), `${rel} leaked git data`);
      assert.ok(!body.includes("cred-data"), `${rel} leaked credential`);
      assert.ok(!body.includes("activeProvider"), `${rel} leaked runtime config`);
    }
  } finally {
    if (server) await closeServer(server);
    process.env.ONESHOT_API_TOKEN = savedToken;
    await rm(tmp, { recursive: true, force: true });
  }
});
