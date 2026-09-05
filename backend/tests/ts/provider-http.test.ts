import test from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startHttpServer } from "../../server/http-server.js";
import { ProviderManager } from "../../runtime/provider-manager.js";
import { LocalFileSecretStore } from "../../runtime/provider-secret-store.js";
import { FileProviderRuntimeConfigStore } from "../../runtime/provider-runtime-config.js";
import { AdkGemmaResearchProvider } from "../../role/researcher/provider/adk-gemma2/provider.js";
import { ProcessingEventBus } from "../../runtime/event-bus.js";
import { RunRepository } from "../../runtime/run-repository.js";
import { ConversationStore } from "../../intent/conversation-store.js";
import { IntentCollectionService } from "../../intent/intent-collection.js";
import type { RunQueue } from "../../runtime/queue.js";

test("production API: setup, all public provider names, write-only keys, activation, removal, and both submission routes", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "provider-lifecycle-"));
  const savedToken = process.env.ONESHOT_API_TOKEN;
  process.env.ONESHOT_API_TOKEN = TOKEN;
  const savedEnv = Object.fromEntries(["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"].map(k => [k, process.env[k]]));
  for (const k of Object.keys(savedEnv)) delete process.env[k];
  const pm = new ProviderManager({ projectRoot: process.cwd(), mode: "production",
    secretStore: new LocalFileSecretStore(join(tmp, "secrets")),
    runtimeConfigStore: new FileProviderRuntimeConfigStore(join(tmp, "providers.json")) });
  const jobs: any[] = [];
  const queue = { addRun: async (job: unknown) => { jobs.push(structuredClone(job)); return { jobId: "test" }; },
    getJobCounts: async () => ({ waiting: jobs.length, active: 0, failed: 0 }) } as unknown as RunQueue;
  const events = new ProcessingEventBus();
  const runs = new RunRepository(join(tmp, "runs"));
  const intent = new IntentCollectionService(new ConversationStore());
  let inline = 0;
  const server = await startHttpServer({ run: async () => { inline++; } } as any,
    runs, events, tmp, 0, undefined, intent, undefined,
    { mode: "sample", provider: "FeatherlessResearchProvider" },
    { workspaceRoot: tmp }, queue, pm, true);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const get = async (path: string) => (await fetch(base + path, { headers: AUTH })).json();
  try {
    const initial = await get("/api/health");
    assert.equal(initial.provider, "<default>");
    assert.equal(initial.mode, "production");
    assert.equal(initial.providerConfiguration, "unconfigured");
    assert.equal(initial.redis, "ok");
    assert.equal(initial.queue, "ok");
    assert.equal(initial.worker, "ok");
    assert.equal((await postJson(base + "/api/runs", { intent: "test" })).status, 409);
    const list = await get("/api/providers");
    assert.deepEqual(list.providers.map((p: any) => p.displayName).sort(), ["Anthropic", "Gemini", "OpenAI"]);
    for (const id of ["sample", "featherless", "adk_gemma2", "google"]) {
      assert.equal((await fetch(base + "/api/providers/" + id, { headers: AUTH })).status, 404);
    }
    for (const [id, name] of [["openai", "OpenAI"], ["anthropic", "Anthropic"], ["gemini", "Gemini"]]) {
      const key = "private-test-" + id;
      assert.equal((await putJson(base + "/api/providers/" + id + "/credential", { value: key })).status, 200);
      assert.equal((await postJson(base + "/api/providers/" + id + "/activate")).status, 200);
      const health = await get("/api/health");
      assert.equal(health.provider, name);
      assert.equal(health.providerConfiguration, "configured");
      for (const path of ["/api/health", "/api/providers", "/api/providers/" + id, "/api/runtime/queue"]) {
        const body = JSON.stringify(await get(path));
        assert.ok(!body.includes(key));
        assert.doesNotMatch(body, /FeatherlessResearchProvider|OpenAIModelProvider|AnthropicModelProvider|GeminiModelProvider/);
      }
    }
    await postJson(base + "/api/runs", { intent: "Run pinned configuration" });
    const captured = structuredClone(jobs[0]);
    const conversation = await (await postJson(base + "/api/conversations", {
      message: "Build a compact media utility that accepts MP4 and MP3 files. Produce a validated implementation plan with deterministic validation evidence and a final hash proof.",
    })).json();
    const response = await postJson(base + "/api/conversations/" + conversation.conversation_id + "/run");
    assert.equal(response.status, 202);
    assert.equal(jobs.length, 2, "Generate must use BullMQ too");
    assert.equal(inline, 0);
    await pm.update("gemini", { model: "new-model" });
    await pm.activate("openai");
    assert.deepEqual(jobs[0], captured);
    assert.equal(captured.providerId, "gemini");
    assert.ok(captured.model);
    assert.equal(captured.model, captured.settings.model);
    assert.equal(typeof captured.revision, "number");
    assert.ok(!JSON.stringify(jobs).includes("private-test-"));
    await fetch(base + "/api/providers/openai/credential", { method: "DELETE", headers: AUTH });
    assert.equal((await get("/api/health")).provider, "<default>");
  } finally {
    await closeServer(server);
    if (savedToken === undefined) delete process.env.ONESHOT_API_TOKEN; else process.env.ONESHOT_API_TOKEN = savedToken;
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    await rm(tmp, { recursive: true, force: true });
  }
});

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
          openai: { label: "OpenAI", type: "openai", credentialType: "api_key", credentialEnv: "OPENAI_API_KEY" },
        },
      }),
    );
    await mkdir(uiRoot, { recursive: true });
    await mkdir(join(projectRoot, "app/fixtures/product"), { recursive: true });
    await writeFile(join(projectRoot, "app/fixtures/product/complete-success-seed.json"),
      await readFile("app/fixtures/product/complete-success-seed.json"));
    await writeFile(join(uiRoot, "index.html"), "<html>ok</html>");
    const pm = new ProviderManager({
      mode: "sample",
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
    assert.equal(tested.provider, "<default>");
    assert.ok(!JSON.stringify(tested).includes("apiKey"));
    await putJson(`${base}/api/providers/openai/credential`, { value: "http-test-only-key" });
    const activated = await (await postJson(`${base}/api/providers/openai/activate`, {})).json();
    assert.equal(activated.activeProvider, "openai");
    assert.equal(activated.provider.id, "openai");
    const list2 = await (await fetch(`${base}/api/providers`, { headers: AUTH })).json();
    assert.equal(list2.activeProvider, "openai");
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
