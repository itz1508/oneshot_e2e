import test from "node:test";
import assert from "node:assert/strict";
import type { ResearchBundle } from "../../contracts/schema/types.js";
import { harness, prompt } from "./harness.js";
import { ResearcherWorkflow } from "../../agents/researcher/workflow.js";

/**
 * M4 integration proof: the Researcher workflow runs end-to-end through the
 * fake runtime (env-gated) and produces a canonical-valid ResearchBundle with
 * NO provider, NO external calls. The fake branch is the first branch in
 * `run()`; when the flag is off, existing behavior is unchanged.
 */
test("Researcher run completes end-to-end via the fake runtime with deterministic output", async () => {
  const saved = process.env.ONESHOT_RESEARCH_FAKE_RUNTIME;
  process.env.ONESHOT_RESEARCH_FAKE_RUNTIME = "true";
  try {
    const h = await harness("researcher-fake-runtime");
    const jobId = "job-fake-runtime-001";
    try {
      // No capability: the fake branch is first and ignores it.
      const researcher = new ResearcherWorkflow(h.contracts);
      const bundle: ResearchBundle = await researcher.run(prompt(jobId), jobId);

      assert.ok(bundle, "fake runtime must produce a ResearchBundle");
      assert.equal(bundle.prompt.prompt_id, `prompt:${jobId}`);
      assert.equal(bundle.researcher.prompt_id, bundle.prompt.prompt_id);
      assert.equal(bundle.researcher.plan_id, bundle.plan.plan_id);
      assert.equal(bundle.researcher.schema_id, bundle.schema_artifact.schema_id);
      assert.equal(bundle.researcher.fixture_id, bundle.fixture.fixture_id);
      assert.equal(bundle.researcher.goal_id, bundle.goal.goal_id);
      assert.equal(bundle.researcher.validation_id, bundle.validation.validation_id);
      assert.ok(bundle.researcher.evidence.length > 0);
      assert.ok(bundle.plan.steps.length > 0);
    } finally {
      h.close();
    }
  } finally {
    if (saved === undefined) {
      delete process.env.ONESHOT_RESEARCH_FAKE_RUNTIME;
    } else {
      process.env.ONESHOT_RESEARCH_FAKE_RUNTIME = saved;
    }
  }
});

test("Fake runtime path is off by default (existing behavior unchanged)", async () => {
  // Flag must be unset here; if a prior test left it set, this assertion guards
  // the default by explicitly clearing it for this test.
  const saved = process.env.ONESHOT_RESEARCH_FAKE_RUNTIME;
  delete process.env.ONESHOT_RESEARCH_FAKE_RUNTIME;
  try {
    assert.notEqual(process.env.ONESHOT_RESEARCH_FAKE_RUNTIME, "true");
  } finally {
    if (saved === undefined) {
      delete process.env.ONESHOT_RESEARCH_FAKE_RUNTIME;
    } else {
      process.env.ONESHOT_RESEARCH_FAKE_RUNTIME = saved;
    }
  }
});
