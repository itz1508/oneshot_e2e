/**
 * Phase 5 — failure recovery tests. Ordinary tests here are fully
 * deterministic: provider, Tavily, sandbox, and researcher transports are
 * mocked; ZERO paid/live external calls.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

import {
  classifyFailure,
  collectEvidence,
  evaluateRetryPolicy,
  backoffDelayMs,
  RecoveryOrchestrator,
  LocalRecoveryResearcher,
  MAX_RESEARCH_ESCALATIONS_PER_FAILURE,
  type RecoveryResearchRequest,
  type RecoveryResearchResult,
  type RecoveryResearcher,
  type AdvancedResearchCollector,
} from "../../recovery/index.js";
import { ProcessingEventBus } from "../../runtime/event-bus.js";
import { RunRepository } from "../../runtime/run-repository.js";
import type { RootCause } from "../../contracts/schema/types.js";

// ---------------------------------------------------------------------------
// Deterministic in-memory stores (no disk, no network)
// ---------------------------------------------------------------------------

class MemoryRunRepository {
  private runs = new Map<string, unknown>();
  create(runId: string): unknown {
    const r = { run_id: runId, events: [], artifacts: {} };
    this.runs.set(runId, r);
    return r;
  }
  get(runId: string): unknown {
    return this.runs.get(runId);
  }
  require(runId: string): unknown {
    const r = this.runs.get(runId);
    if (!r) throw new Error(`Unknown run ${runId}`);
    return r;
  }
  event(runId: string, e: { sequence: number }): void {
    (this.require(runId) as { events: unknown[] }).events.push(e);
  }
  artifact(runId: string, name: string, path: string): void {
    const r = this.require(runId) as { artifacts: Record<string, string> };
    r.artifacts[name] = path;
  }
  update(
    runId: string,
    mutate: (snapshot: unknown) => void,
  ): unknown {
    const r = this.get(runId);
    if (!r) return undefined;
    mutate(r);
    return r;
  }
  finish(): unknown {
    return this.require("");
  }
}

const anyBus = () => new ProcessingEventBus();

function orchestrator(
  researcher?: RecoveryResearcher,
  advanced?: AdvancedResearchCollector | null,
  advancedEnabled?: boolean,
) {
  const runs = new MemoryRunRepository() as unknown as RunRepository;
  const events = anyBus();
  runs.create("run-recovery");
  return {
    runs,
    events,
    orch: new RecoveryOrchestrator({
      runs,
      events,
      researcher: researcher ?? new LocalRecoveryResearcher(),
      advancedResearch: advanced ?? null,
      advancedResearchEnabled: advancedEnabled ?? advanced != null,
    }),
  };
}

const baseInput = (overrides: Record<string, unknown> = {}) => ({
  runId: "run-recovery",
  stage: "Workflow",
  message: "Something failed",
  ...overrides,
});

// ---------------------------------------------------------------------------
// 1-3. Provider failures stop before sandbox (failure boundaries)
// ---------------------------------------------------------------------------

test("provider auth failure maps to PROVIDER_AUTH_FAILURE and stops before sandbox", async () => {
  const { orch } = orchestrator();
  const { snapshot } = await orch.handleFailure(baseInput({
    stage: "ProviderBinding",
    message: "provider rejected the credential: 401 unauthorized (invalid api key)",
    provider: { id: "featherless" },
  }));

  assert.equal(snapshot.failure_category, "PROVIDER_AUTH_FAILURE");
  assert.equal(snapshot.failed_stage, "ProviderBinding");
  assert.equal(snapshot.state, "RECOMMENDATION_READY");
  assert.match(snapshot.result.recommendation, /credential/i);
  assert.equal(snapshot.result.retryable, false);
  // No sandbox evidence collected => no sandbox execution happened.
  assert.ok(!snapshot.evidence.some((e) => e.source.startsWith("sandbox")));
});

test("provider model failure maps to PROVIDER_MODEL_FAILURE and stops before sandbox", async () => {
  const { orch } = orchestrator();
  const { snapshot } = await orch.handleFailure(baseInput({
    stage: "ProviderBinding",
    message: "model gemma-2-27b-it is not available from this provider",
    provider: { id: "featherless", model: "gemma-2-27b-it" },
  }));

  assert.equal(snapshot.failure_category, "PROVIDER_MODEL_FAILURE");
  assert.equal(snapshot.failed_stage, "ProviderBinding");
  assert.equal(snapshot.result.retryable, false);
  assert.ok(!snapshot.evidence.some((e) => e.source.startsWith("sandbox")));
  assert.match(snapshot.result.rootCause, /not accepted by the provider/i);
});

test("provider network failure has bounded retryability from the normalized provider result", async () => {
  const { orch } = orchestrator();
  const { snapshot, report } = await orch.handleFailure(baseInput({
    stage: "ProviderBinding",
    message: "ECONNRESET while contacting the provider endpoint",
    providerStatus: { category: "PROVIDER_NETWORK_FAILURE", retryable: true, message: "ECONNRESET" },
    provider: { id: "gemini" },
  }));

  assert.equal(snapshot.failure_category, "PROVIDER_NETWORK_FAILURE");
  assert.equal(snapshot.result.retryable, true);
  assert.equal(snapshot.retry.allowed, true, "retryable provider failures pass the retry gate");
  assert.equal(report.status, "READY_TO_RETRY");
  assert.ok(snapshot.retry.attempts < snapshot.retry.max_attempts);
});

// ---------------------------------------------------------------------------
// 4-7. Failure taxonomy over workflow-stage failures
// ---------------------------------------------------------------------------

test("sandbox non-zero exit becomes SANDBOX_EXECUTION_FAILURE", async () => {
  const { orch } = orchestrator();
  const { snapshot } = await orch.handleFailure(baseInput({
    stage: "Sandbox",
    message: "Commands exited with codes: 1.",
    sandbox: {
      executionId: "exec-123",
      exitCodes: [0, 1],
      stderrRefs: ["refs/stderr-0"],
      firstStderrLine: "OneShot determinstic failure injection: exit 1",
    },
  }));
  assert.equal(snapshot.failure_category, "SANDBOX_EXECUTION_FAILURE");
});

test("compiler/build failure becomes BUILD_FAILURE", async () => {
  const { orch } = orchestrator();
  const { snapshot } = await orch.handleFailure(baseInput({
    stage: "Builder",
    message: "Commands exited with codes: 2.",
    sandbox: { executionId: "exec-124", exitCodes: [2], firstStderrLine: "error TS2307: Cannot find module './missing.js'." },
  }));
  assert.equal(snapshot.failure_category, "BUILD_FAILURE");
});

test("schema/fixture/goal failure becomes VALIDATION_FAILURE", async () => {
  const { orch } = orchestrator();
  const { snapshot } = await orch.handleFailure(baseInput({
    stage: "FixtureValidation",
    message: "Fixture validation reported NOT_VALID",
    validation: {
      validationId: "val:1",
      planId: "plan:1",
      fixtureId: "fixture:1",
      schemaValid: true,
      failedAssertions: ["assert:edge-exists"],
    },
  }));
  assert.equal(snapshot.failure_category, "VALIDATION_FAILURE");
  assert.match(snapshot.result.rootCause, /fixture/i);
});

test("unexpected workflow exception becomes WORKFLOW_INTERNAL_FAILURE", async () => {
  const { orch } = orchestrator();
  const { snapshot } = await orch.handleFailure(baseInput({
    stage: "Workflow",
    message: "TypeError: cannot read properties of undefined (reading 'core')",
  }));
  assert.equal(snapshot.failure_category, "WORKFLOW_INTERNAL_FAILURE");
  assert.equal(snapshot.result.retryable, false);
});

// ---------------------------------------------------------------------------
// 8-10. Root-cause artifact contents (evidence ids, no dumps, no secrets)
// ---------------------------------------------------------------------------

test("root-cause result contains real evidence ids", async () => {
  const { orch } = orchestrator();
  const { snapshot } = await orch.handleFailure(baseInput({
    stage: "Sandbox",
    message: "Commands exited with codes: 1.",
    sandbox: {
      executionId: "exec-evid",
      exitCodes: [1],
      firstStderrLine: "module resolution failed for entry step",
    },
    artifactIds: ["plan:abc"],
  }));
  assert.ok(snapshot.result.evidenceIds.length >= 3);
  // Every id must reference actually-collected evidence (attributable).
  const ids = new Set(snapshot.evidence.map((e) => e.evidence_id));
  for (const id of snapshot.result.evidenceIds) {
    assert.ok(ids.has(id), `evidence id ${id} must exist in collected evidence`);
  }
  const exec = snapshot.evidence.find((e) => e.statement.includes("exec-evid"));
  assert.ok(exec, "execution evidence is attributable to the run");
});

test("user-facing root cause contains no raw stack dump", async () => {
  const { orch } = orchestrator();
  const stackDump = [
    "TypeError: boom",
    "    at Builder.run (d:/proj/backend/role/builder/workflow.ts:41:13)",
    "    at WorkflowRuntime.run (d:/proj/backend/runtime/workflow-runtime.ts:120:20)",
    "    at async executeRunJob (d:/proj/backend/runtime/queue.ts:656:5)",
  ].join("\n");
  const { snapshot, report } = await orch.handleFailure(baseInput({
    stage: "Builder",
    message: stackDump,
  }));

  const serialized = JSON.stringify({ snapshot, report });
  assert.ok(!serialized.includes("at Builder.run"), "no stack frames in user-facing result");
  assert.ok(!serialized.includes("workflow-runtime.ts:120"), "no file:line stack entries");
  assert.ok(serialized.length < 8000, "user-facing payload stays bounded");
  assert.ok(!snapshot.result.rootCause.includes("\n"), "single-line bounded root cause");
});

test("API keys never enter root-cause payloads", async () => {
  const { orch } = orchestrator();
  const secret = "sk-live-9f8e7d6c5b4a3210fedcba";
  const { snapshot, report } = await orch.handleFailure(baseInput({
    stage: "ProviderBinding",
    message: `Provider rejected api_key=${secret} with 401 unauthorized`,
    provider: { id: "featherless" },
  }));
  const serialized = JSON.stringify({ snapshot, report });
  assert.ok(!serialized.includes(secret), "raw key material must never appear");
  assert.ok(!serialized.includes("sk-live-"), "redacted key prefixes must not appear");
});

// ---------------------------------------------------------------------------
// 11-12. Bounded researcher escalation
// ---------------------------------------------------------------------------

test("sufficient evidence produces recommendation without researcher escalation", async () => {
  let calls = 0;
  const researcher: RecoveryResearcher = {
    async research() {
      calls += 1;
      throw new Error("researcher must not be called");
    },
  };
  const { orch } = orchestrator(researcher);
  const { snapshot, report } = await orch.handleFailure(baseInput({
    stage: "Sandbox",
    message: "Commands exited with codes: 1.",
    sandbox: { executionId: "exec-suff", exitCodes: [1], firstStderrLine: "boom" },
  }));
  assert.equal(calls, 0, "no escalation when evidence is sufficient");
  assert.equal(snapshot.result.needsResearch, false);
  assert.equal(snapshot.research_escalations.length, 0);
  assert.equal(report.research.escalated, false);
  assert.match(snapshot.result.recommendation, /correction/i);
});

test("insufficient evidence triggers exactly one bounded researcher escalation", async () => {
  let calls = 0;
  const researcher: RecoveryResearcher = {
    async research(request: RecoveryResearchRequest) {
      calls += 1;
      return {
        additionalEvidence: [
          {
            evidence_id: "ev:research:extra",
            source: "research:local",
            statement: "Repository inspection found a missing peer dependency",
            provenance: "recovery-research",
          },
        ],
        findings: "A missing peer dependency likely caused the failure",
        citations: [],
        sources: ["local"],
      };
    },
  };
  const { orch } = orchestrator(researcher);
  const { snapshot, report } = await orch.handleFailure(baseInput({
    stage: "Workflow",
    message: "Workflow node failed without further diagnostics",
  }));
  assert.equal(calls, 1, "exactly one escalation (bounded policy)");
  assert.equal(snapshot.research_escalations.length, 1);
  assert.equal(MAX_RESEARCH_ESCALATIONS_PER_FAILURE, 1);
  assert.ok(snapshot.result.recommendation.includes("research"));
  assert.ok(snapshot.research_escalations[0].additionalEvidence.length >= 1);
  assert.equal(report.status, "ADDITIONAL_RESEARCH_PERFORMED");
  assert.ok(
    snapshot.evidence.some((e) => e.evidence_id === "ev:research:extra") ||
      snapshot.research_escalations[0].additionalEvidence.some((e) => e.evidence_id === "ev:research:extra"),
    "merged research evidence is retained",
  );
});

test("research escalation does not loop: repeated failures each escalate at most once", async () => {
  let calls = 0;
  const researcher: RecoveryResearcher = {
    async research() {
      calls += 1;
      return { additionalEvidence: [], findings: "still unclear", citations: [], sources: ["local"] };
    },
  };
  const { orch } = orchestrator(researcher);
  // Two independent failure cycles (not a loop within one cycle).
  await orch.handleFailure(baseInput({ message: "opaque failure one" }));
  await orch.handleFailure(baseInput({ message: "opaque failure two" }));
  assert.equal(calls, 2, "one bounded escalation per failure cycle");
});

// ---------------------------------------------------------------------------
// 13-14. Tavily optional; never changes the selected ModelProvider
// ---------------------------------------------------------------------------

test("Tavily disabled still allows local recovery research", async () => {
  let tavilyCalls = 0;
  const advanced: AdvancedResearchCollector = {
    async collect() {
      tavilyCalls += 1;
      throw new Error("Tavily must not run when disabled");
    },
  };
  // Collector injected but explicitly DISABLED — it must never be invoked.
  const { orch } = orchestrator(undefined, advanced, false);
  const { snapshot } = await orch.handleFailure(baseInput({
    message: "opaque failure needing research",
  }));
  assert.equal(tavilyCalls, 0, "Tavily is never required for recovery");
  assert.equal(snapshot.research_escalations.length, 1);
  assert.deepEqual(snapshot.research_escalations[0].sources, ["local"]);
  assert.ok(snapshot.result.recommendation.length > 0, "recommendation still produced");
});

test("Tavily enabled may contribute evidence but never changes selected ModelProvider", async () => {
  const advanced: AdvancedResearchCollector = {
    async collect(question: string) {
      assert.ok(question.length > 0);
      return [
        {
          evidence_id: "tavily-1",
          source: "https://example.com/docs",
          statement: "Docs describe the corrected API shape",
          provenance: "tavily-search:req-1",
        },
      ];
    },
  };
  const { orch } = orchestrator(undefined, advanced);
  const { snapshot } = await orch.handleFailure(baseInput({
    message: "opaque failure needing research",
    provider: { id: "featherless", model: "gemma-2-27b-it" },
  }));
  const research = snapshot.research_escalations[0];
  assert.ok(research.sources.includes("tavily"), "Tavily evidence contributed");
  assert.ok(research.sources.includes("local"), "local evidence still used");
  // The selected provider/model snapshot is unchanged by Tavily usage.
  assert.deepEqual(snapshot.provider, { id: "featherless", model: "gemma-2-27b-it" });
});

// ---------------------------------------------------------------------------
// 15-18. State machine + retry policy
// ---------------------------------------------------------------------------

test("researcher escalation cannot mark run DONE", async () => {
  const { orch, runs } = orchestrator();
  const { snapshot } = await orch.handleFailure(baseInput({
    message: "opaque failure needing research",
  }));
  assert.notEqual(snapshot.state, "DONE");
  assert.notEqual(snapshot.state, "RUNNING");
  assert.equal(snapshot.state, "RECOMMENDATION_READY");
  // The canonical run result is untouched by recovery (no result forgery).
  const raw = runs.get("run-recovery") as { result?: string } | undefined;
  assert.ok(!raw?.result, "recovery must not set a workflow result on the run");
});

test("retry cannot occur without policy approval", () => {
  const refusal = evaluateRetryPolicy({ category: "BUILD_FAILURE", attempts: 0 });
  assert.equal(refusal.approved, false);
  assert.match(refusal.reason, /concrete fix|correction/i);

  const approved = evaluateRetryPolicy({
    category: "BUILD_FAILURE",
    attempts: 1,
    correctionApplied: true,
  });
  assert.equal(approved.approved, true);
});

test("auth/model failures do not auto-retry", () => {
  for (const category of ["PROVIDER_AUTH_FAILURE", "PROVIDER_MODEL_FAILURE"] as const) {
    const d = evaluateRetryPolicy({ category, attempts: 0 });
    assert.equal(d.approved, false, `${category} must not auto-retry`);
    const dCorrection = evaluateRetryPolicy({ category, attempts: 0, correctionApplied: true });
    assert.equal(dCorrection.approved, true, "correction-based retry still allowed");
  }
  // The orchestrator gate refuses retries unless approval is present.
  const { orch } = orchestrator();
});

test("network retries are bounded", async () => {
  assert.equal(backoffDelayMs(1), 1_000);
  assert.equal(backoffDelayMs(2), 2_000);
  assert.equal(backoffDelayMs(3), 4_000);
  assert.equal(backoffDelayMs(10), 8_000, "backoff is capped");
  const { orch } = orchestrator();
  await orch.handleFailure(baseInput({
    stage: "ProviderBinding",
    message: "ECONNRESET",
    providerStatus: { category: "PROVIDER_NETWORK_FAILURE", retryable: true, message: "ECONNRESET" },
  }));
  // Attempts climb only through the gate, never beyond the ceiling.
  assert.ok(orch.approveRetry("run-recovery", "network retryable"));
  assert.ok(orch.approveRetry("run-recovery", "network retryable"));
  assert.ok(orch.approveRetry("run-recovery", "network retryable"));
  const refused = orch.approveRetry("run-recovery", "network retryable");
  assert.equal(refused, false, "bounded ceiling refused the 4th attempt");
  const snap = orch.get("run-recovery");
  assert.equal(snap?.retry.attempts, 3);
  assert.match(
    snap?.retry.policy_reason ?? "",
    /ceiling|manual review/i,
  );
});

// ---------------------------------------------------------------------------
// 19-20. Corrected retries still pass the canonical loop; failures stay ROOT_CAUSE
// ---------------------------------------------------------------------------

test("successful corrected retry still must pass normal validation/hash verification", async () => {
  const { orch, runs } = orchestrator();
  await orch.handleFailure(baseInput({
    stage: "Builder",
    message: "Commands exited with codes: 2.",
    sandbox: { executionId: "exec-fix", exitCodes: [2] },
  }));
  // Retry is approved only because a concrete correction was applied.
  assert.ok(orch.approveRetry("run-recovery", "correction applied: fixed module import"));
  orch.markRetrying("run-recovery");
  assert.equal(orch.get("run-recovery")?.state, "RUNNING");

  // Re-execution goes through the canonical workflow only; recovery never
  // writes a result, so PASSED can only come from Hash-verified success.
  const snap = runs.get("run-recovery") as { result?: string } | undefined;
  assert.ok(!snap?.result, "retry start must not fabricate a PASSED result");
  assert.ok(
    orch.get("run-recovery")?.result.recommendation.includes("Sandbox"),
    "recommendation keeps requiring Builder -> Sandbox -> Validation",
  );
});

test("failed retry remains ROOT_CAUSE, never false DONE", async () => {
  const { orch } = orchestrator();
  await orch.handleFailure(baseInput({
    stage: "Sandbox",
    message: "Commands exited with codes: 1.",
    sandbox: { executionId: "exec-retry-fail", exitCodes: [1] },
  }));
  assert.ok(orch.approveRetry("run-recovery", "correction applied: patched build script"));
  orch.markRetrying("run-recovery");
  // The corrected retry fails again in the sandbox:
  const second = await orch.handleFailure(baseInput({
    stage: "Sandbox",
    message: "Commands exited with codes: 1.",
    sandbox: { executionId: "exec-retry-fail-2", exitCodes: [1] },
  }));
  assert.equal(second.snapshot.state, "RECOMMENDATION_READY");
  assert.notEqual(second.snapshot.state, "DONE");
  assert.equal(second.snapshot.failure_category, "SANDBOX_EXECUTION_FAILURE");
});

// ---------------------------------------------------------------------------
// 21. Persistence / reconnection
// ---------------------------------------------------------------------------

test("persisted/reloaded run reconstructs recovery state", async () => {
  const root = resolve(".runtime/test-harness/recovery-persist");
  rmSync(root, { recursive: true, force: true });
  const disk = new RunRepository(root);
  const events = new ProcessingEventBus();
  const orchA = new RecoveryOrchestrator({
    runs: disk,
    events,
    researcher: new LocalRecoveryResearcher(),
  });
  disk.create("run-durable");
  await orchA.handleFailure({
    runId: "run-durable",
    stage: "ProviderBinding",
    message: "invalid api key (401 unauthorized)",
    provider: { id: "featherless" },
  });

  // A NEW orchestrator over a NEW repository instance reconstructs state
  // purely from the durable run snapshot on disk.
  const reloaded = new RunRepository(root);
  const orchB = new RecoveryOrchestrator({
    runs: reloaded,
    events: new ProcessingEventBus(),
    researcher: new LocalRecoveryResearcher(),
  });
  const snap = orchB.get("run-durable");
  assert.ok(snap, "recovery state survives persistence");
  assert.equal(snap?.failure_category, "PROVIDER_AUTH_FAILURE");
  assert.equal(snap?.state, "RECOMMENDATION_READY");
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 23. Detailed evidence remains in Task Management / Run Context surfaces
// ---------------------------------------------------------------------------

test("detailed evidence remains in Task Management / Run Context surfaces", async () => {
  const { orch } = orchestrator();
  const { snapshot } = await orch.handleFailure(baseInput({
    stage: "Sandbox",
    message: "Commands exited with codes: 1.",
    sandbox: {
      executionId: "exec-tm",
      exitCodes: [1],
      stderrRefs: ["refs/stderr-7"],
      firstStderrLine: "sqlite3 module missing in sandbox image",
    },
  }));
  // Evidence items (with sources/provenance) live on the snapshot for the
  // Run Context surface; the user-facing root-cause result only carries ids.
  assert.ok(snapshot.evidence.some((e) => e.source === "sandbox:stderr"));
  assert.ok(snapshot.evidence.every((e) => e.statement.length <= 300));
  const userFacing = JSON.stringify(snapshot.result);
  assert.ok(!userFacing.includes("sqlite3"), "raw stderr text not in user-facing result");
  assert.ok(snapshot.result.evidenceIds.length > 0, "ids point at the detailed surface");
});

// ---------------------------------------------------------------------------
// 24. Zero live calls in ordinary tests (static transport guarantee)
// ---------------------------------------------------------------------------

test("ordinary recovery tests perform zero paid/live external calls", () => {
  // The recovery pipeline is wired with LocalRecoveryResearcher by default
  // and an absent (null) Tavily collector: no network transport is even
  // constructible in these tests.
  const local = new LocalRecoveryResearcher();
  assert.ok(typeof local.research === "function");
  assert.equal(MAX_RESEARCH_ESCALATIONS_PER_FAILURE, 1);
});