#!/usr/bin/env node
/**
 * Per-stage BullMQ pipeline E2E verifier.
 *
 * Verifies the exact contract:
 *   POST /api/runs
 *        ↓
 *   Researcher
 *        ↓
 *   WAITING_FOR_REVIEW
 *        ↓
 *   POST /api/runs/:id/confirm-plan
 *        ↓
 *   Planner → Refactor → Gap Analysis → Evaluation → Validation →
 *   Builder → Confirmation → Hash → COMPLETE
 *
 * Usage:
 *   npm run redis:up
 *   npm run start   (or start the server manually with Redis available)
 *   npm run test:pipeline:e2e
 */

const API_URL = process.env.ONESHOT_API_URL ?? "http://127.0.0.1:8787";
const API_TOKEN = process.env.ONESHOT_API_TOKEN ?? "";
const POLL_INTERVAL_MS = 500;
const RESEARCHER_TIMEOUT_MS = 120_000;
const PIPELINE_TIMEOUT_MS = 300_000;

const FAULT_STAGE = process.env.PIPELINE_FAULT_STAGE?.trim() ?? "";
const FAULT_MODE = process.env.PIPELINE_FAULT_MODE?.trim() ?? "";

const AUTH = API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {};

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
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

function getRunId(result) {
  const id = result?.run_id ?? result?.runId ?? result?.id;
  if (!id) {
    throw new Error(
      `Create run response contains no run ID: ${JSON.stringify(result)}`,
    );
  }
  return String(id);
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

async function getRun(runId) {
  return requestJson(`/api/runs/${encodeURIComponent(runId)}`);
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

function countEvent(events, stage, type) {
  const expectedStage = normalize(stage);
  return events.filter(
    (event) => normalize(event.stage) === expectedStage && event.type === type,
  ).length;
}

function eventIndex(events, stage, type) {
  const expectedStage = normalize(stage);
  return events.findIndex(
    (event) => normalize(event.stage) === expectedStage && event.type === type,
  );
}

function requireOrdering(events, before, after) {
  const beforeIndex = eventIndex(events, before.stage, before.type);
  const afterIndex = eventIndex(events, after.stage, after.type);
  if (beforeIndex === -1) {
    throw new Error(`Missing event: ${before.stage}:${before.type}`);
  }
  if (afterIndex === -1) {
    throw new Error(`Missing event: ${after.stage}:${after.type}`);
  }
  if (beforeIndex >= afterIndex) {
    throw new Error(
      `Expected ${before.stage}:${before.type} before ${after.stage}:${after.type}`,
    );
  }
}



async function verifyHealth() {
  console.log("1. Checking backend health...");
  const health = await requestJson("/api/health");
  console.log(JSON.stringify(health, null, 2));

  if (health.run_queue?.redis_available !== true) {
    throw new Error("Redis must be available");
  }
  if (health.run_queue?.pipeline !== true) {
    throw new Error("New pipeline must be enabled");
  }
  if (health.runtime?.preferred !== "pipeline") {
    throw new Error("Pipeline must be the preferred runtime");
  }
  console.log("   ✔ Redis + pipeline available");
}

async function createRun() {
  console.log("2. Creating pipeline run...");
  const result = await requestJson("/api/runs", {
    method: "POST",
    body: JSON.stringify({
      intent:
        "E2E pipeline wiring test. Produce a minimal valid plan, stop for human approval, then complete the full pipeline without changing external behavior.",
      requested_outcome: "Execute the complete per-stage pipeline through DONE",
      context: "Fresh OneShot pipeline E2E run",
      research_direction: ["contracts", "proof"],
    }),
  });
  const runId = getRunId(result);
  console.log(`   ✔ Run created: ${runId}`);
  return runId;
}

async function waitForHumanGate(runId) {
  console.log("3. Waiting for Researcher + human gate...");
  await waitUntil(
    "Researcher to reach plan review",
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

  const events = await getHistory(runId);
  if (countEvent(events, "researcher", "completed") !== 1) {
    throw new Error("Researcher must complete exactly once");
  }
  if (countEvent(events, "planner", "started") !== 0) {
    throw new Error("Planner must NOT execute before confirmation");
  }
  console.log("   ✔ Researcher complete");
  console.log("   ✔ Pipeline stopped at human gate");
  console.log("   ✔ Planner has not started");
}

async function confirmPlan(runId) {
  console.log("4. Confirming plan...");
  const body = await requestJson(
    `/api/runs/${encodeURIComponent(runId)}/confirm-plan`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmed: true,
        notes: "Approved automatically by E2E wiring test.",
      }),
    },
  );
  if (body.status !== "confirmed" || !body.planner_queued) {
    throw new Error(
      `Unexpected confirm-plan response: ${JSON.stringify(body)}`,
    );
  }
  console.log("   ✔ Plan confirmed, planner queued");
}

