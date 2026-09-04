#!/usr/bin/env node
/**
 * Queue/Redis readiness for the canonical bootstrap.
 *
 * Determines whether queue mode requires Redis (ONESHOT_QUEUE_REQUIRED) and
 * PROVES readiness before the app is reported ready. Flow:
 *   REDIS_URL configured → probe; else redis-server found → start a local
 *   instance; else Docker + policy → launch a local redis:7-alpine container;
 *   else → ROOT_CAUSE with installation instructions.
 *
 * Nothing is downloaded/run silently: every step is logged. Queue-optional mode
 * (ONESHOT_QUEUE_REQUIRED unset) degrades to inline run execution — valid, not
 * a failure.
 */
import net from "node:net";
import { execSync } from "node:child_process";

function parseRedisUrl(raw) {
  try {
    const u = new URL(raw);
    return { host: u.hostname || "127.0.0.1", port: u.port ? Number(u.port) : 6379 };
  } catch {
    return { host: "127.0.0.1", port: 6379 };
  }
}

function probe(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      try { sock.destroy(); } catch { /* ignore */ }
      resolve(ok);
    };
    const sock = net.createConnection({ host, port });
    const t = setTimeout(() => finish(false), timeoutMs);
    sock.on("connect", () => finish(true));
    sock.on("error", () => finish(false));
    sock.on("close", () => finish(false));
  });
}

function hasCommand(cmd) {
  try {
    execSync(process.platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`, {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/** @returns {Promise<{ok:boolean, source:string, redisUrl:string, message:string, rootCause?:string}>} */
export async function ensureQueueReadiness(opts = {}) {
  const required = process.env.ONESHOT_QUEUE_REQUIRED === "true" || opts.required === true;
  const allowDocker = process.env.ONESHOT_BOOTSTRAP_ALLOW_DOCKER !== "false" && opts.allowDocker !== false;
  const log = opts.log || ((m) => console.log(`[redis] ${m}`));
  const configuredUrl = process.env.REDIS_URL || "";
  const url = configuredUrl || "redis://127.0.0.1:6379";
  const { host, port } = parseRedisUrl(url);

  // 1. Probe the configured (or default local) Redis.
  log(`Probing Redis at ${host}:${port} (REDIS_URL=${configuredUrl ? "set" : "unset → default"}) ...`);
  if (await probe(host, port)) {
    log(`Redis reachable at ${host}:${port}`);
    return { ok: true, source: configuredUrl ? "configured-url" : "default-local", redisUrl: url, message: "Redis reachable" };
  }

  // Queue optional → inline fallback is a valid state, not a failure.
  if (!required) {
    log("Redis not reachable and ONESHOT_QUEUE_REQUIRED is not set — runs execute inline (fully functional).");
    return { ok: true, source: "inline-fallback", redisUrl: url, message: "Redis unavailable; inline fallback (queue optional)" };
  }

  // 2. A local redis-server is installed → start a documented local instance.
  if (process.platform !== "win32" && hasCommand("redis-server")) {
    log("Redis required but unreachable; redis-server found — starting a local instance (documented) ...");
    try {
      execSync('redis-server --daemonize yes --appendonly yes --port 6379 --save ""', { stdio: "ignore" });
    } catch (e) {
      log(`redis-server start attempt failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (await probe("127.0.0.1", 6379, 3000)) {
      log("Local redis-server started and reachable on 127.0.0.1:6379");
      process.env.REDIS_URL = "redis://127.0.0.1:6379";
      return { ok: true, source: "local-redis-server", redisUrl: "redis://127.0.0.1:6379", message: "Started local redis-server" };
    }
    log("Local redis-server did not become reachable; continuing.");
  }

  // 3. Docker available + policy allows it → launch a local container.
  if (allowDocker && hasCommand("docker")) {
    log("Docker found and policy allows it — launching a local Redis container (documented; 127.0.0.1 only; not public) ...");
    try { execSync("docker rm -f oneshot-redis", { stdio: "ignore" }); } catch { /* none */ }
    try {
      execSync("docker run -d --name oneshot-redis -p 127.0.0.1:6379:6379 redis:7-alpine redis-server --appendonly yes", { stdio: "ignore" });
    } catch (e) {
      log(`docker launch attempt failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    for (let i = 0; i < 20; i++) {
      if (await probe("127.0.0.1", 6379, 1000)) {
        log("Local Redis container is reachable on 127.0.0.1:6379");
        process.env.REDIS_URL = "redis://127.0.0.1:6379";
        return { ok: true, source: "docker-container", redisUrl: "redis://127.0.0.1:6379", message: "Launched local Redis container" };
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    log("Launched container did not become reachable; continuing.");
  }

  // 4. ROOT_CAUSE with installation instructions.
  const instructions = [
    "Redis is required for queue-backed runs (ONESHOT_QUEUE_REQUIRED=true) but is not reachable.",
    "Choose ONE:",
    "  1. Start Redis and set REDIS_URL (e.g. redis://127.0.0.1:6379).",
    "  2. Install redis-server locally (https://redis.io/download) — bootstrap will start it.",
    "  3. Install Docker and re-run (bootstrap will launch a local redis:7-alpine container).",
    "  4. Set ONESHOT_QUEUE_REQUIRED=false to use inline run execution (no Redis needed).",
  ];
  for (const line of instructions) log(line);
  return { ok: false, source: "unavailable", redisUrl: url, message: "Redis required but unavailable", rootCause: instructions.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ensureQueueReadiness().then((r) => {
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) process.exit(1);
  });
}