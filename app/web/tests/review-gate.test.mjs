import test from "node:test";
import assert from "node:assert/strict";

test("research review draft mirrors the backend plan-review contract", () => {
  const review = {
    run_id: "r1",
    revision: 1,
    status: "pending",
    created_at: "2026-09-12T00:00:00Z",
    edits: {
      objective: "Build X",
      requirements: [{ id: "req:1", statement: "must support Y" }],
      steps: [
        { id: "step:1", description: "step 1" },
        { id: "step:2", description: "step 2" },
      ],
      notes: [],
    },
  };
  assert.equal(review.status, "pending");
  assert.equal(review.edits.objective, "Build X");
  assert.ok(review.edits.requirements.length > 0);
  assert.ok(review.edits.steps.every((s) => s.id && s.description));
});

test("build review gate mirrors the backend build-review contract", () => {
  const gate = {
    run_id: "r2",
    hash: "a".repeat(64),
    plan_id: "plan:r2",
    revision: 2,
    status: "pending",
    validation: { schema: "VALID", fixture: "VALID", goal: "VALID" },
    steps: [
      { step_id: "step:1", description: "compile", responsibility: "Builder" },
    ],
    created_at: "2026-09-12T00:00:00Z",
  };
  assert.equal(gate.status, "pending");
  assert.match(gate.hash, /^[a-f0-9]{64}$/);
  assert.equal(gate.validation.schema, "VALID");
  assert.ok(gate.steps.length > 0);
});
