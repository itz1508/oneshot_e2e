import test from "node:test";
import assert from "node:assert/strict";
import {
  ConversationMemoryManager,
  getConversationMemoryManager,
  generateStructuredOutput,
  ModelClientCache,
  classifyModelError,
  ModelErrorCode,
} from "../src/index.ts";

test("OneShot Agent Runtime — Multi-Turn Conversation Memory", async (t) => {
  await t.test("preserves system prompt while pruning oldest turn messages", () => {
    const memory = new ConversationMemoryManager({ maxTurns: 3, preserveSystemMessages: true });
    const sessionId = "sess-window-test";

    memory.addMessage(sessionId, { role: "system", content: "System instructions" });
    memory.addMessage(sessionId, { role: "user", content: "Turn 1" });
    memory.addMessage(sessionId, { role: "assistant", content: "Response 1" });
    memory.addMessage(sessionId, { role: "user", content: "Turn 2" });
    memory.addMessage(sessionId, { role: "assistant", content: "Response 2" });

    const messages = memory.getMessages(sessionId);
    // Should preserve system message and retain the latest turns within maxTurns
    assert.equal(messages[0].role, "system");
    assert.equal(messages[0].content, "System instructions");
    assert.ok(messages.length <= 3);
    assert.equal(messages[messages.length - 1].content, "Response 2");
  });

  await t.test("estimates token counts accurately based on content length", () => {
    const memory = new ConversationMemoryManager();
    const sessionId = "sess-token-est";
    memory.addMessage(sessionId, { role: "user", content: "Hello world from OneShot!" }); // 26 chars
    const tokens = memory.estimateTokenCount(sessionId);
    assert.ok(tokens > 0 && tokens <= 10);
  });

  await t.test("exports and imports session messages cleanly", () => {
    const memory = new ConversationMemoryManager();
    const sessionId = "sess-export-import";
    memory.addMessage(sessionId, { role: "user", content: "Test msg" });
    const exported = memory.exportSession(sessionId);
    assert.equal(exported.length, 1);

    const memory2 = new ConversationMemoryManager();
    memory2.importSession("sess-imported", exported);
    assert.equal(memory2.getMessages("sess-imported").length, 1);
    assert.equal(memory2.getMessages("sess-imported")[0].content, "Test msg");
  });
});

test("OneShot Agent Runtime — Structured Output Generation", async (t) => {
  await t.test("generates structured output using strict json_schema response_format", async () => {
    const mockClient = {
      chat: {
        completions: {
          create: async (params) => {
            assert.equal(params.response_format?.type, "json_schema");
            assert.equal(params.response_format?.json_schema?.name, "ResearchPlan");
            assert.equal(params.response_format?.json_schema?.strict, true);
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      title: "Refactor Plan",
                      steps: ["audit", "refactor", "verify"],
                      priority: "high",
                    }),
                  },
                },
              ],
              usage: {
                prompt_tokens: 15,
                completion_tokens: 25,
                total_tokens: 40,
              },
            };
          },
        },
      },
    };

    const mockModel = { _client: mockClient, _config: { modelId: "gpt-4o-mini" } };

    const result = await generateStructuredOutput({
      model: mockModel,
      schema: {
        name: "ResearchPlan",
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            steps: { type: "array", items: { type: "string" } },
            priority: { type: "string" },
          },
          required: ["title", "steps", "priority"],
        },
      },
      prompt: "Generate a refactor plan",
    });

    assert.equal(result.data.title, "Refactor Plan");
    assert.deepEqual(result.data.steps, ["audit", "refactor", "verify"]);
    assert.equal(result.usage?.totalTokens, 40);
  });

  await t.test("falls back to json_object when json_schema is unsupported", async () => {
    let callCount = 0;
    const mockClient = {
      chat: {
        completions: {
          create: async (params) => {
            callCount++;
            if (params.response_format?.type === "json_schema") {
              throw new Error("400 json_schema response_format is not supported by this model endpoint");
            }
            assert.equal(params.response_format?.type, "json_object");
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({ status: "success", retries: 0 }),
                  },
                },
              ],
            };
          },
        },
      },
    };

    const mockModel = { _client: mockClient };
    const result = await generateStructuredOutput({
      model: mockModel,
      schema: {
        name: "FallbackTest",
        schema: { type: "object", properties: { status: { type: "string" } } },
      },
      prompt: "Provide status",
    });

    assert.equal(callCount, 2);
    assert.equal(result.data.status, "success");
  });
});

test("OneShot Agent Runtime — Model Client Cache & Error Classification", async (t) => {
  await t.test("ModelClientCache reuses cached clients for identical credentials", () => {
    const cache = new ModelClientCache();
    const c1 = cache.getOrCreate("openai", "gpt-4o", "sk-test", "https://api.openai.com/v1");
    const c2 = cache.getOrCreate("openai", "gpt-4o", "sk-test", "https://api.openai.com/v1");
    assert.strictEqual(c1, c2, "Same parameters must return identical cached instance");
    assert.equal(cache.size, 1);
  });

  await t.test("classifies 429 rate limit errors as retry eligible", () => {
    const classified = classifyModelError({ status: 429, message: "Rate limit exceeded" }, "openai");
    assert.equal(classified.code, ModelErrorCode.RATE_LIMITED);
    assert.equal(classified.retryEligible, true);
    assert.equal(classified.httpStatus, 429);
  });

  await t.test("classifies 401 auth errors as permanent and non-retryable", () => {
    const classified = classifyModelError({ status: 401, message: "Incorrect API key provided" }, "mistral");
    assert.equal(classified.code, ModelErrorCode.AUTH_FAILED);
    assert.equal(classified.retryEligible, false);
    assert.equal(classified.httpStatus, 401);
  });
});
