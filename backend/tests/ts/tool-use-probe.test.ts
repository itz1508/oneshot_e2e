import test from "node:test";
import assert from "node:assert/strict";
import { startOpenAICompatibleMockServer } from "../../integration/mock/openai-compatible-mock-server.js";
import { createToolUseProbe } from "../../integration/capability/tool-use-probe.js";

const A_TOOL_CALL = [
  {
    id: "call_1",
    type: "function" as const,
    function: { name: "get_weather", arguments: '{"city":"Tokyo"}' },
  },
];

test("tool-use probe returns 'verified' when the model emits tool_calls", async () => {
  const srv = await startOpenAICompatibleMockServer(["m1"], {
    toolCalls: A_TOOL_CALL,
  });
  try {
    const probe = createToolUseProbe();
    const e = await probe.probe({
      endpointId: "ep1",
      modelId: "m1",
      baseUrl: srv.url,
    });
    assert.equal(e.capability, "tool-use");
    assert.equal(e.state, "verified");
    assert.equal(e.source, "probe");
  } finally {
    await srv.close();
  }
});

test("tool-use probe returns 'failed' when the model emits no tool_calls", async () => {
  const srv = await startOpenAICompatibleMockServer(["m1"], {
    chatContent: "I cannot use tools",
  });
  try {
    const probe = createToolUseProbe();
    const e = await probe.probe({
      endpointId: "ep1",
      modelId: "m1",
      baseUrl: srv.url,
    });
    assert.equal(e.state, "failed");
    assert.ok(e.failureReason);
  } finally {
    await srv.close();
  }
});
