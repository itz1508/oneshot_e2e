import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createConnection } from "node:net";

const ROOT = resolve(process.cwd());
const BACKEND_ENTRY = resolve(ROOT, "dist/backend/index.js");

function redisReachable(port = 6379): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

async function makeEnvDir(env: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "oneshot-lifecycle-"));
  await mkdir(join(dir, "app", "env"), { recursive: true });
  const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  await writeFile(join(dir, "app", "env", ".env"), lines.join("\n") + "\n", "utf8");
  return dir;
}

interface SpawnResult {
  process: ReturnType<typeof spawn>;
  stdout: string[];
  stderr: string[];
  exit: Promise<number | null>;
}

function startBackend(
  cwd: string,
  env: Record<string, string>,
): SpawnResult {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const child = spawn(process.execPath, [BACKEND_ENTRY], {
    cwd,
    env: {
      ...process.env,
      ...env,
      ONESHOT_ROOT: ROOT,
      ONESHOT_RUNTIME_DIR: join(cwd, ".runtime"),
      NODE_ENV: "test",
    },
    detached: true,
  });

  child.stdout?.on("data", (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) stdout.push(line.trim());
    }
  });
  child.stderr?.on("data", (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) stderr.push(line.trim());
    }
  });

  const exit = new Promise<number | null>((resolve) => {
    child.on("exit", (code) => resolve(code));
    child.on("error", () => resolve(null));
  });

  return { process: child, stdout, stderr, exit };
}

