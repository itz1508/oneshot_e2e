import test from "node:test";
import assert from "node:assert/strict";
import type { Audit, GapAnalysis, Plan, ResearchBundle } from "../../contracts/schema/types.js";
import { harness, prompt } from "./harness.js";

test("Refactor output passes to native Gap Analysis until fresh gap_0", async () => {
  const h = await harness("gap-analysis-workflow");
  const jobId = "job-gap-001";

  try {
    const research: ResearchBundle = await h.researcher.run(prompt(jobId), jobId);

    research.plan.steps[0].goal_refs = [];
    const audit: Audit = await h.planner.run(research, jobId);
    const refactored: Plan = await h.refactor.run(research, audit);

    // Leave one real missing traceability edge for Gap Analysis itself.
    refactored.steps[0].schema_refs = [];

    const gapResult = await h.gapper.run(research, refactored);
    const gapPlan: Plan = gapResult.plan;
    const gap: GapAnalysis = gapResult.gap;

    assert.equal(gap.result, "Passed");
    assert.equal(gap.gap_0, true);
    assert.equal(gapPlan.plan_id, refactored.plan_id);
    assert.ok(gap.resolved_gaps.length >= 1);
    assert.ok(gapPlan.steps[0].schema_refs.includes(research.schema_artifact.schema_id));
    console.log("GAP_OUTPUT_JSON=" + JSON.stringify(gap));
    console.log("GAP_PLAN_JSON=" + JSON.stringify(gapPlan));
  } finally {
    h.close();
  }
});
