import test from "node:test";
import assert from "node:assert/strict";
import { startOpenAICompatibleMockServer } from "../../integration/mock/openai-compatible-mock-server.js";
import { DirectOpenAIRuntime } from "../../integration/runtime/direct-openai-runtime.js";
import { buildFakeRoute } from "../../integration/runtime/fake-runtime.js";
import type { StructuredResearchDraft } from "../../agents/researcher/structured-draft.js";

const draft: StructuredResearchDraft = {
  summary: "Direct runtime draft",
  requirements: ["Run a Researcher run via the direct OpenAI-compatible runtime"],
  dependencies: [],
  plan_steps: [
    {
      description: "Invoke the endpoint directly via the OpenAI-compatible client",
      responsibility: "ResearchPlan",
      requirement_indexes: [0],
    },
  ],
  success_meaning: "Direct runtime returned a structured draft",
  success_criteria: [
    {
      statement: "NormalizedResult carries the draft",
      measurement: "structured present",
      expected_result: "PASSED",
      requirement_indexes: [0],
    },
  ],
};

test("DirectOpenAIRuntime invokes the mock endpoint and parses a structured draft", async () => {
  const srv = await startOpenAICompatibleMockServer(["m1"], {
    chatContent: JSON.stringify(draft),
  });
  try {
    const rt = new DirectOpenAIRuntime({ apiKey: "test-key" });
    const route = { ...buildFakeRoute("direct-1"), baseUrl: srv.url };
    const result = await rt.invoke({ route, promptText: "research", systemPrompt: "sys" });
    assert.equal(result.routeId, "fake-route:direct-1");
    assert.equal(result.workflowId, "researcher");
    assert.equal(result.finishReason, "stop");
    assert.equal((result.structured as StructuredResearchDraft).summary, "Direct runtime draft");
  } finally {
    await srv.close();
  }
});

test("DirectOpenAIRuntime leaves structured undefined when the model returns non-JSON", async () => {
  const srv = await startOpenAICompatibleMockServer(["m1"], { chatContent: "not json" });
  try {
    const rt = new DirectOpenAIRuntime();
    const result = await rt.invoke({
      route: { ...buildFakeRoute("direct-2"), baseUrl: srv.url },
      promptText: "p",
    });
    assert.equal(result.structured, undefined);
    assert.equal(result.content, "not json");
  } finally {
    await srv.close();
  }
});

test("DirectOpenAIRuntime is named 'direct-openai' and carries no credentials in its result", async () => {
  const srv = await startOpenAICompatibleMockServer(["m1"], {
    chatContent: JSON.stringify(draft),
  });
  try {
    const rt = new DirectOpenAIRuntime({ apiKey: "secret-key" });
    assert.equal(rt.runtimeId, "direct-openai");
    // The direct runtime actually calls the endpoint, so point at the mock.
    const result = await rt.invoke({
      route: { ...buildFakeRoute("d"), baseUrl: srv.url },
      promptText: "p",
    });
    assert.equal(Object.hasOwn(result, "apiKey"), false);
    assert.equal(Object.hasOwn(result, "credential"), false);
  } finally {
    await srv.close();
  }
});
