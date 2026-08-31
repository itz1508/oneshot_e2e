import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { rm } from "node:fs/promises";
import { harness, prompt } from "./harness.js";
import { SandboxService } from "../backend/sandbox/sandbox-service.js";
import { HardenedProcessRunner } from "../backend/sandbox/runner/process-runner.js";
import { projectAuthorityGraph } from "../backend/graph/authority-graph.js";
import { projectSandboxGraph } from "../backend/sandbox/graph/sandbox-graph.js";
import type { SandboxExecutionInput } from "../backend/sandbox/types.js";

test("external Sandbox executes confirmed package, records evidence, verifies HASH == hash_sandbox, and cleans up", async () => {
  const sbxRoot = resolve(`data/test-sandbox-exec/${process.pid}`);
  await rm(sbxRoot, { recursive: true, force: true });

  const h = await harness("sandbox-execution-e2e");
  const runId = "sbx-e2e-run";
  h.runs.create(runId);

  // 1. Run canonical workflow to DONE
  const out = await h.runtime.run(runId, prompt(runId));
  assert.equal(out.result, "PASSED");
  assert.ok(out.hash_proof);

  const confirmedPackage = await h.store.load<any>(runId, "confirmed");
  const canonicalHash = out.hash_proof.created_hash;

  // 2. Instantiate Sandbox Service
  const sandbox = new SandboxService(
    h.contracts,
    h.events,
    new HardenedProcessRunner(),
    sbxRoot,
  );

  const input: SandboxExecutionInput = {
    confirmed_package: confirmedPackage,
    hash: canonicalHash,
    execution_authorization: {
      execution_id: `exec-${runId}`,
      timeout_seconds: 30,
      memory_limit_mb: 256,
      cpu_limit: 1.0,
      pid_limit: 32,
      network_policy: "DENY_ALL",
      environment_allowlist: ["NODE_ENV"],
      max_output_bytes: 1048576,
      max_files_changed: 50,
      max_total_bytes_written: 10485760,
    },
  };

  // 3. Execute Sandbox handoff
  const result = await sandbox.execute(input);

  assert.equal(result.result, "PASSED");
  if (result.result !== "PASSED") throw new Error("expected PASSED");

  assert.equal(result.hash_matched, true);
  assert.equal(result.hash_sandbox, canonicalHash);
  assert.equal(result.execution_id, `exec-${runId}`);
  assert.ok(result.evidence);
  assert.equal(result.evidence.confirmed_package_hash, canonicalHash);
  assert.equal(result.evidence.hash_sandbox, canonicalHash);
  assert.equal(result.evidence.cleanup_result.workspace_cleaned, true);
  assert.equal(result.evidence.network_policy_used, "DENY_ALL");
  assert.ok(result.evidence.commands.length > 0);
  assert.ok(result.evidence.exit_codes.every((c) => c === 0));

  // 4. Verify all 9 Task / Audit events were emitted
  const events = h.events.list(runId).filter((e) => e.scope === "SANDBOX");
  const processorNames = events.map((e) => e.processor);

  const expectedLifecycle = [
    "SandboxHandoffReceived",
    "SandboxAdmissionVerified",
    "SandboxCreated",
    "ExecutionStarted",
    "ExecutionCompleted",
    "ExecutionEvidenceRecorded",
    "SandboxHashCreated",
    "SandboxHashVerified",
    "SandboxCleaned",
  ];

  for (const step of expectedLifecycle) {
    assert.ok(
      processorNames.includes(step),
      `Missing expected sandbox event: ${step}`,
    );
  }

  // 5. Verify Sandbox Graph Projection
  const sbxGraph = projectSandboxGraph(events);
  assert.equal(sbxGraph.nodes.length, 9);
  assert.ok(sbxGraph.nodes.every((n) => n.state === "COMPLETE"));

  // 6. Verify Authority Graph includes Sandbox trace
  const authGraph = projectAuthorityGraph(h.events.list(runId));
  assert.equal(authGraph.traceability.valid, true);
  assert.ok(authGraph.nodes.some((n) => n.id === "ExternalSandbox:admission"));
  assert.ok(authGraph.nodes.some((n) => n.id === "ExternalSandbox:runner"));
  assert.ok(authGraph.nodes.some((n) => n.id === "ExternalSandbox:evidence"));
  assert.ok(
    authGraph.nodes.some((n) => n.id === "ExternalSandbox:hash-verification"),
  );

  h.bridge.close();
  await rm(sbxRoot, { recursive: true, force: true });
});
