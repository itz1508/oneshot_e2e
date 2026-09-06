#!/usr/bin/env node
/**
 * Worker crash-recovery E2E test.
 *
 * Topology under test:
 *
 *   API server (kept running)
 *        +
 *   Redis (kept running)
 *        +
 *   Worker #1 configured with PIPELINE_FAULT_MODE=crash-once on refactor
 *        ↓ crashes during refactor
 *   Worker #2 started without faults
 *        ↓ recovers and completes the same run
 *
 * The API server must remain healthy while no worker is alive.
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const API_URL = process.env.ONESHOT_API_URL ?? "http://127.0.0.1:8787";
const API_TOKEN = process.env.ONESHOT_API_TOKEN ?? "";
const POLL_INTERVAL_MS = 500;
const RESEARCHER_TIMEOUT_MS = 120_000;
const CRASH_TIMEOUT_MS = 60_000;
const PIPELINE_TIMEOUT_MS = 300_000;

const AUTH = API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {};
const projectRoot = process.env.ONESHOT_ROOT || process.cwd();
const workerScript = resolve(
  projectRoot,
  "dist/backend/scripts/run-pipeline-worker.js",
);

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    signal: AbortSignal.timeout(10_000),
    ...options,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...AUTH,
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`,
    );
  }

  return body;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[_\s]+/g, "-");
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(description, callback, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await callback();
    if (result) return result;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for ${description} after ${timeoutMs}ms`);
}

async function getHistory(runId) {
  const response = await requestJson(
    `/api/runs/${encodeURIComponent(runId)}/history`,
  );
  if (!Array.isArray(response?.history)) {
    throw new Error("History endpoint must return history[]");
  }
  return response.history;
}

function hasEvent(events, stage, type) {
  const expectedStage = normalize(stage);
  return events.some(
    (event) => normalize(event.stage) === expectedStage && event.type === type,
  );
}

function startWorker(env) {
  const proc = spawn(
    process.execPath,
    [workerScript],
    {
      env: { ...process.env, ...env },
      stdio: "pipe",
      detached: false,
    },
  );

  proc.stdout.on("data", (data) => {
    process.stdout.write(`[worker] ${data}`);
  });
  proc.stderr.on("data", (data) => {
    process.stderr.write(`[worker] ${data}`);
  });

  return proc;
}

async function waitForWorkerExit(proc, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (proc.exitCode !== null) {
      return proc.exitCode;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Worker did not exit within ${timeoutMs}ms`,
  );
}

async function killWorker(proc) {
  if (proc.exitCode !== null) {
    return;
  }
  proc.kill("SIGTERM");
  await sleep(1000);
  if (proc.exitCode === null) {
    proc.kill("SIGKILL");
  }
}

async function assertApiHealth() {
  const health = await requestJson("/api/health");
  if (health.redis !== "ok" || health.queue !== "ok" || !health.run_queue?.pipeline) {
    throw new Error(`API is not healthy: ${JSON.stringify(health)}`);
  }
  console.log("   ✔ API health ok", JSON.stringify(health));
}

async function createAndConfirmRun() {
  console.log("1. Creating run...");
  const result = await requestJson("/api/runs", {
    method: "POST",
    body: JSON.stringify({
      prompt: "Add a small logging utility for the worker recovery test.",
      provider_id: "sample",
    }),
  });

  const runId =
    result?.run_id ?? result?.runId ?? result?.id;
  if (!runId) {
    throw new Error(
      `Create run response contains no run ID: ${JSON.stringify(result)}`,
    );
  }
  console.log("   ✔ Run created:", runId);

  await waitUntil(
    "researcher to finish and stop at human gate",
    async () => {
      const events = await getHistory(runId);
      if (
        hasEvent(events, "researcher", "completed") &&
        (hasEvent(events, "await-human", "waiting") ||
          hasEvent(events, "plan-review", "waiting"))
      ) {
        return true;
      }
      const failed = events.find((event) => event.type === "failed");
      if (failed) {
        throw new Error(
          `Pipeline failed before human gate: ${failed.stage}: ${failed.message ?? ""}`,
        );
      }
      return false;
    },
    RESEARCHER_TIMEOUT_MS,
  );

  console.log("2. Confirming plan...");
  await requestJson(
    `/api/runs/${encodeURIComponent(runId)}/confirm-plan`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmed: true,
        notes: "Approved automatically by recovery test.",
      }),
    },
  );
  console.log("   ✔ Plan confirmed");

  return runId;
}

async function waitForPipelineComplete(runId) {
  console.log("5. Waiting for pipeline to complete after worker restart...");
  return waitUntil(
    "pipeline completion",
    async () => {
      const events = await getHistory(runId);
      const failed = events.find((event) => event.type === "failed");
      if (failed) {
        throw new Error(
          `Pipeline failed at ${failed.stage}: ${failed.message ?? ""}`,
        );
      }
      const run = await requestJson(
        `/api/runs/${encodeURIComponent(runId)}`,
      );
      const status = normalize(
        run.pipeline_status ?? run.status ?? run.state,
      );
      if (
        status === "complete" ||
        status === "completed" ||
        status === "success" ||
        status === "succeeded" ||
        status === "done"
      ) {
        return { run, events };
      }
      return false;
    },
    PIPELINE_TIMEOUT_MS,
  );
}

async function main() {
  await assertApiHealth();

  console.log("3. Starting crashing worker...");
  const crashingWorker = startWorker({
    PIPELINE_FAULTS_ENABLED: "true",
    PIPELINE_FAULT_STAGE: "refactor",
    PIPELINE_FAULT_MODE: "crash-once",
    ONESHOT_MODE: "sample",
  });

  let runId;
  try {
    runId = await createAndConfirmRun();

    console.log("4. Waiting for refactor to start and worker to crash...");
    await waitUntil(
      "refactor to start",
      async () => hasEvent(await getHistory(runId), "refactor", "started"),
      CRASH_TIMEOUT_MS,
    );

    const exitCode = await waitForWorkerExit(crashingWorker, CRASH_TIMEOUT_MS);
    if (exitCode !== 91) throw new Error(`Unexpected worker exit code ${exitCode}`);
    console.log(`   ✔ Crashing worker exited with code ${exitCode}`);
  } catch (error) {
    await killWorker(crashingWorker);
    throw error;
  }

  await assertApiHealth();

  console.log("6. Starting recovery worker...");
  const recoveryWorker = startWorker({
    PIPELINE_FAULTS_ENABLED: "false",
    ONESHOT_MODE: "sample",
  });

  try {
    const { run, events } = await waitForPipelineComplete(runId);

    if (!hasEvent(events, "hash", "completed")) {
      throw new Error("Hash stage did not complete after recovery");
    }

    console.log("   ✔ Pipeline completed after worker crash/recovery");
    console.log("   ✔ Hash stage completed");
    console.log("   final status:", normalize(run.status ?? run.state));
  } finally {
    await killWorker(recoveryWorker);
  }
}

main().catch((err) => {
  console.error("Recovery test failed:", err);
  process.exit(1);
});
