import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";

process.env.REDIS_URL = process.env.EXTERNAL_RENDER_REDIS_URL || process.env.REDIS_URL;
if (!process.env.REDIS_URL) {
  console.error("No REDIS_URL or EXTERNAL_RENDER_REDIS_URL configured");
  process.exit(1);
}
process.env.ONESHOT_QUEUE_READY_TIMEOUT = "20000";
process.env.ONESHOT_REDIS_PROBE_TIMEOUT_MS = "10000";
process.env.ONESHOT_START_WORKER = "true";

const API = "http://127.0.0.1:8787";
const DEQUEUE_TIMEOUT_MS = 15_000;

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "content-type": "application/json", accept: "application/json", ...(opts.headers || {}) },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const child = spawn("node", ["--env-file=app/env/.env", "dist/backend/index.js"], {
  env: {
    ...process.env,
    REDIS_URL: process.env.REDIS_URL,
    ONESHOT_QUEUE_READY_TIMEOUT: process.env.ONESHOT_QUEUE_READY_TIMEOUT,
    ONESHOT_REDIS_PROBE_TIMEOUT_MS: process.env.ONESHOT_REDIS_PROBE_TIMEOUT_MS,
    ONESHOT_START_WORKER: process.env.ONESHOT_START_WORKER,
  },
  stdio: "inherit",
});

await setTimeout(9000);

const health = await api("/api/health");
console.log("health:", JSON.stringify({ status: health.status, mode: health.body.mode, redis: health.body.redis, queue: health.body.queue }));

if (health.body.mode !== "redis-pipeline") {
  console.error("Not in redis-pipeline mode");
  child.kill("SIGTERM");
  process.exit(1);
}

const create = await api("/api/runs", {
  method: "POST",
  body: JSON.stringify({
    intent: "M19 Redis dequeue verification.",
    requested_outcome: "Verify job dequeues from Redis pipeline queue",
    context: "dequeue verification",
    research_direction: ["contracts"],
  }),
});
console.log("create run:", JSON.stringify({ status: create.status, body: create.body }));
const runId = create.body?.run_id;

const started = Date.now();
let dequeued = false;
let lastQueue = null;
while (Date.now() - started < DEQUEUE_TIMEOUT_MS) {
  const q = await api("/api/runtime/queue");
  lastQueue = q.body;
  if (q.body.active > 0 || q.body.waiting === 0) {
    dequeued = true;
    console.log("dequeued at", Date.now() - started, "ms:", JSON.stringify(q.body));
    break;
  }
  await setTimeout(500);
}

if (!dequeued) {
  console.error("Not dequeued within", DEQUEUE_TIMEOUT_MS, "ms. Final queue:", JSON.stringify(lastQueue));
  child.kill("SIGTERM");
  process.exit(1);
}

// Optional: peek at the first history event to confirm the run started.
const hist = await api(`/api/runs/${encodeURIComponent(runId)}/history`);
console.log("history snapshot:", JSON.stringify(hist.body?.history?.slice(0, 4) ?? []));

child.kill("SIGTERM");
await setTimeout(500);
if (!child.killed) child.kill("SIGKILL");
console.log("M19 Redis dequeue verified");
