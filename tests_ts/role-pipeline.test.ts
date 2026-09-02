import test from "node:test";
import assert from "node:assert/strict";
import { harness, prompt } from "./harness.js";

test("canonical runtime executes connected ADK nodes in workflow order", async () => {
  const h = await harness("role-pipeline");
  const runId = "role-pipeline-run";
  h.runs.create(runId);

  try {
    const result = await h.runtime.run(runId, prompt(runId));
    assert.equal(result.result, "PASSED");

    const ordered = [
      "Researcher",
      "Planner",
      "Refactor",
      "GapAnalysis",
      "Evaluation",
      "TripleValidation",
      "Confirmed",
      "CreateHash",
      "Builder",
      "Hash",
      "Done",
    ] as const;

    let previousComplete = -1;
    for (const processor of ordered) {
      const running = result.events.find(
        (event) => event.processor === processor && event.state === "RUNNING",
      );
      const complete = result.events.find(
        (event) => event.processor === processor && event.state === "COMPLETE",
      );
      assert.ok(running, `missing ${processor} RUNNING event`);
      assert.ok(complete, `missing ${processor} COMPLETE event`);
      assert.ok(running.sequence < complete.sequence, `${processor} completed before it ran`);
      assert.ok(running.sequence > previousComplete, `${processor} started out of canonical order`);
      previousComplete = complete.sequence;
    }
  } finally {
    h.close();
  }
});
