/**
 * Google ADK 2.0 Graph Workflow Invariant Tests
 *
 * Tests:
 * 1. Static Graph Topology & Metadata (24 nodes, explicit edges, routers, JoinNode, back-edges)
 * 2. Dynamic Task Event Stream Projection
 * 3. Gap Analysis Loop (GAPS_FOUND -> Gap Fix -> Gap Recheck -> Back-Edge -> Gap Check)
 * 4. GAP_0 Loop Exit -> Evaluation Router
 * 5. Evaluation Router: PASSED -> Triple Validation Fan-Out, ROOT_CAUSE -> Terminal
 * 6. Triple Validation Concurrent Fan-Out & JoinNode Barrier
 * 7. Validation Gate Router: ALL_VALID -> Confirmed, NOT_VALID -> Root Cause
 * 8. Cryptographic Hashing (RFC 8785 + SHA-256) & Core Invariance
 * 9. Hash Verification Router: MATCH -> DONE, MISMATCH -> Root Cause
 * 10. Context Continuity: Job_id preserved across all branches, gates, and loop iterations
 * 11. Complete Specification Acceptance Suite (REQ-01 to REQ-08)
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { projectWorkflowGraph, getAdkWorkflowGraphTopology } from "../backend/graph/workflow-graph.js";
import {
  buildOneShotAdkGraph,
  createEvent,
  JoinNode,
  Workflow,
  type JobContext,
} from "../backend/workflow/workflow-graph-engine.js";
import { harness, prompt } from "./harness.js";
import type { ProcessingEvent } from "../backend/contract/types.js";

test("Google ADK 2.0 Workflow Graph - Static Topology, Routers & Back-Edge", () => {
  const g = getAdkWorkflowGraphTopology();

  assert.equal(g.graph_id, "oneshot-adk-workflow-v2");
  assert.equal(g.engine, "@google/adk");
  assert.equal(g.fan_in_barrier, "JoinNode");
  assert.equal(g.triple_validation.barrier, "triple-join");
  assert.equal(g.triple_validation.gate, "validation-gate");

  // Validate all 24 canonical nodes exist
  assert.equal(g.nodes.length, 24);
  const nodeIds = g.nodes.map((n) => n.id);

  assert.ok(nodeIds.includes("user-intent"));
  assert.ok(nodeIds.includes("generator-prompt"));
  assert.ok(nodeIds.includes("researcher"));
  assert.ok(nodeIds.includes("planner"));
  assert.ok(nodeIds.includes("refactor"));
  assert.ok(nodeIds.includes("gap-check"));
  assert.ok(nodeIds.includes("gap-fix"));
  assert.ok(nodeIds.includes("gap-recheck"));
  assert.ok(nodeIds.includes("evaluation"));
  assert.ok(nodeIds.includes("evaluation-root-cause"));
  assert.ok(nodeIds.includes("schema-validation"));
  assert.ok(nodeIds.includes("fixture-validation"));
  assert.ok(nodeIds.includes("goal-validation"));
  assert.ok(nodeIds.includes("triple-join"));
  assert.ok(nodeIds.includes("validation-gate"));
  assert.ok(nodeIds.includes("validation-root-cause"));
  assert.ok(nodeIds.includes("confirmed"));
  assert.ok(nodeIds.includes("create-hash"));
  assert.ok(nodeIds.includes("promote"));
  assert.ok(nodeIds.includes("builder"));
  assert.ok(nodeIds.includes("recompute-hash"));
  assert.ok(nodeIds.includes("hash-verification"));
  assert.ok(nodeIds.includes("hash-mismatch-root-cause"));
  assert.ok(nodeIds.includes("done"));

  // Validate presence of explicit back-edge in edge topology
  const backEdge = g.edges.find((e) => e.from === "gap-recheck" && e.to === "gap-check");
  assert.ok(backEdge, "Explicit back-edge gap-recheck -> gap-check must exist in ADK edges");
  assert.equal(backEdge.isBackEdge, true);

  // Validate router conditional edges
  const gapRouterEdge = g.edges.find((e) => e.from === "gap-check" && e.condition === "GAPS_FOUND");
  assert.ok(gapRouterEdge, "gap-check GAPS_FOUND edge must exist");

  const evalPassedEdge = g.edges.find((e) => e.from === "evaluation" && e.condition === "PASSED");
  assert.ok(evalPassedEdge, "evaluation PASSED fan-out edge must exist");

  const gateValidEdge = g.edges.find((e) => e.from === "validation-gate" && e.condition === "ALL_VALID");
  assert.ok(gateValidEdge, "validation-gate ALL_VALID edge must exist");

  const hashMatchEdge = g.edges.find((e) => e.from === "hash-verification" && e.condition === "MATCH");
  assert.ok(hashMatchEdge, "hash-verification MATCH edge must exist");
});

test("Google ADK 2.0 Workflow Graph - Dynamic Event Projection", () => {
  const sampleEvents: ProcessingEvent[] = [
    {
      event_id: "evt-1",
      sequence: 1,
      run_id: "run-test-1",
      scope: "WORKFLOW",
      processor: "Researcher",
      state: "COMPLETE",
      artifact_id: "researcher:sample",
      created_at: new Date().toISOString(),
      correlation_id: "corr-1",
      traceparent: "00-trace-1",
    },
    {
      event_id: "evt-2",
      sequence: 2,
      run_id: "run-test-1",
      scope: "WORKFLOW",
      processor: "Planner",
      state: "COMPLETE",
      artifact_id: "audit:sample",
      created_at: new Date().toISOString(),
      correlation_id: "corr-1",
      traceparent: "00-trace-1",
    },
    {
      event_id: "evt-3",
      sequence: 3,
      run_id: "run-test-1",
      scope: "WORKFLOW",
      processor: "SchemaValidation",
      state: "COMPLETE",
      result: "VALID",
      created_at: new Date().toISOString(),
      correlation_id: "corr-1",
      traceparent: "00-trace-1",
    },
    {
      event_id: "evt-4",
      sequence: 4,
      run_id: "run-test-1",
      scope: "WORKFLOW",
      processor: "FixtureValidation",
      state: "COMPLETE",
      result: "VALID",
      created_at: new Date().toISOString(),
      correlation_id: "corr-1",
      traceparent: "00-trace-1",
    },
    {
      event_id: "evt-5",
      sequence: 5,
      run_id: "run-test-1",
      scope: "WORKFLOW",
      processor: "GoalValidation",
      state: "COMPLETE",
      result: "VALID",
      created_at: new Date().toISOString(),
      correlation_id: "corr-1",
      traceparent: "00-trace-1",
    },
  ];

  const g = projectWorkflowGraph(sampleEvents);

  const researcherNode = g.nodes.find((n) => n.id === "researcher");
  assert.equal(researcherNode?.state, "COMPLETE");
  assert.equal(researcherNode?.artifactId, "researcher:sample");

  const plannerNode = g.nodes.find((n) => n.id === "planner");
  assert.equal(plannerNode?.state, "COMPLETE");

  const joinNode = g.nodes.find((n) => n.id === "triple-join");
  assert.equal(joinNode?.state, "COMPLETE");
});

test("Google ADK 2.0 Gap Analysis Loop: GAPS_FOUND -> Gap Fix -> Gap Recheck -> Back-Edge -> GAP_0", async () => {
  const h = await harness("adk-gap-loop");
  const runId = "test-adk-gap-loop";
  h.runs.create(runId);

  try {
    const p = prompt(runId);
    const bundle = await h.researcher.run(p, runId);
    const audit = await h.planner.run(bundle, runId);
    const refactoredPlan = await h.refactor.run(bundle, audit);

    const graphEngine = buildOneShotAdkGraph(h.validation, h.contracts);

    // Test Job with synthetic unresolved gap (gap_0: false) to trigger GAPS_FOUND
    const jobWithGaps: JobContext = {
      Job_id: `job:${runId}`,
      Prompt_id: bundle.prompt.prompt_id,
      bundle,
      plan: refactoredPlan,
      audit,
      gap: {
        plan_id: refactoredPlan.plan_id,
        result: "ROOT_CAUSE",
        resolved_gaps: [],
        gap_0: false,
      },
      status: "IN_PROGRESS",
    };

    const ctx = { runId, jobId: `job:${runId}` };

    // Step 1: Initial Gap Check Router routes to GAPS_FOUND
    const gapEvent1 = await graphEngine.nodes.gapCheckRouter.run(ctx, jobWithGaps);
    assert.equal(gapEvent1.route, "GAPS_FOUND");

    // Step 2: GAPS_FOUND routes to Gap Fix Node
    await graphEngine.nodes.gapFixNode.run(ctx, jobWithGaps);
    assert.equal(jobWithGaps.gap_fix_iterations, 1);

    // Step 3: Gap Fix routes to Gap Recheck Node
    await graphEngine.nodes.gapRecheckNode.run(ctx, jobWithGaps);
    assert.equal(jobWithGaps.gap?.gap_0, true);

    // Step 4: Back-Edge loops back to Gap Check Router
    const gapEvent2 = await graphEngine.nodes.gapCheckRouter.run(ctx, jobWithGaps);
    assert.equal(gapEvent2.route, "GAP_0", "Back-edge loop must resolve to GAP_0 once gaps are cleared");
  } finally {
    h.bridge.close();
  }
});

test("Google ADK 2.0 Evaluation Router: PASSED -> Fan-Out, ROOT_CAUSE -> Terminal", async () => {
  const h = await harness("adk-eval-router");
  const runId = "test-adk-eval-router";
  h.runs.create(runId);

  try {
    const p = prompt(runId);
    const bundle = await h.researcher.run(p, runId);
    const audit = await h.planner.run(bundle, runId);
    const refactoredPlan = await h.refactor.run(bundle, audit);
    const gap = await h.gapper.run(bundle, refactoredPlan);

    const graphEngine = buildOneShotAdkGraph(h.validation, h.contracts);
    const ctx = { runId, jobId: `job:${runId}` };

    // Case A: Passed evaluation
    const goodJob: JobContext = {
      Job_id: `job:${runId}`,
      Prompt_id: bundle.prompt.prompt_id,
      bundle,
      plan: gap.plan,
      audit,
      gap: gap.gap,
      evaluation_result: "PASSED",
      status: "IN_PROGRESS",
    };

    const passedEvent = await graphEngine.nodes.evaluationRouter.run(ctx, goodJob);
    assert.equal(passedEvent.route, "PASSED");

    // Case B: Failed evaluation
    const failedJob: JobContext = {
      Job_id: `job:${runId}`,
      Prompt_id: bundle.prompt.prompt_id,
      bundle,
      plan: gap.plan,
      audit,
      gap: gap.gap,
      evaluation_result: "ROOT_CAUSE",
      status: "IN_PROGRESS",
    };

    const failedEvent = await graphEngine.nodes.evaluationRouter.run(ctx, failedJob);
    assert.equal(failedEvent.route, "ROOT_CAUSE");
    assert.equal(failedJob.status, "ROOT_CAUSE");
  } finally {
    h.bridge.close();
  }
});

test("Google ADK 2.0 Triple Validation Fan-Out, JoinNode Barrier & Gate Routing", async () => {
  const h = await harness("adk-triple-fan");
  const runId = "test-adk-triple-fan";
  h.runs.create(runId);

  try {
    const p = prompt(runId);
    const bundle = await h.researcher.run(p, runId);
    const audit = await h.planner.run(bundle, runId);
    const refactoredPlan = await h.refactor.run(bundle, audit);

    const graphEngine = buildOneShotAdkGraph(h.validation, h.contracts);
    const ctx = { runId, jobId: `job:${runId}` };

    const job: JobContext = {
      Job_id: `job:${runId}`,
      Prompt_id: bundle.prompt.prompt_id,
      bundle,
      plan: refactoredPlan,
      status: "IN_PROGRESS",
    };

    // Parallel fan-out
    const [s, f, g] = await Promise.all([
      graphEngine.nodes.schemaValidator.run(ctx, job),
      graphEngine.nodes.fixtureValidator.run(ctx, job),
      graphEngine.nodes.goalValidator.run(ctx, job),
    ]);

    assert.equal(s.result, "VALID");
    assert.equal(f.result, "VALID");
    assert.equal(g.result, "VALID");

    // JoinNode barrier
    const joined = await graphEngine.nodes.tripleJoinBarrier.run(ctx, { schema: s, fixture: f, goal: g });
    assert.ok(joined.schema);
    assert.ok(joined.fixture);
    assert.ok(joined.goal);

    // Validation Gate router (ALL_VALID)
    const gateEvent = await graphEngine.nodes.validationGateRouter.run(ctx, { job, joined });
    assert.equal(gateEvent.route, "ALL_VALID");
    assert.equal(job.all_valid, true);

    // Negative case: if one validator is NOT_VALID, gate routes to NOT_VALID
    const joinedWithFailure = {
      schema: { validator: "schema", result: "NOT_VALID" as const },
      fixture: f,
      goal: g,
    };
    const badJob: JobContext = { ...job, status: "IN_PROGRESS" };
    const failGateEvent = await graphEngine.nodes.validationGateRouter.run(ctx, { job: badJob, joined: joinedWithFailure });
    assert.equal(failGateEvent.route, "NOT_VALID");
    assert.equal(badJob.status, "ROOT_CAUSE");
  } finally {
    h.bridge.close();
  }
});

test("Google ADK 2.0 Full End-to-End Execution with Hash Gate & Job_id Preservation", async () => {
  const h = await harness("adk-full-e2e");
  const runId = "test-adk-full-e2e";
  const jobId = `job:canonical-${runId}`;
  h.runs.create(runId);

  try {
    const p = prompt(runId);
    const bundle = await h.researcher.run(p, runId);
    const audit = await h.planner.run(bundle, runId);
    const refactoredPlan = await h.refactor.run(bundle, audit);
    const gap = await h.gapper.run(bundle, refactoredPlan);
    const evaluation = await h.evaluator.run(bundle, gap.plan);

    const graphEngine = buildOneShotAdkGraph(h.validation, h.contracts);

    const jobContext: JobContext = {
      Job_id: jobId,
      Prompt_id: bundle.prompt.prompt_id,
      bundle,
      plan: gap.plan,
      audit,
      gap: gap.gap,
      evaluation,
      status: "IN_PROGRESS",
    };

    const finalJob = await graphEngine.executeJob(jobContext);

    // Assert Job_id stability throughout entire graph
    assert.equal(finalJob.Job_id, jobId);
    assert.equal(finalJob.status, "DONE");
    assert.equal(finalJob.all_valid, true);
    assert.ok(finalJob.confirmed_package);
    assert.ok(finalJob.created_hash);
    assert.ok(finalJob.recomputed_hash);
    assert.equal(finalJob.created_hash, finalJob.recomputed_hash);

    // Test Hash Mismatch Router failure path
    const mismatchedJob: JobContext = {
      ...finalJob,
      created_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      recomputed_hash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      status: "IN_PROGRESS",
    };
    const mismatchEvent = await graphEngine.nodes.hashVerificationRouter.run(
      { runId, jobId },
      mismatchedJob,
    );
    assert.equal(mismatchEvent.route, "MISMATCH");
    assert.equal(mismatchedJob.status, "ROOT_CAUSE");
  } finally {
    h.bridge.close();
  }
});

test("Google ADK 2.0 Graph - Complete Specification Acceptance Suite (REQ-01 to REQ-08)", () => {
  const topo = getAdkWorkflowGraphTopology();

  // REQ-01: Gap Analysis not opaque: Router + Fix + Recheck + Back-Edge
  const hasCheck = topo.nodes.some((n) => n.id === "gap-check" && n.kind === "router");
  const hasFix = topo.nodes.some((n) => n.id === "gap-fix");
  const hasRecheck = topo.nodes.some((n) => n.id === "gap-recheck");
  const backEdge = topo.edges.some((e) => e.from === "gap-recheck" && e.to === "gap-check" && e.isBackEdge);
  assert.ok(hasCheck && hasFix && hasRecheck && backEdge, "REQ-01: Gap Analysis Loop must have explicit back-edge");

  // REQ-02: Evaluation is an explicit Router (PASSED vs ROOT_CAUSE)
  const hasEval = topo.nodes.some((n) => n.id === "evaluation" && n.kind === "router");
  const passedEdge = topo.edges.some((e) => e.from === "evaluation" && e.condition === "PASSED");
  const rootCauseEdge = topo.edges.some((e) => e.from === "evaluation" && e.condition === "ROOT_CAUSE");
  assert.ok(hasEval && passedEdge && rootCauseEdge, "REQ-02: Evaluation Router must have PASSED and ROOT_CAUSE edges");

  // REQ-03: Triple Validation is Real Fan-Out / Fan-In with JoinNode Barrier
  const schemaIn = topo.edges.some((e) => e.from === "schema-validation" && e.to === "triple-join");
  const fixtureIn = topo.edges.some((e) => e.from === "fixture-validation" && e.to === "triple-join");
  const goalIn = topo.edges.some((e) => e.from === "goal-validation" && e.to === "triple-join");
  const joinNode = topo.nodes.some((n) => n.id === "triple-join" && n.kind === "join");
  assert.ok(schemaIn && fixtureIn && goalIn && joinNode, "REQ-03: Triple Validation must fan into JoinNode");

  // REQ-04: Validation Gate Routes (ALL_VALID vs NOT_VALID)
  const hasGate = topo.nodes.some((n) => n.id === "validation-gate" && n.kind === "gate");
  const validEdge = topo.edges.some((e) => e.from === "validation-gate" && e.condition === "ALL_VALID");
  const notValEdge = topo.edges.some((e) => e.from === "validation-gate" && e.condition === "NOT_VALID");
  assert.ok(hasGate && validEdge && notValEdge, "REQ-04: Validation Gate must route ALL_VALID vs NOT_VALID");

  // REQ-05: Hash Verification Routes (MATCH vs MISMATCH)
  const hasHash = topo.nodes.some((n) => n.id === "hash-verification" && n.kind === "router");
  const matchEdge = topo.edges.some((e) => e.from === "hash-verification" && e.condition === "MATCH");
  const mismatchEdge = topo.edges.some((e) => e.from === "hash-verification" && e.condition === "MISMATCH");
  assert.ok(hasHash && matchEdge && mismatchEdge, "REQ-05: Hash Verification must route MATCH vs MISMATCH");

  // REQ-06: Google ADK Engine is Execution Authority
  assert.equal(topo.engine, "@google/adk", "REQ-06: ADK Engine must be @google/adk");

  // REQ-07: Real Topology in UI Component
  const modalSource = fs.readFileSync("web/src/components/WorkflowGraphModal.tsx", "utf8");
  assert.ok(modalSource.includes("loopContainer") && modalSource.includes("gap-check"), "REQ-07: UI must render Gap Loop");
  assert.ok(modalSource.includes("triple-join"), "REQ-07: UI must render JoinNode");
  assert.ok(modalSource.includes("inspectorDrawer"), "REQ-07: UI must render Instruction Side Inspector");

  // REQ-08: 3-Option Installation UX & Review Workflow in Welcome Component
  const welcomeSource = fs.readFileSync("web/src/components/WelcomeDocsIndex.tsx", "utf8");
  assert.ok(welcomeSource.includes("Windows — Download ZIP"), "REQ-08: Welcome screen must render Windows ZIP option");
  assert.ok(welcomeSource.includes("CLI"), "REQ-08: Welcome screen must render CLI option");
  assert.ok(welcomeSource.includes("Developer / Source"), "REQ-08: Welcome screen must render Developer option");
  assert.ok(welcomeSource.includes("Review steps ▼") || welcomeSource.includes("Review steps"), "REQ-08: Steps must have toggle");
  assert.ok(welcomeSource.includes("Review Workflow ▼") || welcomeSource.includes("Review Workflow"), "REQ-08: Workflow must have toggle");
});