async function waitForReady(
  stdout: string[],
  timeoutMs = 15_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (stdout.some((l) => l.includes("ONESHOT_SERVER_READY"))) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

async function httpGet(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url);
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function cleanup(cwd: string, child: ReturnType<typeof spawn>) {
  try {
    process.kill(-child.pid!, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
  await new Promise((r) => setTimeout(r, 500));
  try {
    process.kill(-child.pid!, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {}
  }
  await rm(cwd, { recursive: true, force: true });
}

test("Redis unavailable + optional → standalone, ready 200, no repeated connection errors", async () => {
  const envDir = await makeEnvDir({
    PORT: "8787",
    ONESHOT_BIND_HOST: "127.0.0.1",
    ONESHOT_REQUIRE_REDIS: "false",
    REDIS_URL: "redis://127.0.0.1:1",
  });
  const { process: child, stdout, stderr, exit } = startBackend(envDir, {});

  try {
    const ready = await waitForReady(stdout);
    assert.equal(ready, true, "server should announce ONESHOT_SERVER_READY");

    await new Promise((r) => setTimeout(r, 3_000));

    const readyLog = stdout.find((l) => l.includes("ONESHOT_SERVER_READY"));
    assert.ok(readyLog, "missing ONESHOT_SERVER_READY log line");
    assert.ok(
      readyLog.includes("mode=standalone"),
      `expected standalone mode, got: ${readyLog}`,
    );

    const afterReady = stdout.slice(stdout.indexOf(readyLog!) + 1);
    assert.ok(
      !afterReady.some((l) => l.includes("ECONNREFUSED")),
      "unexpected Redis reconnection errors after standalone fallback",
    );
    // Probe errors are bounded (one per failed Redis mode attempt); they
    // must not become a reconnect storm.
    const allConnErrors = stderr.filter((l) => l.includes("ECONNREFUSED"));
    assert.ok(
      allConnErrors.length <= 2,
      `expected bounded connection errors, got ${allConnErrors.length}: ${allConnErrors.join("; ")}`,
    );

    const health = await httpGet("http://127.0.0.1:8787/api/health");
    assert.equal(health.status, 200);
    assert.equal((health.body as any).mode, "standalone");
    assert.equal((health.body as any).redis, "disabled");
    assert.equal((health.body as any).queue, "disabled");
    assert.equal((health.body as any).worker, "disabled");

    const readyRes = await httpGet("http://127.0.0.1:8787/api/ready");
    assert.equal(readyRes.status, 200);
    assert.equal((readyRes.body as any).status, "ready");
  } finally {
    await cleanup(envDir, child);
    await exit;
  }
});

test("Redis unavailable + required → unavailable, ready 503, no standalone fallback", async () => {
  const envDir = await makeEnvDir({
    PORT: "8788",
    ONESHOT_BIND_HOST: "127.0.0.1",
    ONESHOT_REQUIRE_REDIS: "true",
    REDIS_URL: "redis://127.0.0.1:1",
  });
  const { process: child, stdout, stderr, exit } = startBackend(envDir, {});

  try {
    const ready = await waitForReady(stdout);
    assert.equal(ready, true, "server should announce ONESHOT_SERVER_READY");

    await new Promise((r) => setTimeout(r, 3_000));

    const readyLog = stdout.find((l) => l.includes("ONESHOT_SERVER_READY"));
    assert.ok(readyLog, "missing ONESHOT_SERVER_READY log line");
    assert.ok(
      !readyLog.includes("mode=standalone"),
      `standalone must not activate when Redis is required: ${readyLog}`,
    );
    assert.ok(
      readyLog.includes("mode=unavailable"),
      `expected unavailable mode, got: ${readyLog}`,
    );

    const afterReady = stdout.slice(stdout.indexOf(readyLog!) + 1);
    assert.ok(
      !afterReady.some((l) => l.includes("ECONNREFUSED")),
      "unexpected Redis reconnection errors after ready",
    );

    const allConnErrors = stderr.filter((l) => l.includes("ECONNREFUSED"));
    assert.ok(
      allConnErrors.length <= 2,
      `expected bounded connection errors, got ${allConnErrors.length}: ${allConnErrors.join("; ")}`,
    );

    const health = await httpGet("http://127.0.0.1:8788/api/health");
    assert.equal(health.status, 200);
    assert.equal((health.body as any).mode, "unavailable");
    // Because Redis was never reached, no persistent queue resources were
    // created; health reports them as disabled rather than unavailable.
    assert.equal((health.body as any).redis, "disabled");
    assert.equal((health.body as any).queue, "disabled");

    const readyRes = await httpGet("http://127.0.0.1:8788/api/ready");
    assert.equal(readyRes.status, 503);
    assert.equal((readyRes.body as any).status, "not-ready");
  } finally {
    await cleanup(envDir, child);
    await exit;
  }
});

test("Redis available → pipeline mode and readiness unchanged", async () => {
  if (!(await redisReachable(6379))) {
    test.skip("Redis not reachable on 127.0.0.1:6379");
    return;
  }

  const envDir = await makeEnvDir({
    PORT: "8789",
    ONESHOT_BIND_HOST: "127.0.0.1",
    ONESHOT_REQUIRE_REDIS: "false",
    REDIS_URL: "redis://127.0.0.1:6379",
  });
  const { process: child, stdout, exit } = startBackend(envDir, {});

  try {
    const ready = await waitForReady(stdout);
    assert.equal(ready, true, "server should announce ONESHOT_SERVER_READY");

    const readyLog = stdout.find((l) => l.includes("ONESHOT_SERVER_READY"));
    assert.ok(readyLog, "missing ONESHOT_SERVER_READY log line");
    assert.ok(
      readyLog.includes("mode=redis-pipeline") ||
        readyLog.includes("mode=redis-legacy"),
      `expected Redis execution mode, got: ${readyLog}`,
    );

    const health = await httpGet("http://127.0.0.1:8789/api/health");
    assert.equal(health.status, 200);
    assert.ok(
      ["redis-pipeline", "redis-legacy"].includes((health.body as any).mode),
      `expected Redis mode in health, got: ${JSON.stringify(health.body)}`,
    );
    assert.equal((health.body as any).queue, "ok");

    const readyRes = await httpGet("http://127.0.0.1:8789/api/ready");
    assert.equal(readyRes.status, 200);
  } finally {
    await cleanup(envDir, child);
    await exit;
  }
});

test("startOneShot close() is idempotent", async () => {
  const envDir = await makeEnvDir({
    ONESHOT_REQUIRE_REDIS: "false",
    REDIS_URL: "redis://127.0.0.1:1",
  });
  process.env.ONESHOT_ROOT = ROOT;
  process.env.ONESHOT_RUNTIME_DIR = join(envDir, ".runtime");
  process.env.ONESHOT_REQUIRE_REDIS = "false";
  process.env.REDIS_URL = "redis://127.0.0.1:1";
  const { startOneShot } = await import("../../startup.js");
  const result = await startOneShot({ projectRoot: ROOT, port: 0 });

  try {
    assert.equal(result.runtimeInfo.mode, "standalone");
    const addr = result.server.address();
    assert.ok(addr && typeof addr === "object");

    await Promise.all([result.close(), result.close()]);

    await assert.rejects(
      async () => {
        await new Promise<void>((resolve, reject) => {
          result.server.close((err) => (err ? reject(err) : resolve()));
        });
      },
      /Not running|ERR_SERVER_NOT_RUNNING/,
    );
  } finally {
    await result.close().catch(() => {});
    await rm(envDir, { recursive: true, force: true });
  }
});

