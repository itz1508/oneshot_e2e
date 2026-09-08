#!/usr/bin/env node
/**
 * Refinement + checkpoint recovery E2E (freeze gate 2).
 *
 * Topology under test:
 *
 *   API server (NEVER restarted)
 *        +
 *   Redis (kept running)
 *        +
 *   Worker #1 configured with:
 *        PIPELINE_FAULTS=[
 *          {"stage":"triple-validation","mode":"refine-once"},
 *          {"stage":"evaluation","mode":"crash-after-checkpoint","minIteration":1}
 *        ]
 *
 *   iteration 0
 *     Refactor → Gap Analysis → Evaluation →
 *     Triple Validation reports refine (Missing) ──→ refine
 *
 *   iteration 1
 *     Gap Analysis → Evaluation → checkpoint saved → worker exits 92
 *
 *   Recovery (reconcile + Worker #2, no faults):
 *     Evaluation[1] skipped (durable outcome reused, agent NOT rerun)
 *     Triple Validation[1] → Confirmation → Hash → Build → Finalize → Done
 *
 * Acceptance invariants asserted below:
 *   ✓ Researcher started exactly once (globally)
 *   ✓ Planner started exactly once (globally)
 *   ✓ Refactor[0] exactly once; no Refactor[1] (refinement re-enters at Gap)
 *   ✓ Gap Analysis[0] and [1] each exactly once
 *   ✓ Evaluation[0] exactly once (agent call = 1)
 *   ✓ Triple Validation[0] exactly once (refine outcome)
 *   ✓ Evaluation[1] completed exactly once, then skipped >= 1 on recovery
 *   ✓ Evaluation[1] agent execution = 1 (NOT 2)
 *   ✓ Triple Validation[1] started exactly once
 *   ✓ pipeline_status = Done, test_result = Passed, hash_proof.equal = true
 *   ✓ Done event emitted exactly once
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const API_URL = process.env.ONESHOT_API_URL ?? "http://127.0.0.1:8787";
const API_TOKEN = process.env.ONESHOT_API_TOKEN ?? "";
const POLL_INTERVAL_MS = 500;
const RESEARCHER_TIMEOUT_MS = 120_000;
const CRASH_TIMEOUT_MS = 120_000;
const PIPELINE_TIMEOUT_MS = 300_000;
const EXPECTED_CRASH_EXIT_CODE = 92;

const FAULTS = JSON.stringify([
  { stage: "triple-validation", mode: "refine-once" },
  { stage: "evaluation", mode: "crash-after-checkpoint", minIteration: 1 },
]);

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

/**
 * Count history events for a (stage, type) pair, optionally restricted to
 * one refinement iteration. History events carry the iteration field.
 */
function countEvent(events, stage, type, iteration) {
  const expectedStage = normalize(stage);
  return events.filter(
    (event) =>
      normalize(event.stage) === expectedStage &&
      event.type === type &&
      (iteration === undefined ||
        Number(event.iteration ?? 0) === iteration),
  ).length;
}

function hasEvent(events, stage, type, iteration) {
  return countEvent(events, stage, type, iteration) > 0;
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
      prompt: "Add a small logging utility for the refinement recovery test.",
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
        notes: "Approved automatically by refinement recovery test.",
      }),
    },
  );
  console.log("   ✔ Plan confirmed");

  return runId;
}

