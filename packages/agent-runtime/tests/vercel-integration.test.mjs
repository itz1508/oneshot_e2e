import test from "node:test";
import assert from "node:assert/strict";
import {
  isVercelLanguageModel,
  resolveVercelModel,
  createStrandsAgent,
  streamStrandsToAgUi,
} from "../src/index.ts";

test("Vercel AI SDK Integration — Model Specification & Detection", async (t) => {
  await t.test("isVercelLanguageModel accurately identifies compliant language models", () => {
    // Compliant LanguageModelV1 / V3
    const validModelV1 = {
      specificationVersion: "v1",
      provider: "google.generative-ai",
      modelId: "gemini-2.5-flash",
      doGenerate: async () => {},
      doStream: async () => {},
    };
    assert.equal(isVercelLanguageModel(validModelV1), true);

    const validModelV3 = {
      specificationVersion: "v3",
      provider: "openai.chat",
      modelId: "gpt-4o",
      doGenerate: async () => {},
      doStream: async () => {},
    };
    assert.equal(isVercelLanguageModel(validModelV3), true);

    // Non-compliant or arbitrary objects
    assert.equal(isVercelLanguageModel(null), false);
    assert.equal(isVercelLanguageModel({}), false);
    assert.equal(isVercelLanguageModel({ modelId: "test" }), false);
    assert.equal(isVercelLanguageModel("string-model"), false);
  });

  await t.test("resolveVercelModel validates input and handles provider resolution", async () => {
    // 1. Validates that null provider rejects immediately
    await assert.rejects(
      async () => {
        await resolveVercelModel(null);
      },
      /A Vercel AI SDK LanguageModel provider instance is required/
    );

    // 2. Either resolves VercelModel or gives descriptive peer dependency diagnostic
    const mockProvider = {
      specificationVersion: "v1",
      provider: "google.generative-ai",
      modelId: "gemini-2.5-flash",
      doGenerate: async () => {},
      doStream: async () => {},
    };

    try {
      const model = await resolveVercelModel(mockProvider, { temperature: 0.7 });
      assert.ok(model, "Model resolved when dependency is present");
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.ok(
        err.message.includes("@ai-sdk/provider") ||
          err.message.includes("VercelModel integration requires optional peer dependency"),
        `Expected error message to mention @ai-sdk/provider, got: ${err.message}`
      );
    }
  });

  await t.test("createStrandsAgent accepts vercelModel option seamlessly", () => {
    const mockModel = {
      modelId: "mock-vercel-gemini",
      provider: "google.generative-ai",
      invoke: async () => ({ text: "Response from mock Vercel provider" }),
      stream: async function* () {
        yield { type: "data", data: "Vercel stream chunk" };
      },
    };

    const agent = createStrandsAgent({
      vercelModel: mockModel,
      initialAppState: {
        restorePoint: "RES-VERCEL-TEST",
      },
    });

    assert.ok(agent);
    assert.equal(agent.appState.get("restorePoint"), "RES-VERCEL-TEST");
    assert.equal(agent.appState.get("workflowStage"), "research");
  });

  await t.test("Route Handler streaming pattern with cancelSignal & AG-UI SSE protocol", async () => {
    // Simulates Next.js / Node.js route handler:
    // export async function POST(req: Request)
    const mockAgent = {
      stream: async function* (prompt, options) {
        if (options?.cancelSignal?.aborted) return;
        yield { type: "data", data: `Processed prompt: "${prompt}" via Vercel provider` };
      },
    };

    const abortController = new AbortController();

    const events = [];
    for await (const event of streamStrandsToAgUi({
      agent: mockAgent,
      prompt: "Build workflow step",
      signal: abortController.signal,
    })) {
      events.push(event);
    }

    assert.equal(events[0].type, "RUN_START");
    assert.equal(events[1].type, "TEXT_MESSAGE_DELTA");
    assert.ok(events[1].delta.includes("Build workflow step"));
    assert.equal(events[events.length - 1].type, "RUN_FINISH");
    assert.equal(events[events.length - 1].status, "COMPLETED");
  });
});
