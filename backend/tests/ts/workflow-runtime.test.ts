import test from "node:test";
import assert from "node:assert/strict";
import { harness, prompt } from "./harness.js";

test("full OneShot workflow executes through native pipeline/runtime", async () => {
  const h = await harness("workflow-runtime");
  const jobId = "job-workflow-runtime-001";
  h.runs.create(jobId);
  try {
    const result = await h.runtime.run(jobId, prompt(jobId));

    assert.ok(result, "Native workflow produced no terminal output");
    assert.equal(result.test_result, "Passed");
    assert.equal(result.pipeline_status, "Done");
    assert.equal(result.hash_proof?.equal, true);
    assert.ok(result.hash_proof?.created_hash);
    assert.equal(result.hash_proof?.created_hash, result.hash_proof?.recomputed_hash);
    console.log("WORKFLOW_OUTPUT_JSON=" + JSON.stringify(result));
  } finally {
    h.close();
  }
});
