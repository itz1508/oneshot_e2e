import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowRootCauseError } from "../backend/core/root-cause-error.js";
import { harness, prompt } from "./harness.js";

test("canonical workflow activates each Role before the Role enters RUNNING", async () => {
  const h = await harness("role-pipeline");
  const runId = "role-pipeline-run";
  h.runs.create(runId);

  assert.throws(
    () => h.pipeline.require(runId, "Researcher"),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowRootCauseError);
      assert.equal(error.rootCause.issue, "Attempted to execute an inactive Role");
      return true;
    },
  );

  try {
    const result = await h.runtime.run(runId, prompt(runId));
    assert.equal(result.result, "PASSED");

    for (const role of [
      "Researcher",
      "Planner",
      "Refactor",
      "GapAnalysis",
      "Evaluation",
      "Builder",
    ] as const) {
      const binding = result.events.find(
        (event) =>
          event.processor === `RoleBinding:${role}` &&
          event.state === "COMPLETE" &&
          event.result === "PASSED",
      );
      const running = result.events.find(
        (event) => event.processor === role && event.state === "RUNNING",
      );
      assert.ok(binding, `missing ${role} activation proof`);
      assert.ok(running, `missing ${role} RUNNING event`);
      assert.ok(
        binding.sequence < running.sequence,
        `${role} ran before activation completed`,
      );
    }

    assert.equal(h.pipeline.isActive(runId, "Researcher"), false);
    assert.equal(h.pipeline.isActive(runId, "Builder"), false);
  } finally {
    h.close();
  }
});
