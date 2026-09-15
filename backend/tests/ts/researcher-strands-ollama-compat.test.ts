import test from "node:test";
import assert from "node:assert/strict";
import { startOpenAICompatibleMockServer } from "../../integration/mock/openai-compatible-mock-server.js";
import {
  createOpenAICompatibleDiscovery,
  toModelCandidates,
} from "../../integration/model/discovery/openai-compatible-discovery.js";
import { createStrandsOpenAIModel } from "../../integration/runtime/strands-openai-model.js";
import { StrandsAdapter } from "../../integration/runtime/strands-adapter.js";
import { DEFAULT_ROUTING_POLICY } from "../../integration/core/policy.js";
import type { ResolvedExecutionRoute } from "../../integration/core/route.js";
import type { StructuredResearchDraft } from "../../agents/researcher/structured-draft.js";

/**
 * M9 Ollama-compat: an Ollama-style OpenAI-compatible endpoint is discovered,
 * a Strands OpenAIModel is built from the resulting route (NOT invoked — the
 * agent factory is injected so no real Strands SDK / undici call occurs), and
 * the Strands adapter returns a NormalizedResult. Proves the Strands adapter
 * consumes an Ollama-compatible resolved route.
 */
const sampleDraft: StructuredResearchDraft = {
  summary: "Ollama-compat Strands adapter draft",
  requirements: ["Route an Ollama-compatible endpoint through the Strands adapter"],
  dependencies: [],
  plan_steps: [
    {
      description: "Discover and route an Ollama-compatible model",
      responsibility: "ResearchPlan",
      requirement_indexes: [0],
    },
  ],
  success_meaning: "Adapter consumed the Ollama-compat route",
  success_criteria: [
    {
      statement: "NormalizedResult carries the discovered model",
      measurement: "structured draft present",
      expected_result: "PASSED",
      requirement_indexes: [0],
    },
  ],
};

function buildRoute(baseUrl: string, modelId: string): ResolvedExecutionRoute {
  return {
    routeId: `route:ollama-compat:${modelId}`,
    workflowId: "researcher",
    policy: DEFAULT_ROUTING_POLICY,
    runtimeId: "strands",
    providerId: "ollama",
    endpointId: "ep-ollama",
    baseUrl,
    modelId,
    transport: "openai-chat",
    locality: "loopback",
    capabilities: [
      { capability: "tool-use", state: "verified", source: "probe" },
      { capability: "structured-output", state: "verified", source: "probe" },
    ],
    researchMode: "disabled",
    routeReason: "Ollama-compat mock route",
    rejectedCandidates: [],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

test("Strands adapter consumes an Ollama-compatible discovered route (no real network invocation)", async () => {
  const srv = await startOpenAICompatibleMockServer(["llama3.1"]);
  try {
    const discovered = await createOpenAICompatibleDiscovery().discoverModels(srv.url);
    assert.deepEqual(
      discovered.map((m) => m.id),
      ["llama3.1"],
    );
    const route = buildRoute(srv.url, discovered[0].id);

    // Build a real Strands OpenAIModel from the route (construction only; not invoked).
    const model = createStrandsOpenAIModel(route, "test-key");
    assert.equal(model.modelId, "llama3.1");

    // Adapter with an injected agent factory — no real Strands SDK / undici call.
    const adapter = new StrandsAdapter({
      projectRoot: process.cwd(),
      apiKey: "test-key",
      createModel: () => model,
      createAgent: () =>
        ({ runResearch: async () => sampleDraft }) as never,
    });
    const result = await adapter.invoke({ route, promptText: "research" });
    assert.equal(result.routeId, "route:ollama-compat:llama3.1");
    assert.equal((result.structured as StructuredResearchDraft).summary, "Ollama-compat Strands adapter draft");
    assert.equal(toModelCandidates(discovered, "ollama", "ep-ollama")[0].modelId, "llama3.1");
  } finally {
    await srv.close();
  }
});