async function assertIterationInvariants(events, run) {
  // --- Per-iteration invariants --------------------------------------------
  const iterationInvariants = [
    // iteration 0
    ["refactor", "started", 0, 1],
    ["gap-analysis", "started", 0, 1],
    ["evaluation", "started", 0, 1],
    ["evaluation", "completed", 0, 1],
    ["triple-validation", "started", 0, 1],
    ["triple-validation", "completed", 0, 1],
    // iteration 1
    ["gap-analysis", "started", 1, 1],
    ["evaluation", "started", 1, 1],
    ["evaluation", "completed", 1, 1],
    ["triple-validation", "started", 1, 1],
  ];
  for (const [stage, type, iteration, expected] of iterationInvariants) {
    const actual = countEvent(events, stage, type, iteration);
    if (actual !== expected) {
      throw new Error(
        `Invariant failed: ${stage}[${iteration}].${type} count ${actual} !== ${expected}`,
      );
    }
  }
  console.log(
    "   ✔ Refactor[0]=1, GapAnalysis[0]=1, Evaluation[0]=1, TripleValidation[0]=1 (refine)",
  );
  console.log(
    "   ✔ GapAnalysis[1]=1, Evaluation[1] agent execution = 1 (completed=1, NOT 2)",
  );

  const refactorSecondIteration = countEvent(events, "refactor", "started", 1);
  if (refactorSecondIteration !== 0) {
    throw new Error(
      `Invariant failed: Refactor must not rerun in iteration 1 (frozen routing re-enters at Gap Analysis), got ${refactorSecondIteration}`,
    );
  }
  console.log(
    "   ✔ Refactor[1] = 0 (refinement re-enters at Gap Analysis per frozen routing)",
  );

  /*
   * The crashed evaluation[1] job is re-delivered by BullMQ stall recovery,
   * possibly well after the workflow reached Done. The re-delivery MUST be
   * suppressed via the persisted outcome, recorded as evaluation[1].skipped.
   */
  const skipped = await waitUntil(
    "evaluation[1] skipped event (durable outcome reused on re-delivery)",
    async () => {
      const current = await getHistory(events[0]?.runId ?? "");
      const count = countEvent(current, "evaluation", "skipped", 1);
      return count >= 1 ? count : false;
    },
    150_000,
  );
  console.log(`   ✔ durable outcome reused (evaluation[1].skipped = ${skipped})`);

  // --- Downstream continuation ----------------------------------------------
  for (const stage of ["confirmation", "hash", "build", "finalize"]) {
    if (!hasEvent(events, stage, "started")) {
      throw new Error(`Invariant failed: ${stage} never started after recovery`);
    }
    if (!hasEvent(events, stage, "completed")) {
      throw new Error(`Invariant failed: ${stage} never completed after recovery`);
    }
  }
  console.log(
    "   ✔ downstream work resumed: Confirmation → Hash → Build → Finalize",
  );

  // --- Final semantic assertions (each concept verified independently) ------
  if (normalize(run.pipeline_status) !== "done") {
    throw new Error(`Workflow status must be Done, got ${run.pipeline_status}`);
  }
  if (run.test_result !== "Passed") {
    throw new Error(
      `Workflow test_result must be Passed, got ${run.test_result}`,
    );
  }
  if (run.issue_type) {
    throw new Error(
      `Successful workflow must have no issue_type, got ${run.issue_type}`,
    );
  }
  if (run.hash_proof?.equal !== true) {
    throw new Error(
      `Hash proof must verify (equal=true), got ${JSON.stringify(run.hash_proof)}`,
    );
  }
  console.log(
    "   ✔ Pipeline Status = Done, Test Result = Passed, Issue Type = none, Hash = Passed",
  );

  // --- Done event emitted exactly once ---------------------------------------
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
    "3. Starting worker with refine-once (triple-validation) + crash-after-checkpoint (evaluation, minIteration=1)...",
  );
  const crashingWorker = startWorker({
    PIPELINE_FAULTS_ENABLED: "true",
    PIPELINE_FAULTS: FAULTS,
    ONESHOT_MODE: "sample",
  });

  let runId;
  try {
    runId = await createAndConfirmRun();

    console.log(
      "4. Waiting for iteration 0 refinement (Triple Validation[0] refine) and iteration 1 start...",
    );
    await waitUntil(
      "triple-validation[0] refine and gap-analysis[1] started",
      async () =>
        hasEvent(await getHistory(runId), "triple-validation", "completed", 0) &&
        hasEvent(await getHistory(runId), "gap-analysis", "started", 1),
      CRASH_TIMEOUT_MS,
    );
    console.log(
      "   ✔ Triple Validation[0] refined (Missing); refinement iteration 1 started at Gap Analysis",
    );

    console.log(
      "5. Waiting for Evaluation[1] checkpoint to persist and the worker to die (exit 92)...",
    );
    await waitUntil(
      "evaluation[1] completed event (checkpoint persisted)",
      async () =>
        hasEvent(await getHistory(runId), "evaluation", "completed", 1),
      CRASH_TIMEOUT_MS,
    );
    console.log("   ✔ Evaluation[1] outcome + executed checkpoint persisted");

    const exitCode = await waitForWorkerExit(crashingWorker, CRASH_TIMEOUT_MS);
    if (exitCode !== EXPECTED_CRASH_EXIT_CODE) {
      throw new Error(
        `Unexpected worker exit code ${exitCode} (expected ${EXPECTED_CRASH_EXIT_CODE})`,
      );
    }
    console.log(
      `   ✔ Worker exited ${exitCode} after the Evaluation[1] checkpoint, BEFORE applyTransition`,
    );
  } catch (error) {
    await killWorker(crashingWorker);
    throw error;
  }

  console.log("6. Verifying the API survived the worker death...");
  await assertApiHealth();

  console.log("7. Reconciling Evaluation[1] (diagnostic recovery endpoint)...");
  const reconciliation = await requestJson(
    `/api/runs/${encodeURIComponent(runId)}/reconcile`,
    {
      method: "POST",
      body: JSON.stringify({ stage: "evaluation", iteration: 1 }),
    },
  );
  console.log("   ✔ Reconcile result:", JSON.stringify(reconciliation));

  console.log("8. Starting recovery worker (no faults)...");
  const recoveryWorker = startWorker({
    PIPELINE_FAULTS_ENABLED: "false",
    ONESHOT_MODE: "sample",
  });

  try {
    console.log("9. Waiting for the workflow to reach Done...");
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

    // --- Global exactly-once invariants -----------------------------------
    for (const [stage, type] of [
      ["researcher", "started"],
      ["planner", "started"],
    ]) {
      const actual = countEvent(events, stage, type);
      if (actual !== 1) {
        throw new Error(
          `Invariant failed: ${stage}.${type} total count ${actual} !== 1`,
        );
      }
    }
    console.log("   ✔ Researcher calls = 1, Planner calls = 1 (globally)");

    await assertIterationInvariants(events, run);

    console.log("\nCANONICAL REFINEMENT RECOVERY ACCEPTANCE: PASS");
  } finally {
    await killWorker(recoveryWorker);
  }
}

main().catch((err) => {
  console.error("Refinement recovery test failed:", err);
  process.exit(1);
});
