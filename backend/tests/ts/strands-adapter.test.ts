import test from "node:test";
import assert from "node:assert/strict";
import { StrandsAdapter } from "../../integration/runtime/strands-adapter.js";
import { buildFakeRoute } from "../../integration/runtime/fake-runtime.js";
import type { StructuredResearchDraft } from "../../agents/researcher/structured-draft.js";

const sampleDraft: StructuredResearchDraft = {
  summary: "Strands adapter draft",
  requirements: ["Preserve canonical traceability via Strands adapter"],
  dependencies: [{ description: "strands-adapter", required_by: [0] }],
  plan_steps: [
    {
      description: "Run research through the Strands adapter",
      responsibility: "ResearchPlan",
      requirement_indexes: [0],
    },
  ],
  success_meaning: "Adapter produced a deterministic draft",
  success_criteria: [
    {
      statement: "Adapter returns a NormalizedResult with the draft",
      measurement: "structured draft present",
      expected_result: "PASSED",
      requirement_indexes: [0],
    },
  ],
};

function fakeAdapter(): StrandsAdapter {
  return new StrandsAdapter({
    projectRoot: process.cwd(),
    createModel: () => ({ modelId: "fake" }) as never,
    createAgent: () =>
      ({ runResearch: async () => sampleDraft }) as never,
  });
}

test("StrandsAdapter consumes a route and returns a NormalizedResult echoing route identity", async () => {
  const adapter = fakeAdapter();
  const route = buildFakeRoute("strands-1");
  const result = await adapter.invoke({ route, promptText: "p" });
  assert.equal(result.routeId, "fake-route:strands-1");
  assert.equal(result.workflowId, "researcher");
  assert.equal(result.finishReason, "stop");
  assert.equal((result.structured as StructuredResearchDraft).summary, "Strands adapter draft");
  assert.equal(result.content, JSON.stringify(sampleDraft));
});

test("StrandsAdapter runtimeId is 'strands'", () => {
  assert.equal(fakeAdapter().runtimeId, "strands");
});

test("StrandsAdapter carries no credentials in its result", async () => {
  const result = await fakeAdapter().invoke({
    route: buildFakeRoute("r"),
    promptText: "p",
  });
  assert.equal(Object.hasOwn(result, "apiKey"), false);
  assert.equal(Object.hasOwn(result, "credential"), false);
});
