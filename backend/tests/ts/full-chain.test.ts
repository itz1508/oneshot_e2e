import test from "node:test";
import assert from "node:assert/strict";
import { harness, prompt } from "./harness.js";

test("full canonical ADK chain reaches DONE through Builder and sandbox integrity proof", async () => {
  const h = await harness("full-chain");
  const runId = "test-full-chain";
  h.runs.create(runId);

  try {
    const result = await h.runtime.run(runId, prompt(runId));
    assert.equal(result.test_result, "Passed");
    assert.equal(result.hash_proof?.equal, true);

    const complete = new Map(
      result.events
        .filter((event) => event.execution_status === "Completed")
        .map((event) => [event.processor, event.test_result]),
    );

    for (const processor of [
      "Researcher",
      "Planner",
      "Refactor",
      "GapAnalysis",
      "Evaluation",
      "SchemaValidation",
      "FixtureValidation",
      "GoalValidation",
      "TripleValidation",
      "Confirmed",
      "CreateHash",
      "Builder",
      "Hash",
      "Done",
    ]) {
      assert.ok(complete.has(processor), `missing ${processor}`);
    }

    assert.equal(complete.get("SchemaValidation"), "Passed");
    assert.equal(complete.get("FixtureValidation"), "Passed");
    assert.equal(complete.get("GoalValidation"), "Passed");
    assert.equal(complete.get("TripleValidation"), "Passed");
    assert.equal(complete.get("Builder"), "Passed");
    assert.equal(complete.get("Hash"), "Passed");
    assert.equal(complete.get("Done"), "Passed");

    const audit = await h.store.load<any>(runId, "audit");
    const evaluation = await h.store.load<any>(runId, "evaluation");
    const validation = await h.store.load<any>(runId, "validation");
    const schema = await h.store.load<any>(runId, "schema");
    const builder = await h.store.load<any>(runId, "builder-result");
    const confirmedHash = await h.store.load<any>(runId, "confirmed-hash");

    assert.equal(audit.reviewed_areas.length, 11);
    assert.equal(evaluation.evidence.length, 9);
    assert.equal(schema.target, "plan");
    assert.equal(validation.schema_validation.plan_id, validation.plan_id);
    assert.equal(validation.fixture_validation.plan_id, validation.plan_id);
    assert.equal(validation.goal_validation.plan_id, validation.plan_id);
    assert.equal(builder.result, "Passed");
    assert.equal(builder.hash_sandbox, confirmedHash.hash);
    assert.equal(result.hash_proof?.created_hash, confirmedHash.hash);
    assert.equal(result.hash_proof?.recomputed_hash, builder.hash_sandbox);
    assert.equal(h.contracts.definitions().length, 12);
  } finally {
    h.close();
  }
});
