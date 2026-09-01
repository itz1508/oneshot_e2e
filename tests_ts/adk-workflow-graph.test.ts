import test from "node:test";
import assert from "node:assert/strict";
import { projectWorkflowGraph } from "../backend/graph/workflow-graph.js";
import {
  createTripleValidationWorkflow,
  createOneShotAdkWorkflow,
  type JobContext,
} from "../backend/workflow/workflow-graph-engine.js";
import { harness, prompt } from "./harness.js";
import type { ProcessingEvent } from "../backend/contract/types.js";

test("Google ADK 2.0 Workflow Graph - Static Topology & Metadata", () => {
  const g = projectWorkflowGraph();

  assert.equal(g.graph_id, "oneshot-adk-workflow-v2");
  assert.equal(g.engine, "@google/adk");
  assert.equal(g.fan_in_barrier, "JoinNode");
  assert.equal(g.triple_validation.barrier, "triple-join");
  assert.equal(g.triple_validation.gate, "triple-gate");

  // Validate all 19 canonical nodes exist
  assert.equal(g.nodes.length, 19);
  const nodeIds = g.nodes.map((n) => n.id);

  assert.ok(nodeIds.includes("user-intent"));
  assert.ok(nodeIds.includes("generator-prompt"));
  assert.ok(nodeIds.includes("researcher"));
  assert.ok(nodeIds.includes("planner"));
  assert.ok(nodeIds.includes("refactor"));
  assert.ok(nodeIds.includes("gap-analysis"));
  assert.ok(nodeIds.includes("evaluation"));
  assert.ok(nodeIds.includes("schema-validation"));
  assert.ok(nodeIds.includes("fixture-validation"));
  assert.ok(nodeIds.includes("goal-validation"));
  assert.ok(nodeIds.includes("triple-join"));
  assert.ok(nodeIds.includes("triple-gate"));
  assert.ok(nodeIds.includes("confirmed"));
  assert.ok(nodeIds.includes("create-hash"));
  assert.ok(nodeIds.includes("promote"));
  assert.ok(nodeIds.includes("builder"));
  assert.ok(nodeIds.includes("recompute-hash"));
  assert.ok(nodeIds.includes("hash-verification"));
  assert.ok(nodeIds.includes("done"));

  // Verify all default states are PENDING
  for (const n of g.nodes) {
    assert.equal(n.state, "PENDING");
  }
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
  assert.equal(plannerNode?.artifactId, "audit:sample");

  // JoinNode should reflect completion because all 3 validators completed
  const joinNode = g.nodes.find((n) => n.id === "triple-join");
  assert.equal(joinNode?.state, "COMPLETE");
});

test("Google ADK 2.0 Triple Validation Nested Workflow - JoinNode & Gate Execution", async () => {
  const h = await harness("adk-triple-workflow");
  const runId = "test-adk-triple";
  h.runs.create(runId);

  try {
    const p = prompt(runId);
    const bundle = await h.researcher.run(p, runId);
    const audit = await h.planner.run(bundle, runId);
    const refactoredPlan = await h.refactor.run(bundle, audit);

    const tripleWorkflow = createTripleValidationWorkflow(h.validation, h.contracts);
    const ctx = { runId, jobId: `job:${runId}` };
    const result = await tripleWorkflow.run(ctx, { bundle, plan: refactoredPlan });

    assert.equal(result.all_valid, true);
    assert.equal(result.schema_validation.result, "VALID");
    assert.equal(result.fixture_validation.result, "VALID");
    assert.equal(result.goal_validation.result, "VALID");
  } finally {
    h.bridge.close();
  }
});

test("Google ADK 2.0 Full Workflow Execution - Invariant Proof", async () => {
  const h = await harness("adk-full-workflow");
  const runId = "test-adk-full";
  h.runs.create(runId);

  try {
    const p = prompt(runId);
    const bundle = await h.researcher.run(p, runId);
    const audit = await h.planner.run(bundle, runId);
    const refactoredPlan = await h.refactor.run(bundle, audit);
    const gap = await h.gapper.run(bundle, refactoredPlan);
    const evaluation = await h.evaluator.run(bundle, gap.plan);

    const oneShotWorkflow = createOneShotAdkWorkflow(h.validation, h.contracts);

    const jobContext: JobContext = {
      Job_id: `job:${runId}`,
      Prompt_id: bundle.prompt.prompt_id,
      bundle,
      plan: gap.plan,
      audit,
      gap: gap.gap,
      evaluation,
    };

    const executed = await oneShotWorkflow.run(
      { runId, jobId: `job:${runId}` },
      jobContext,
    );

    assert.equal(executed.all_valid, true);
    assert.ok(executed.confirmed_package);
    assert.ok(executed.created_hash);
    assert.ok(executed.recomputed_hash);
    assert.equal(executed.created_hash, executed.recomputed_hash);
    assert.equal(executed.hash_proof?.equal, true);
  } finally {
    h.bridge.close();
  }
});
