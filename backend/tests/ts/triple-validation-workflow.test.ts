import test from "node:test";
import assert from "node:assert/strict";
import type { ResearchBundle, TripleValidation } from "../../contracts/schema/types.js";
import { harness, prompt } from "./harness.js";

test("Schema Fixture Goal validators run in parallel and return NOT_VALID as refinement signal", async () => {
  const h = await harness("triple-validation-workflow");
  const jobId = "job-triple-001";

  try {
    const research: ResearchBundle = await h.researcher.run(prompt(jobId), jobId);

    const valid: TripleValidation = await h.triple.run(research, research.plan);

    const incompletePlan = structuredClone(research.plan);
    incompletePlan.steps[0].goal_refs = [];
    const notValid: TripleValidation = await h.triple.run(research, incompletePlan);

    assert.equal(valid.schema_validation.result, "Passed");
    assert.equal(valid.fixture_validation.result, "Passed");
    assert.equal(valid.goal_validation.result, "Passed");
    assert.equal(valid.all_valid, true);

    assert.equal(notValid.schema_validation.result, "Passed");
    assert.equal(notValid.fixture_validation.result, "Passed");
    assert.equal(notValid.goal_validation.result, "Failed");
    assert.equal(notValid.all_valid, false);
    console.log("TRIPLE_VALID_JSON=" + JSON.stringify(valid));
    console.log("TRIPLE_REFINEMENT_SIGNAL_JSON=" + JSON.stringify(notValid));
  } finally {
    h.close();
  }
});
