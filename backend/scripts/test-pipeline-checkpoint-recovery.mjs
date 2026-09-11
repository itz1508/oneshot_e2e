#!/usr/bin/env node
/**
 * Durable checkpoint recovery E2E (crash-after-checkpoint).
 *
 * Topology under test:
 *
 *   API server (NEVER restarted)
 *        +
 *   Redis (kept running)
 *        +
 *   Worker #1 configured with:
 *        PIPELINE_FAULT_STAGE=evaluation
 *        PIPELINE_FAULT_MODE=crash-after-checkpoint
 *        ↓
 *   Evaluation executes ONCE
 *   outcome + executed checkpoint persist (atomic Lua)
 *   history = completed
 *   worker exits 92 BEFORE applyTransition()
 *        ↓
 *   API survives; reconciliation + Worker #2 recover:
 *        evaluation skipped (persisted outcome loaded, agent NOT rerun)
 *        triple-validation queued from the SAVED outcome
 *        → confirmation → hash → build → finalize → Done
 *
 * Acceptance invariants asserted below:
 *   ✓ Evaluation executes exactly once
 *   ✓ Evaluation checkpoint survives worker death
 *   ✓ API survives worker death
 *   ✓ saved Evaluation outcome is reused (skipped >= 1)
 *   ✓ missing transition is recovered
 *   ✓ downstream work resumes
 *   ✓ terminal workflow status = Done
 *   ✓ Hash event emitted once
 *   ✓ Done event emitted once
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const API_URL = process.env.ONESHOT_API_URL ?? "http://127.0.0.1:8787";
const POLL_INTERVAL_MS = 500;
const RESEARCHER_TIMEOUT_MS = 120_000;
const CRASH_TIMEOUT_MS = 90_000;
const PIPELINE_TIMEOUT_MS = 300_000;
const EXPECTED_CRASH_EXIT_CODE = 92;

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

function countEvent(events, stage, type) {
  const expectedStage = normalize(stage);
  return events.filter(
    (event) => normalize(event.stage) === expectedStage && event.type === type,
  ).length;
}

function hasEvent(events, stage, type) {
  return countEvent(events, stage, type) > 0;
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
  console.log("   ✔ API health ok (worker-independent)");
}

async function createAndConfirmRun() {
  console.log("1. Creating run...");
  const result = await requestJson("/api/runs", {
    method: "POST",
    body: JSON.stringify({
      prompt: "Add a small logging utility for the checkpoint recovery test.",
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
        notes: "Approved automatically by checkpoint recovery test.",
      }),
    },
  );
  console.log("   ✔ Plan confirmed");

  return runId;
}

/*
 * The pipeline parks at the Build Ready human gate once Hash completes
 * (hash → wait-build). Poll the gate until it opens, then authorize the
 * build so the run can proceed to Build → Finalize → Done.
 */
async function authorizeBuildWhenReady(runId, timeoutMs) {
  const gate = await waitUntil(
    "Build Ready gate to open",
    async () => {
      try {
        return await requestJson(
          `/api/runs/${encodeURIComponent(runId)}/build-review`,
        );
      } catch {
        return false; // 404 until Hash completes and opens the gate
      }
    },
    timeoutMs,
  );

  const approved = await requestJson(
    `/api/runs/${encodeURIComponent(runId)}/build-review`,
    {
      method: "POST",
      body: JSON.stringify({ action: "approve", hash: gate.hash }),
    },
  );
  if (approved?.status !== "approved") {
    throw new Error(
      `Build review was not approved: ${JSON.stringify(approved)}`,
    );
  }
  console.log("   ✔ Build Ready gate authorized");
}

