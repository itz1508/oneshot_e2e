import test from "node:test";
import assert from "node:assert/strict";
import type { Audit, ResearchBundle } from "../../contracts/schema/types.js";
import { harness, prompt } from "./harness.js";

test("Researcher output passes directly into native Planner Agent", async () => {
  const h = await harness("planner-workflow");
  const jobId = "job-planner-001";

  try {
    const research: ResearchBundle = await h.researcher.run(prompt(jobId), jobId);
    const audit: Audit = await h.planner.run(research, jobId);

    assert.ok(audit, "Planner produced no output");
    assert.equal(audit.researcher_id, research.researcher.researcher_id);
    assert.equal(audit.plan_id, research.plan.plan_id);
    assert.ok(audit.reviewed_areas.length > 0);

    console.log("RESEARCHER_OUTPUT_JSON=" + JSON.stringify(research));
    console.log("PLANNER_OUTPUT_JSON=" + JSON.stringify(audit));
  } finally {
    h.close();
  }
});
