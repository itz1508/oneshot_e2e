import test from "node:test";
import assert from "node:assert/strict";
import { startOpenAICompatibleMockServer } from "../../integration/mock/openai-compatible-mock-server.js";
import { createStructuredOutputProbe } from "../../integration/capability/structured-output-probe.js";

test("structured-output probe returns 'verified' when the model returns valid JSON", async () => {
  const srv = await startOpenAICompatibleMockServer(["m1"], {
    chatContent: '{"ok": true}',
  });
  try {
    const probe = createStructuredOutputProbe();
    const e = await probe.probe({
      endpointId: "ep1",
      modelId: "m1",
      baseUrl: srv.url,
    });
    assert.equal(e.capability, "structured-output");
    assert.equal(e.state, "verified");
    assert.equal(e.source, "probe");
    assert.equal(e.failureReason, undefined);
  } finally {
    await srv.close();
  }
});

test("structured-output probe returns 'verified' for fenced ```json blocks", async () => {
  const srv = await startOpenAICompatibleMockServer(["m1"], {
    chatContent: "```json\n{\"ok\": true}\n```",
  });
  try {
    const probe = createStructuredOutputProbe();
    const e = await probe.probe({
      endpointId: "ep1",
      modelId: "m1",
      baseUrl: srv.url,
    });
    assert.equal(e.state, "verified");
  } finally {
    await srv.close();
  }
});

test("structured-output probe returns 'failed' when the model returns non-JSON", async () => {
  const srv = await startOpenAICompatibleMockServer(["m1"], {
    chatContent: "not json",
  });
  try {
    const probe = createStructuredOutputProbe();
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