async function main() {
  await assertApiHealth();

  console.log(
    "3. Starting worker with PIPELINE_FAULT_MODE=crash-after-checkpoint (stage=evaluation)...",
  );
  const crashingWorker = startWorker({
    PIPELINE_FAULTS_ENABLED: "true",
    PIPELINE_FAULT_STAGE: "evaluation",
    PIPELINE_FAULT_MODE: "crash-after-checkpoint",
    ONESHOT_MODE: "sample",
  });

  let runId;
  try {
    runId = await createAndConfirmRun();

    console.log(
      "4. Waiting for Evaluation checkpoint to persist and the worker to die (exit 92)...",
    );
    await waitUntil(
      "evaluation completed event (checkpoint persisted)",
      async () => hasEvent(await getHistory(runId), "evaluation", "completed"),
      CRASH_TIMEOUT_MS,
    );
    console.log("   ✔ Evaluation outcome + executed checkpoint persisted");

    const exitCode = await waitForWorkerExit(crashingWorker, CRASH_TIMEOUT_MS);
    if (exitCode !== EXPECTED_CRASH_EXIT_CODE) {
      throw new Error(
        `Unexpected worker exit code ${exitCode} (expected ${EXPECTED_CRASH_EXIT_CODE})`,
      );
    }
    console.log(
      `   ✔ Worker exited ${exitCode} after the checkpoint, BEFORE applyTransition`,
    );
  } catch (error) {
    await killWorker(crashingWorker);
    throw error;
  }

  console.log("5. Verifying the API survived the worker death...");
  await assertApiHealth();

  console.log("6. Reconciling the run (diagnostic recovery endpoint)...");
  const reconciliation = await requestJson(
    `/api/runs/${encodeURIComponent(runId)}/reconcile`,
    {
      method: "POST",
      body: JSON.stringify({ stage: "evaluation", iteration: 0 }),
    },
  );
  console.log("   ✔ Reconcile result:", JSON.stringify(reconciliation));

  console.log("7. Starting recovery worker (no faults)...");
  const recoveryWorker = startWorker({
    PIPELINE_FAULTS_ENABLED: "false",
    ONESHOT_MODE: "sample",
  });

  try {
    console.log("8. Waiting for the workflow to reach Done...");
    // The Build Ready gate opens once Hash completes; authorize it
    // concurrently so the run can proceed to Build → Finalize → Done.
    const gateApproval = authorizeBuildWhenReady(
      runId,
      PIPELINE_TIMEOUT_MS,
    ).catch((error) => ({ error }));

    const run = await waitUntil(
      "workflow Done",
      async () => {
        const current = await requestJson(
          `/api/runs/${encodeURIComponent(runId)}`,
        );
        if (normalize(current.pipeline_status) === "done") {
          return current;
        }
        return false;
      },
      PIPELINE_TIMEOUT_MS,
    );

    if (gateApproval) {
      const result = await gateApproval;
      if (result?.error) throw result.error;
    }

    const events = await getHistory(runId);

    // --- Execution invariants --------------------------------------------
    const invariants = [
      ["researcher", "started", 1],
      ["planner", "started", 1],
      ["evaluation", "started", 1],
      ["evaluation", "completed", 1],
      ["triple-validation", "started", 1],
      ["confirmation", "started", 1],
      ["hash", "started", 1],
      ["build", "started", 1],
      ["finalize", "started", 1],
    ];

    for (const [stage, type, expected] of invariants) {
      const actual = countEvent(events, stage, type);
      if (actual !== expected) {
        throw new Error(
          `Invariant failed: ${stage}.${type} count ${actual} !== ${expected}`,
        );
      }
    }
    console.log("   ✔ researcher/planner/evaluation each started exactly once");

    /*
     * The crashed evaluation job is re-delivered by BullMQ stall recovery,
     * possibly well after the workflow reached Done (stall detection +
     * exponential backoff). The re-delivery MUST be suppressed via the
     * persisted outcome, recorded as evaluation.skipped.
     */
    const skipped = await waitUntil(
      "evaluation skipped event (durable outcome reused on re-delivery)",
      async () => {
        const current = await getHistory(runId);
        const count = countEvent(current, "evaluation", "skipped");
        return count >= 1 ? count : false;
      },
      150_000,
    );
    console.log(
      `   ✔ saved Evaluation outcome reused (evaluation.skipped = ${skipped})`,
    );

    // --- Workflow status: Done (semantic failures ride on issue, not status)
    if (normalize(run.pipeline_status) !== "done") {
      throw new Error(
        `Workflow status must be Done, got ${run.pipeline_status}`,
      );
    }
    if (run.test_result !== "Passed") {
      throw new Error(
        `Workflow test_result must be Passed, got ${run.test_result}`,
      );
    }
    console.log("   ✔ terminal workflow status = Done, test_result = Passed");

    // --- Hash proof --------------------------------------------------------
    if (run.hash_proof?.equal !== true) {
      throw new Error(
        `Hash proof must verify (equal=true), got ${JSON.stringify(run.hash_proof)}`,
      );
    }
    console.log("   ✔ hash proof verifies (equal = true)");

    // --- Done event emitted exactly once ------------------------------------
    const doneEvents = (run.events ?? []).filter(
      (event) =>
        normalize(event.processor) === "done" &&
        normalize(event.execution_status) === "completed",
    );
    if (doneEvents.length !== 1) {
      throw new Error(
        `Done event must be emitted exactly once, got ${doneEvents.length}`,
      );
    }
    console.log("   ✔ Done event emitted exactly once");

    console.log("\nCANONICAL CHECKPOINT RECOVERY ACCEPTANCE: PASS");
  } finally {
    await killWorker(recoveryWorker);
  }
}

main().catch((err) => {
  console.error("Checkpoint recovery test failed:", err);
  process.exit(1);
});
