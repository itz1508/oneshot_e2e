import test from "node:test";
import assert from "node:assert/strict";
import { startOpenAICompatibleMockServer } from "../../integration/mock/openai-compatible-mock-server.js";
import { createStructuredOutputProbe } from "../../integration/capability/structured-output-probe.js";
import { createToolUseProbe } from "../../integration/capability/tool-use-probe.js";
import { createCapabilityRegistry } from "../../integration/capability/registry.js";
import { createRuntimeCompatibilityResolver } from "../../integration/routing/runtime-compatibility.js";

/**
 * M6 mock integration: probe an approved mock endpoint for both capabilities,
 * record evidence, and confirm runtime compatibility resolves from evidence
 * + transport. No external calls (loopback mock).
 */
test("probe + registry + compatibility: verified evidence drives a compatible runtime", async () => {
  const srv = await startOpenAICompatibleMockServer(["m1"], {
    chatContent: '{"ok": true}',
    toolCalls: [
      {
        id: "call_1",
        type: "function",
        function: { name: "get_weather", arguments: '{"city":"Tokyo"}' },
      },
    ],
  });
  try {
    const reg = createCapabilityRegistry();
    const target = {
      endpointId: "ep1",
      modelId: "m1",
      baseUrl: srv.url,
    };

    const so = await createStructuredOutputProbe().probe(target);
    const tu = await createToolUseProbe().probe(target);
    reg.record(target.endpointId, target.modelId, so);
    reg.record(target.endpointId, target.modelId, tu);

    assert.equal(reg.get("ep1", "m1", "structured-output")?.state, "verified");
    assert.equal(reg.get("ep1", "m1", "tool-use")?.state, "verified");

    const compat = createRuntimeCompatibilityResolver().resolve({
      runtime: {
        runtimeId: "strands",
        displayName: "Strands",
        supportedTransports: ["openai-chat"],
      },
      transport: "openai-chat",
      capabilities: [...reg.listForModel("ep1", "m1")],
      required: ["tool-use", "structured-output"],
    });
    assert.equal(compat.compatible, true);
    assert.equal(compat.reasons.length, 0);
  } finally {
    await srv.close();
  }
});
