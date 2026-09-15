import test from "node:test";
import assert from "node:assert/strict";
import { startOpenAICompatibleMockServer } from "../../integration/mock/openai-compatible-mock-server.js";
import {
  createOpenAICompatibleDiscovery,
  toModelCandidates,
} from "../../integration/model/discovery/openai-compatible-discovery.js";

test("discovery lists models from a mock /models endpoint", async () => {
  const srv = await startOpenAICompatibleMockServer(["llama3.1", "qwen2"]);
  try {
    const d = createOpenAICompatibleDiscovery();
    const models = await d.discoverModels(srv.url);
    assert.deepEqual(
      models.map((m) => m.id),
      ["llama3.1", "qwen2"],
    );
  } finally {
    await srv.close();
  }
});

test("toModelCandidates maps discovered models to provider-scoped candidates", () => {
  const candidates = toModelCandidates(
    [{ id: "a" }, { id: "b" }],
    "ollama",
    "ep-ollama-1",
  );
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].providerId, "ollama");
  assert.equal(candidates[0].endpointId, "ep-ollama-1");
  assert.equal(candidates[0].discovered, true);
  assert.equal(candidates[0].modelId, "a");
});

test("discovery rejects when the endpoint is unreachable", async () => {
  const d = createOpenAICompatibleDiscovery();
  // Port 1 on loopback is privileged and has no listener on a dev machine;
  // connecting yields ECONNREFUSED, so discovery must reject. No mock server
  // lifecycle is needed for this error-path check.
  await assert.rejects(() =>
    d.discoverModels("http://127.0.0.1:1", { timeoutMs: 2000 }),
  );
});
