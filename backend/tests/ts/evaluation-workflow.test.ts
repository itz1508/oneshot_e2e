import test from "node:test";
import assert from "node:assert/strict";
import type { Audit, Evaluation, GapAnalysis, Plan, ResearchBundle } from "../../contracts/schema/types.js";
import { harness, prompt } from "./harness.js";

test("gap_0 Plan passes directly into native Evaluation Agent", async () => {
  const h = await harness("evaluation-workflow");
  const jobId = "job-evaluation-001";

  try {
    const research: ResearchBundle = await h.researcher.run(prompt(jobId), jobId);
    const audit: Audit = await h.planner.run(research, jobId);
    const refactored: Plan = await h.refactor.run(research, audit);

    refactored.steps[0].schema_refs = [];
    const gapOutput: { plan: Plan; gap: GapAnalysis } = await h.gapper.run(
      research,
      refactored,
    );

    assert.equal(gapOutput.gap.gap_0, true);
    const evaluation: Evaluation = await h.evaluator.run(research, gapOutput.plan);

    assert.ok(evaluation, "Evaluation produced no output");
    assert.equal(evaluation.plan_id, gapOutput.plan.plan_id);
    assert.equal(evaluation.result, "Passed");
    assert.ok(evaluation.evidence.length > 0);
    console.log("EVALUATION_OUTPUT_JSON=" + JSON.stringify(evaluation));
  } finally {
    h.close();
  }
});
