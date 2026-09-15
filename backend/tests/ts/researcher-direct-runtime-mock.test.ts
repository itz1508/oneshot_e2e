import test from "node:test";
import assert from "node:assert/strict";
import type { ResearchBundle } from "../../contracts/schema/types.js";
import { startOpenAICompatibleMockServer } from "../../integration/mock/openai-compatible-mock-server.js";
import { harness, prompt } from "./harness.js";
import { ResearcherWorkflow } from "../../agents/researcher/workflow.js";
import { DirectOpenAIRuntime } from "../../integration/runtime/direct-openai-runtime.js";
import { DEFAULT_ROUTING_POLICY } from "../../integration/core/policy.js";
import type { ResolvedExecutionRoute } from "../../integration/core/route.js";
import type { StructuredResearchDraft } from "../../agents/researcher/structured-draft.js";

/**
 * M10 mock integration: the Researcher workflow runs through the DIRECT
 * OpenAI-compatible runtime against a real loopback mock endpoint (undici-free
 * http client → no libuv crash under --test-force-exit) and produces a
 * canonical ResearchBundle. This is the M10 acceptance gate.
 */
const draft: StructuredResearchDraft = {
  summary: "Direct runtime Researcher vertical slice.",
  requirements: [
    "Complete a Researcher run through the direct OpenAI-compatible runtime",
    "Produce a canonical ResearchBundle via runWithRuntime",
  ],
  dependencies: [{ description: "direct-openai-runtime", required_by: [0] }],
  plan_steps: [
    {
      description: "Invoke the mock endpoint directly and parse the draft",
      responsibility: "ResearchPlan",
      requirement_indexes: [0, 1],
    },
  ],
  success_meaning: "Direct runtime completed a Researcher run through the mock.",
  success_criteria: [
    {
      statement: "ResearchBundle satisfies canonical schemas via the direct runtime",
      measurement: "All canonical schemas valid",
      expected_result: "PASSED",
      requirement_indexes: [0],
    },
  ],
};

function routeFor(baseUrl: string, runId: string): ResolvedExecutionRoute {
  return {
    routeId: `route:direct:${runId}`,
    workflowId: "researcher",
    policy: DEFAULT_ROUTING_POLICY,
    runtimeId: "direct-openai",
    providerId: "openai",
    endpointId: "ep-mock",
    baseUrl,
    modelId: "mock-model-1",
    transport: "openai-chat",
    locality: "loopback",
    capabilities: [
      { capability: "structured-output", state: "verified", source: "probe" },
    ],
    researchMode: "disabled",
    routeReason: "M10 direct runtime mock route",
    rejectedCandidates: [],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

test("Direct runtime completes a Researcher run through the mock endpoint", async () => {
  const srv = await startOpenAICompatibleMockServer(["mock-model-1"], {
    chatContent: JSON.stringify(draft),
  });
  try {
    const h = await harness("researcher-direct-runtime-mock");
    const jobId = "job-direct-mock-001";
    try {
      const researcher = new ResearcherWorkflow(h.contracts);
      const runtime = new DirectOpenAIRuntime({ apiKey: "test-key" });
      const bundle: ResearchBundle = await researcher.runWithRuntime(
        prompt(jobId),
        jobId,
        runtime,
        routeFor(srv.url, jobId),
      );

      assert.ok(bundle, "direct runtime must produce a ResearchBundle");
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
    await srv.close();
  }
});
