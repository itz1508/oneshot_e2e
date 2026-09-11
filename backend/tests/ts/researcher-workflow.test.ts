import test from "node:test";
import assert from "node:assert/strict";
import type { ResearchBundle } from "../../contracts/schema/types.js";
import { harness, prompt } from "./harness.js";

test("Researcher Agent executes natively and returns canonical ResearchBundle", async () => {
  const h = await harness("researcher-workflow");
  const jobId = "job-researcher-001";

  try {
    const bundle: ResearchBundle = await h.researcher.run(prompt(jobId), jobId);

    assert.ok(bundle, "Researcher produced no output");
    assert.equal(bundle.prompt.prompt_id, `prompt:${jobId}`);
    assert.equal(bundle.researcher.prompt_id, bundle.prompt.prompt_id);
    assert.equal(bundle.researcher.plan_id, bundle.plan.plan_id);
    assert.equal(bundle.researcher.schema_id, bundle.schema_artifact.schema_id);
    assert.equal(bundle.researcher.fixture_id, bundle.fixture.fixture_id);
    assert.equal(bundle.researcher.goal_id, bundle.goal.goal_id);
    assert.equal(bundle.researcher.validation_id, bundle.validation.validation_id);
    assert.ok(bundle.researcher.evidence.length > 0);
    assert.ok(bundle.researcher.success_definition.success_criteria_ids.length > 0);
  } finally {
    h.close();
  }
});
