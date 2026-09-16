import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";

process.env.REDIS_URL = process.env.EXTERNAL_RENDER_REDIS_URL || process.env.REDIS_URL;
if (!process.env.REDIS_URL) {
  console.error("No REDIS_URL or EXTERNAL_RENDER_REDIS_URL configured");
  process.exit(1);
}
process.env.ONESHOT_QUEUE_READY_TIMEOUT = "20000";
process.env.ONESHOT_REDIS_PROBE_TIMEOUT_MS = "10000";

const child = spawn("node", ["--env-file=app/env/.env", "dist/backend/index.js"], {
  env: {
    ...process.env,
    REDIS_URL: process.env.REDIS_URL,
    ONESHOT_QUEUE_READY_TIMEOUT: process.env.ONESHOT_QUEUE_READY_TIMEOUT,
    ONESHOT_REDIS_PROBE_TIMEOUT_MS: process.env.ONESHOT_REDIS_PROBE_TIMEOUT_MS,
  },
  stdio: "inherit",
});

await setTimeout(10000);

const health = await (await fetch("http://127.0.0.1:8787/api/health")).json();
console.log(JSON.stringify({ mode: health.mode, redis: health.redis, queue: health.queue }, null, 2));

child.kill("SIGTERM");
await setTimeout(500);
if (!child.killed) child.kill("SIGKILL");
