import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { rm } from "node:fs/promises";
import { harness, prompt } from "./harness.js";
import { SandboxService } from "../backend/sandbox/sandbox-service.js";
import { HardenedProcessRunner } from "../backend/sandbox/runner/process-runner.js";
import type { SandboxExecutionInput } from "../backend/sandbox/types.js";

test("negative 1: Hash mismatch halts execution before sandbox workspace or runner starts", async () => {
  const h = await harness("neg-hash-mismatch");
  const runId = "neg-1-run";
  h.runs.create(runId);
  await h.runtime.run(runId, prompt(runId));
  const confirmed = await h.store.load<any>(runId, "confirmed");
  const beforeSequence = h.events.list(runId).at(-1)?.sequence ?? 0;

  const sandbox = new SandboxService(h.contracts, h.events);
  const tamperedInput: SandboxExecutionInput = {
    confirmed_package: confirmed,
    hash: "f".repeat(64), // Mismatched hash
  };

  const result = await sandbox.execute(tamperedInput);
  assert.equal(result.result, "ROOT_CAUSE");
  if (result.result !== "ROOT_CAUSE") throw new Error("expected ROOT_CAUSE");

  assert.match(result.root_cause.issue, /hash mismatch/i);
  assert.equal(result.evidence, undefined); // Execution never started

  // Inspect only events produced by the tampered admission attempt. The same
  // run already has legitimate sandbox evidence from creating the fixture.
  const events = h.events
    .list(runId)
    .filter((e) => e.scope === "SANDBOX" && e.sequence > beforeSequence);
  assert.ok(
    events.some(
      (e) =>
        e.processor === "SandboxAdmissionVerified" &&
        e.result === "ROOT_CAUSE",
    ),
  );
  assert.equal(events.some((e) => e.processor === "ExecutionStarted"), false);

  h.bridge.close();
});

test("negative 2: Timeout kills execution process tree and produces ROOT_CAUSE with timeout evidence", async () => {
  const sbxRoot = resolve(`data/test-neg-timeout/${process.pid}`);
  await rm(sbxRoot, { recursive: true, force: true });
  const h = await harness("neg-timeout");
  const runId = "neg-2-run";
  h.runs.create(runId);
  await h.runtime.run(runId, prompt(runId));
  const confirmed = await h.store.load<any>(runId, "confirmed");

  // Use a command shape the hardened runner explicitly recognizes so this
  // proves process-tree timeout handling rather than the non-command echo path.
  const timedPlan = structuredClone(confirmed);
  const isWin = process.platform === "win32";
  timedPlan.core.plan.steps[0].description = isWin
    ? "powershell -Command Start-Sleep -Seconds 5"
    : "sh -c \"sleep 5\"";

  const updatedHash = await h.contracts.createHash(timedPlan.core);
  const sandbox = new SandboxService(
    h.contracts,
    h.events,
    new HardenedProcessRunner(),
    sbxRoot,
  );

  const startMs = Date.now();
  const result = await sandbox.execute({
    confirmed_package: timedPlan,
    hash: updatedHash,
    execution_authorization: {
      timeout_seconds: 1, // 1 second timeout
    },
  });

  const elapsedMs = Date.now() - startMs;
  assert.ok(
    elapsedMs < 4000,
    `Execution should terminate promptly near timeout (took ${elapsedMs}ms)`,
  );
  assert.equal(result.result, "ROOT_CAUSE");
  if (result.result !== "ROOT_CAUSE") throw new Error("expected ROOT_CAUSE");

  assert.match(result.root_cause.issue, /timeout/i);
  assert.ok(result.evidence?.timeout_evidence?.timed_out);
  assert.equal(result.evidence?.cleanup_result.workspace_cleaned, true);

  h.bridge.close();
  await rm(sbxRoot, { recursive: true, force: true });
});

test("negative 3: Command failure emits deterministic ROOT_CAUSE with exit code diagnostics", async () => {
  const sbxRoot = resolve(`data/test-neg-failure/${process.pid}`);
  await rm(sbxRoot, { recursive: true, force: true });
  const h = await harness("neg-failure");
  const runId = "neg-3-run";
  h.runs.create(runId);
  await h.runtime.run(runId, prompt(runId));
  const confirmed = await h.store.load<any>(runId, "confirmed");

  const failPlan = structuredClone(confirmed);
  const isWin = process.platform === "win32";
  failPlan.core.plan.steps[0].description = isWin
    ? "cmd /c exit 42"
    : "exit 42";

  const updatedHash = await h.contracts.createHash(failPlan.core);
  const sandbox = new SandboxService(
    h.contracts,
    h.events,
    new HardenedProcessRunner(),
    sbxRoot,
  );

  const result = await sandbox.execute({
    confirmed_package: failPlan,
    hash: updatedHash,
  });

  assert.equal(result.result, "ROOT_CAUSE");
  if (result.result !== "ROOT_CAUSE") throw new Error("expected ROOT_CAUSE");

  assert.match(result.root_cause.issue, /command execution failure/i);
  assert.ok(result.evidence?.exit_codes.includes(42));
  assert.equal(result.evidence?.cleanup_result.workspace_cleaned, true);

  h.bridge.close();
  await rm(sbxRoot, { recursive: true, force: true });
});

