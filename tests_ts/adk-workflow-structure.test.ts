import test from "node:test";
import assert from "node:assert/strict";
import { LoopAgent, ParallelAgent, SequentialAgent } from "@google/adk";
import { createOneShotRootAgent } from "../backend/workflow/adk/root-agent.js";
import { harness } from "./harness.js";

function children(agent: unknown): any[] {
  return ((agent as any).subAgents ?? []) as any[];
}

function child(agent: unknown, name: string): any {
  const found = children(agent).find((candidate) => candidate.name === name);
  assert.ok(found, `missing ADK agent ${name}`);
  return found;
}

test("canonical execution tree is real SequentialAgent + LoopAgent + ParallelAgent", async () => {
  const h = await harness("adk-structure");
  try {
    const root = createOneShotRootAgent({
      researcher: h.researcher,
      planner: h.planner,
      refactor: h.refactor,
      gapper: h.gapper,
      evaluator: h.evaluator,
      triple: h.triple,
      confirmation: h.confirmation,
      hash: h.hash,
      builder: h.builder,
      effects: {
        event() {},
        async save() {
          return "test-artifact";
        },
        finishPassed() {},
        finishRoot() {},
      },
    });

    assert.ok(root instanceof SequentialAgent);
    assert.equal(root.name, "OneShotCanonicalWorkflow");

    const gap = child(root, "GapAnalysisWorkflow");
    assert.ok(gap instanceof SequentialAgent);
    const gapLoop = child(gap, "GapAnalysisLoop");
    assert.ok(gapLoop instanceof LoopAgent);
    assert.deepEqual(
      children(gapLoop).map((agent) => agent.name),
      ["GapCheck", "GapFix", "GapRecheck"],
    );

    const triple = child(root, "TripleValidationWorkflow");
    assert.ok(triple instanceof SequentialAgent);
    assert.deepEqual(
      children(triple).map((agent) => agent.name),
      [
        "TripleValidationAdmission",
        "TripleValidationParallel",
        "TripleValidationGate",
      ],
    );

    const parallel = child(triple, "TripleValidationParallel");
    assert.ok(parallel instanceof ParallelAgent);
    assert.deepEqual(
      children(parallel).map((agent) => agent.name),
      [
        "SchemaValidationAgent",
        "FixtureValidationAgent",
        "GoalValidationAgent",
      ],
    );
  } finally {
    h.close();
  }
});
