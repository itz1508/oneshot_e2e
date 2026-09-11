import test from "node:test";
import assert from "node:assert/strict";
import type { Evaluation, GapAnalysis, Plan, ResearchBundle, TripleValidation } from "../../contracts/schema/types.js";
import { validationFeedback } from "../../agents/gap-analysis/tool/validation-feedback.js";
import { harness, prompt } from "./harness.js";

test("NOT_VALID becomes Gap feedback, improves same plan, and all three validators re-prove", async () => {
  const h = await harness("validation-refinement-loop");
  const jobId = "job-refinement-001";

  try {
    const research: ResearchBundle = await h.researcher.run(prompt(jobId), jobId);

    const initialGap: { plan: Plan; gap: GapAnalysis } = await h.gapper.run(
      research,
      research.plan,
    );
    assert.equal(initialGap.gap.gap_0, true);

    const initialEvaluation: Evaluation = await h.evaluator.run(
      research,
      initialGap.plan,
    );
    assert.equal(initialEvaluation.result, "Passed");

    // Simulate a condition that escaped the preceding gap_0 proof. Triple
    // Validation must treat this as refinement feedback, not terminal failure.
    const missedPlan = structuredClone(initialGap.plan);
    missedPlan.steps[0].goal_refs = [];

    const before: TripleValidation = await h.triple.run(research, missedPlan);
    assert.equal(before.goal_validation.result, "Failed");
    assert.equal(before.all_valid, false);

    const feedback = validationFeedback(research, missedPlan, before);
    assert.equal(feedback.unresolved.length, 0);
    assert.ok(feedback.findings.length > 0);

    const beforeRevision = missedPlan.revision;
    const refined: { plan: Plan; gap: GapAnalysis } = await h.gapper.run(
      research,
      missedPlan,
      feedback.findings,
    );

    assert.equal(refined.plan.plan_id, missedPlan.plan_id);
    assert.ok(refined.plan.revision > beforeRevision);
    assert.equal(refined.gap.gap_0, true);
    assert.ok(refined.plan.steps[0].goal_refs.includes(research.goal.success_criteria[0].criterion_id));

    const evaluation: Evaluation = await h.evaluator.run(research, refined.plan);
    assert.equal(evaluation.result, "Passed");

    const after: TripleValidation = await h.triple.run(research, refined.plan);
    assert.equal(after.schema_validation.result, "Passed");
    assert.equal(after.fixture_validation.result, "Passed");
    assert.equal(after.goal_validation.result, "Passed");
    assert.equal(after.all_valid, true);

    console.log("VALIDATION_BEFORE_JSON=" + JSON.stringify(before));
    console.log("IMPROVED_PLAN_JSON=" + JSON.stringify(refined.plan));
    console.log("VALIDATION_AFTER_JSON=" + JSON.stringify(after));
  } finally {
    h.close();
  }
});