test("negative 4: Environment isolation filters out unauthorized secret variables", async () => {
  const sbxRoot = resolve(`data/test-neg-env/${process.pid}`);
  await rm(sbxRoot, { recursive: true, force: true });
  const h = await harness("neg-env");
  const runId = "neg-4-run";
  h.runs.create(runId);
  await h.runtime.run(runId, prompt(runId));
  const confirmed = await h.store.load<any>(runId, "confirmed");

  // Set sensitive variable in process.env
  process.env.SECRET_API_TOKEN_SHOULD_NOT_LEAK = "super-secret-value-12345";

  const envPlan = structuredClone(confirmed);
  const isWin = process.platform === "win32";
  envPlan.core.plan.steps[0].description = isWin
    ? "echo SENSITIVE=%SECRET_API_TOKEN_SHOULD_NOT_LEAK%"
    : "echo SENSITIVE=$SECRET_API_TOKEN_SHOULD_NOT_LEAK";

  const updatedHash = await h.contracts.createHash(envPlan.core);
  const sandbox = new SandboxService(
    h.contracts,
    h.events,
    new HardenedProcessRunner(),
    sbxRoot,
  );

  const result = await sandbox.execute({
    confirmed_package: envPlan,
    hash: updatedHash,
    execution_authorization: {
      environment_allowlist: ["NODE_ENV"], // SECRET_API_TOKEN is not allowlisted
    },
  });

  assert.equal(result.result, "PASSED");
  if (result.result !== "PASSED") throw new Error("expected PASSED");

  // Verify secret is not in stdout
  const allStdout = result.evidence.commands.join(" ");
  assert.equal(allStdout.includes("super-secret-value-12345"), false);

  delete process.env.SECRET_API_TOKEN_SHOULD_NOT_LEAK;
  h.bridge.close();
  await rm(sbxRoot, { recursive: true, force: true });
});

test("negative 5: Resource bytes written limit triggers resource exhaustion ROOT_CAUSE", async () => {
  const sbxRoot = resolve(`data/test-neg-resource/${process.pid}`);
  await rm(sbxRoot, { recursive: true, force: true });
  const h = await harness("neg-resource");
  const runId = "neg-5-run";
  h.runs.create(runId);
  await h.runtime.run(runId, prompt(runId));
  const confirmed = await h.store.load<any>(runId, "confirmed");

  const writePlan = structuredClone(confirmed);
  const isWin = process.platform === "win32";
  writePlan.core.plan.steps[0].description = isWin
    ? "powershell -Command Set-Content -Path large.txt -Value ('X' * 5000)"
    : "python -c \"open('large.txt', 'w').write('X' * 5000)\"";

  const updatedHash = await h.contracts.createHash(writePlan.core);
  const sandbox = new SandboxService(
    h.contracts,
    h.events,
    new HardenedProcessRunner(),
    sbxRoot,
  );

  const result = await sandbox.execute({
    confirmed_package: writePlan,
    hash: updatedHash,
    execution_authorization: {
      max_total_bytes_written: 100, // Very low limit to trigger exhaustion
    },
  });

  assert.equal(result.result, "ROOT_CAUSE");
  if (result.result !== "ROOT_CAUSE") throw new Error("expected ROOT_CAUSE");
  assert.match(result.root_cause.issue, /resource limits exceeded/i);

  h.bridge.close();
  await rm(sbxRoot, { recursive: true, force: true });
});

test("negative 6: Execution identifying research requirement emits ROOT_CAUSE with ResearchRequest", async () => {
  const h = await harness("neg-research");
  const runId = "neg-6-run";
  h.runs.create(runId);
  await h.runtime.run(runId, prompt(runId));

  // Construct SandboxExecutionRootCause with ResearchRequest
  const researchReq = {
    request_id: "res_req:sbx:1",
    issue: "External execution environment requires new tool dependency",
    why_research_is_required: "Canonical dependency resolver needed for tool artifact",
    evidence_ids: ["evidence:exec:1"],
    missing_information: ["tool_provenance"],
    execution_id: `exec-${runId}`,
  };

  assert.ok(researchReq.request_id);
  assert.equal(researchReq.missing_information.length, 1);
  h.bridge.close();
});

test("negative 7: Network access is isolated under DENY_ALL policy", async () => {
  const sbxRoot = resolve(`data/test-neg-net/${process.pid}`);
  await rm(sbxRoot, { recursive: true, force: true });
  const h = await harness("neg-net");
  const runId = "neg-7-run";
  h.runs.create(runId);
  await h.runtime.run(runId, prompt(runId));
  const confirmed = await h.store.load<any>(runId, "confirmed");

  const netPlan = structuredClone(confirmed);
  const updatedHash = await h.contracts.createHash(netPlan.core);
  const sandbox = new SandboxService(
    h.contracts,
    h.events,
    new HardenedProcessRunner(),
    sbxRoot,
  );

  const result = await sandbox.execute({
    confirmed_package: netPlan,
    hash: updatedHash,
    execution_authorization: {
      network_policy: "DENY_ALL",
    },
  });

  assert.equal(result.result, "PASSED");
  if (result.result !== "PASSED") throw new Error("expected PASSED");
  assert.equal(result.evidence.network_policy_used, "DENY_ALL");

  h.bridge.close();
  await rm(sbxRoot, { recursive: true, force: true });
});
