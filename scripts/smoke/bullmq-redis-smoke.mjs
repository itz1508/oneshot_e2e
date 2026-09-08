/**
 * BullMQ + Redis deployment smoke test (local development only).
 *
 * Proves the deployed Redis instance + the project's real BullMQ run-queue
 * path work end to end:
 *   1. Redis reachable via the project's shared connection (whenRedisReady).
 *   2. BullMQRunQueue.ready() — Worker/QueueEvents backend live.
 *   3. addRun() — v1 payload enqueued (jobId = runId, dedup'd by BullMQ).
 *   4. Worker dequeues and executes the REAL executeRunJob path; the stubbed
 *      RunRepository returns a durably-finalized run so the idempotency guard
 *      completes the job without invoking a provider.
 *   5. getJobState() + getJobCounts() report from Redis.
 *
 * Usage: node scripts/smoke/bullmq-redis-smoke.mjs
 * Env:   REDIS_URL (default redis://127.0.0.1:6379)
 */
import {
  BullMQRunQueue,
  RUN_QUEUE_NAME,
} from "../../dist/backend/runtime/queue.js";
import { whenRedisReady } from "../../dist/backend/runtime/redis-connection.js";

const runId = `smoke_${Date.now()}`;
const log = (step, msg) => console.log(`[smoke] ${step}: ${msg}`);
const fail = (step, msg) => {
  console.error(`[smoke] ${step} FAILED: ${msg}`);
  process.exit(1);
};

// 1. Shared Redis connection (same options BullMQ consumers use).
log(
  1,
  `connecting to Redis (${process.env.REDIS_URL || "redis://127.0.0.1:6379"})`,
);
try {
  await whenRedisReady(5_000);
  log(1, "Redis connection ready");
} catch (err) {
  fail(1, err instanceof Error ? err.message : String(err));
}

// Stub deps: the run snapshot is already durably finalized (PASSED), so the
// worker's idempotency guard in executeRunJob completes the job without a
// provider or workflow runtime. Everything else — connection, enqueue,
// dequeue, contract validation, progress bridge — is the real code path.
const deps = {
  runs: {
    get: () => ({ result: "Passed", events: [] }),
    create: () => {
      throw new Error("smoke stub: create() must not be reached");
    },
    finish: () => {
      throw new Error("smoke stub: finish() must not be reached");
    },
  },
  events: {
    emit: () => {},
    subscribe: () => () => {},
  },
  createRuntime: async () => {
    throw new Error("smoke stub: createRuntime() must not be reached");
  },
  resolveProvider: async () => {
    throw new Error("smoke stub: resolveProvider() must not be reached");
  },
  projectRoot: process.cwd(),
};

// 2. Real BullMQ run queue (Queue + Worker + QueueEvents, prefix "oneshot").
const queue = new BullMQRunQueue(RUN_QUEUE_NAME, deps);
try {
  await queue.ready(8_000);
  log(2, "BullMQ worker + queue-events ready");

  // 3. Enqueue the versioned v1 run job.
  await queue.addRun({
    runId,
    prompt: {
      prompt_id: "smoke_prompt",
      intent: "smoke test",
      requested_outcome: "prove BullMQ + Redis deployment",
      context: [],
      research_direction: [],
    },
    providerId: "smoke",
    revision: 1,
  });
  log(3, `enqueued runId=${runId} (jobId=runId, v1 payload)`);

  // 4. Wait for the real worker to drain it via executeRunJob.
  let state = await queue.getJobState(runId);
  const deadline = Date.now() + 15_000;
  while (state !== "completed" && state !== "failed" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    state = await queue.getJobState(runId);
  }
  if (state !== "completed")
    fail(4, `job state is '${state}' (expected 'completed')`);
  log(4, "worker executed job via executeRunJob — state=completed");

  // 5. Operational counts read back from Redis.
  const counts = await queue.getJobCounts();
  if (counts.completed < 1) fail(5, `completed count is ${counts.completed}`);
  log(
    5,
    `queue counts — waiting:${counts.waiting} active:${counts.active} completed:${counts.completed} failed:${counts.failed}`,
  );
  console.log(`[smoke] PASS — BullMQ + Redis verified (runId=${runId})`);
} finally {
  await queue.close();
  log("cleanup", "queue, worker and Redis connections closed");
}
