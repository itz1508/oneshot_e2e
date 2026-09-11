import test from "node:test";
import assert from "node:assert/strict";
import type { Audit, Plan, ResearchBundle } from "../../contracts/schema/types.js";
import { clone } from "../../core/clone.js";
import { harness, prompt } from "./harness.js";

test("Planner Audit passes directly into native Refactor Agent", async () => {
  const h = await harness("refactor-workflow");
  const jobId = "job-refactor-001";

  try {
    const researchResult = await h.researcher.run(prompt(jobId), jobId);
    const research = clone(researchResult);

    // Give Planner one real, deterministic traceability gap so Refactor must work.
    research.plan.steps[0].goal_refs = [];

    const audit: Audit = await h.planner.run(research, jobId);
    const plan: Plan = await h.refactor.run(research, audit);

    assert.ok(audit.findings.length > 0, "Planner did not identify the injected gap");
    assert.equal(plan.plan_id, audit.plan_id);
    assert.ok(plan.steps[0].goal_refs.length > 0, "Refactor did not restore goal traceability");
    assert.equal(plan.revision, 2);
    assert.ok(plan.revision_evidence.length > 0);

    console.log("PLANNER_OUTPUT_JSON=" + JSON.stringify(audit));
    console.log("REFACTOR_OUTPUT_JSON=" + JSON.stringify(plan));
  } finally {
    h.close();
  }
});
