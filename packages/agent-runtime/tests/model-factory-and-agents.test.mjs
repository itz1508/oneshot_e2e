import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createLiveModel,
  createMainAgent,
  createResearcherAgent,
  runResearcherWorkflow,
  TavilySearchBackend,
} from "../src/index.ts";

describe("OneShot Model Factory & Explicit Injection", () => {
  it("fails fast when credentials are unconfigured in production instead of faking MockModel", () => {
    const origGemini = process.env.GEMINI_API_KEY;
    const origOpenai = process.env.OPENAI_API_KEY;
    const origMistral = process.env.MISTRAL_API_KEY;
    const origToken = process.env.ONESHOT_API_TOKEN;

    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.ONESHOT_API_TOKEN;

    try {
      assert.throws(() => {
        createLiveModel({});
      }, /Missing provider credentials/);
    } finally {
      if (origGemini) process.env.GEMINI_API_KEY = origGemini;
      if (origOpenai) process.env.OPENAI_API_KEY = origOpenai;
      if (origMistral) process.env.MISTRAL_API_KEY = origMistral;
      if (origToken) process.env.ONESHOT_API_TOKEN = origToken;
    }
  });

  it("constructs live OpenAIModel when apiKey is provided", () => {
    const model = createLiveModel({ apiKey: "test-gemini-key-123", modelId: "gemini-2.5-flash" });
    assert.ok(model);
    assert.strictEqual(typeof model, "object");
  });

  it("constructs prebuilt Mistral preset with test key and default mistral-large-latest model", () => {
    const model = createLiveModel({ provider: "mistral", apiKey: "vck_test_mistral_key_789" });
    assert.ok(model);
    assert.strictEqual(typeof model, "object");
    assert.strictEqual(model.modelId, "mistral-large-latest");
    assert.strictEqual(model._client?.baseURL, "https://api.mistral.ai/v1");
  });

  it("constructs prebuilt Ollama preset without requiring an API key", () => {
    const model = createLiveModel({ provider: "ollama" });
    assert.ok(model);
    assert.strictEqual(typeof model, "object");
    assert.strictEqual(model.modelId, "llama3.2");
    assert.strictEqual(model._client?.baseURL, "http://localhost:11434/v1");
  });

  it("accepts caller-injected model instance directly without modification", () => {
    const dummyInjected = { custom: "test-model-double", id: "model-double-001" };
    const resolved = createLiveModel({ model: dummyInjected });
    assert.strictEqual(resolved, dummyInjected);
  });
});

describe("OneShot Main Agent & Researcher Agent Construction", () => {
  it("constructs Main Agent with explicit injected model and workflow tools", () => {
    const testModelDouble = { id: "main-model-double" };
    const agent = createMainAgent({ model: testModelDouble });

    assert.ok(agent);
    assert.strictEqual(agent.model, testModelDouble);
    assert.ok(agent.tool);
    // Verifies workflow tools are registered
    assert.ok((agent.tool).workflow_transition);
    assert.ok((agent.tool).workflow_gate_status);
    assert.ok((agent.tool).workflow_set_state);
  });

  it("constructs Researcher Agent with explicit injected model and research tools", () => {
    const testModelDouble = { id: "researcher-model-double" };
    const agent = createResearcherAgent({ model: testModelDouble });

    assert.ok(agent);
    assert.strictEqual(agent.model, testModelDouble);
    assert.ok(agent.tool);
    assert.ok((agent.tool).tavily_search);
    assert.ok((agent.tool).workflow_gate_status);
  });

  it("executes canonical Researcher workflow with verified findings", async () => {
    const searchBackend = new TavilySearchBackend();
    const result = await runResearcherWorkflow({
      query: "OneShot deterministic verification",
      searchBackend,
      deterministicFixture: true,
    });

    assert.ok(result);
    assert.strictEqual(result.query, "OneShot deterministic verification");
    assert.ok(result.summary);
    assert.ok(result.citationsMarkdown.includes("[1]"));
    assert.strictEqual(result.verified, true);
  });
});
