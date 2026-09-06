import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ResearchBundle } from "../../contracts/schema/types.js";
import { buildReasoningRequest } from "../../pipeline/processors.js";
import { assertReasoningRequest } from "../../reasoning/python-client.js";

function fixture(): ResearchBundle {
  return JSON.parse(readFileSync("app/fixtures/product/complete-success-seed.json", "utf8"));
}

test("reasoning adapter preserves canonical plan steps and source evidence", () => {
  const bundle = fixture();
  const request = buildReasoningRequest("adapter-test", bundle, bundle.plan);
  assertReasoningRequest(request);
  assert.equal(request.goal, bundle.prompt.requested_outcome);
  assert.ok(request.plan!.tasks.length > 0);
  assert.deepEqual(request.plan!.tasks.map(task => task.id), bundle.plan.steps.map(step => step.step_id));
  assert.deepEqual(request.evidence.map(item => item.content), bundle.researcher.evidence.map(item => item.statement));
});

test("reasoning adapter does not fabricate evidence when none was supplied", () => {
  const bundle = fixture();
  bundle.researcher.evidence = [];
  const request = buildReasoningRequest("no-evidence", bundle, bundle.plan);
  assertReasoningRequest(request);
  assert.deepEqual(request.evidence, []);
});