async function verifyDuplicateConfirmation(runId) {
  console.log("5. Testing idempotent confirmation...");
  const body = await requestJson(
    `/api/runs/${encodeURIComponent(runId)}/confirm-plan`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmed: true,
        notes: "Duplicate E2E confirmation",
      }),
    },
  );
  if (body.status !== "already_confirmed" || body.planner_queued) {
    throw new Error(
      `Duplicate confirmation must report already_confirmed with plannerQueued=false: ${JSON.stringify(body)}`,
    );
  }
  console.log("   ✔ Duplicate confirmation idempotent (planner already queued)");
}


async function waitForPipelineEnd(runId) {
  const isValidationFailure =
    FAULT_STAGE === "triple-validation" &&
    FAULT_MODE === "fail-always";

  if (isValidationFailure) {
    console.log("6. Waiting for validation failure to block pipeline...");
  } else {
    console.log("6. Waiting for complete pipeline...");
  }

  return waitUntil(
    isValidationFailure
      ? "validation failure exhaustion"
      : "pipeline completion",
    async () => {
      const events = await getHistory(runId);

      if (isValidationFailure) {
        const failures = countEvent(events, FAULT_STAGE, "failed");
        if (failures >= 3) {
          return { run: await getRun(runId), events };
        }
        return false;
      }

      const failed = events.find(
        (event) =>
          event.type === "failed" &&
          // A planner retry is expected when fail-once is configured.
          !(FAULT_STAGE === "planner" && FAULT_MODE === "fail-once" && event.stage === "planner"),
      );
      if (failed) {
        throw new Error(
          `Pipeline failed at ${failed.stage}: ${failed.message ?? ""}`,
        );
      }
      const run = await getRun(runId);
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

async function verifyPipelineHistory(runId) {
  console.log("7. Verifying stage history...");
  const events = await getHistory(runId);
  console.table(
    events.map((event) => ({
      stage: event.stage,
      type: event.type,
      attempt: event.attempt ?? "",
      job: event.jobId ?? "",
    })),
  );

  // Validation-failure mode: the deterministic validation stage fails forever,
  // so builder/confirmation/hash must never execute.
  if (
    FAULT_STAGE === "triple-validation" &&
    FAULT_MODE === "fail-always"
  ) {
    if (!hasEvent(events, FAULT_STAGE, "failed")) {
      throw new Error(
        `Fault injection expected ${FAULT_STAGE} to fail`,
      );
    }
    for (const stage of ["builder", "build", "confirmation", "hash"]) {
      if (countEvent(events, stage, "started") > 0) {
        throw new Error(
          `${stage} must NOT start after validation failure`,
        );
      }
    }
    console.log("   ✔ Validation failure correctly blocked downstream stages");
    return;
  }

  const requiredStages = [
    "researcher",
    "planner",
    "refactor",
    "gap-analysis",
    "evaluation",
  ];
  for (const stage of requiredStages) {
    if (countEvent(events, stage, "completed") !== 1) {
      throw new Error(`${stage} must complete exactly once`);
    }
  }

  /*
   * normalize() maps underscores to dashes, so "triple_validation" and
   * "triple-validation" are the SAME stage — listing both would double-count.
   */
  const validationAliases = [
    ["triple-validation"],
  ];
  for (const aliases of validationAliases) {
    const completed = aliases.reduce(
      (total, alias) => total + countEvent(events, alias, "completed"),
      0,
    );
    if (completed !== 1) {
      throw new Error(`${aliases.join("/")} must complete exactly once`);
    }
  }

  for (const aliases of [
    ["builder", "build"],
    ["confirmation", "confirmed"],
    ["hash"],
  ]) {
    const completed = aliases.reduce(
      (total, alias) => total + countEvent(events, alias, "completed"),
      0,
    );
    if (completed !== 1) {
      throw new Error(`${aliases.join("/")} must complete exactly once`);
    }
  }

  requireOrdering(
    events,
    { stage: "researcher", type: "completed" },
    { stage: "planner", type: "started" },
  );
  requireOrdering(
    events,
    { stage: "planner", type: "completed" },
    { stage: "refactor", type: "started" },
  );
  requireOrdering(
    events,
    { stage: "refactor", type: "completed" },
    { stage: "gap-analysis", type: "started" },
  );
  requireOrdering(
    events,
    { stage: "gap-analysis", type: "completed" },
    { stage: "evaluation", type: "started" },
  );
  requireOrdering(
    events,
    { stage: "evaluation", type: "completed" },
    { stage: "triple-validation", type: "started" },
  );
  requireOrdering(
    events,
    { stage: "triple-validation", type: "completed" },
    { stage: "build", type: "started" },
  );

  const plannerStarts = countEvent(events, "planner", "started");
  const expectedPlannerStarts =
    FAULT_STAGE === "planner" && FAULT_MODE === "fail-once" ? 2 : 1;

  if (plannerStarts !== expectedPlannerStarts) {
    throw new Error(
      `Planner started ${plannerStarts} time(s), expected ${expectedPlannerStarts}`,
    );
  }

  console.log("   ✔ Stage ordering verified");
  console.log("   ✔ No duplicate logical Planner execution");
}

async function verifyBuild(run) {
  console.log("8. Verifying final build...");
  const hash =
    run?.hash_proof?.created_hash ??
    run?.build?.hash ??
    run?.hash;
  if (!hash) {
    throw new Error(`Final run response contains no build hash: ${JSON.stringify(run)}`);
  }
  if (!/^(sha256:)?[a-fA-F0-9]{64}$/.test(String(hash))) {
    throw new Error("Final hash must be SHA-256");
  }
  if (run.hash_proof && run.hash_proof.equal !== true) {
    throw new Error("Hash proof must verify (equal=true)");
  }
  console.log(`   Final hash: ${hash}`);
}

async function main() {
  console.log("");
  console.log("OneShot Pipeline E2E");
  console.log("====================");
  console.log(`API: ${API_URL}`);
  console.log("");

  await verifyHealth();
  const runId = await createRun();
  await waitForHumanGate(runId);
  await confirmPlan(runId);
  await verifyDuplicateConfirmation(runId);

  const isValidationFailure =
    FAULT_STAGE === "triple-validation" &&
    FAULT_MODE === "fail-always";

  // Authorize the Build Ready gate concurrently while the pipeline runs; the
  // gate only opens after Hash completes. Validation-failure mode never
  // reaches Hash, so no authorization is attempted there.
  const gateApproval = isValidationFailure
    ? null
    : authorizeBuildWhenReady(runId, PIPELINE_TIMEOUT_MS).catch(
        (error) => ({ error }),
      );

  const { run: finalRun } = await waitForPipelineEnd(runId);
  await verifyPipelineHistory(runId);

  if (gateApproval) {
    const result = await gateApproval;
    if (result?.error) throw result.error;
  }

  if (!isValidationFailure) {
    await verifyBuild(finalRun);
  }

  console.log("");
  console.log("================================");
  console.log("✔ ONESHOT PIPELINE E2E PASSED");
  console.log("================================");
  console.log(`Run: ${runId}`);
  if (FAULT_STAGE && FAULT_MODE) {
    console.log(`Fault: stage=${FAULT_STAGE} mode=${FAULT_MODE}`);
  }
  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("================================");
  console.error("✘ ONESHOT PIPELINE E2E FAILED");
  console.error("================================");
  console.error(error);
  process.exitCode = 1;
});

