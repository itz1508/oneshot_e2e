import test from "node:test";
import assert from "node:assert/strict";
import type { ResearchBundle } from "../../contracts/schema/types.js";
import { harness, prompt } from "./harness.js";
import { ResearcherWorkflow } from "../../agents/researcher/workflow.js";
import { StrandsAdapter } from "../../integration/runtime/strands-adapter.js";
import { buildFakeRoute } from "../../integration/runtime/fake-runtime.js";
import type { StructuredResearchDraft } from "../../agents/researcher/structured-draft.js";

/**
 * M9 mock integration: the Researcher workflow runs through the Strands
 * adapter (agent/model factories injected so no real Strands SDK or network is
 * used) and produces a canonical ResearchBundle equivalent to the existing
 * Strands path (same contracts, evidence classes, validation, transitions).
 */
const sampleDraft: StructuredResearchDraft = {
  summary: "Researcher Strands adapter vertical slice.",
  requirements: [
    "Preserve canonical workflow traceability through the Strands adapter",
    "Produce a deterministic structured draft via the adapter",
  ],
  dependencies: [
    { description: "strands-adapter", required_by: [0] },
  ],
  plan_steps: [
    {
      description: "Run research through the resolved-route Strands adapter",
      responsibility: "ResearchPlan",
      requirement_indexes: [0, 1],
    },
  ],
  success_meaning: "Adapter-produced bundle passes canonical validation.",
  success_criteria: [
    {
      statement: "ResearchBundle satisfies canonical schemas via the adapter",
      measurement: "All canonical schemas valid",
      expected_result: "PASSED",
      requirement_indexes: [0],
    },
  ],
};

test("Researcher workflow runs through the Strands adapter and produces an equivalent ResearchBundle", async () => {
  const h = await harness("researcher-strands-mock");
  const jobId = "job-strands-mock-001";
  try {
    const researcher = new ResearcherWorkflow(h.contracts);
    const adapter = new StrandsAdapter({
      projectRoot: process.cwd(),
      createModel: () => ({ modelId: "fake" }) as never,
      createAgent: () =>
        ({ runResearch: async () => sampleDraft }) as never,
    });
    const route = buildFakeRoute(jobId);
    const bundle: ResearchBundle = await researcher.runWithRuntime(
      prompt(jobId),
      jobId,
      adapter,
      route,
    );

    assert.ok(bundle, "Strands adapter must produce a ResearchBundle");
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
});
