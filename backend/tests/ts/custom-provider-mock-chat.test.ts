import test from "node:test";
import assert from "node:assert/strict";
import { startOpenAICompatibleMockServer } from "../../integration/mock/openai-compatible-mock-server.js";
import { createOpenAICompatibleCustomProvider } from "../../integration/provider/custom.js";
import { createProviderRegistry } from "../../integration/provider/registry.js";
import { createEndpointRegistry } from "../../integration/endpoint/registry.js";
import { createModelRegistry } from "../../integration/model/registry.js";
import {
  createOpenAICompatibleDiscovery,
  toModelCandidates,
} from "../../integration/model/discovery/openai-compatible-discovery.js";
import { createOpenAICompatibleClient } from "../../integration/transport/openai-compatible-client.js";

/**
 * M5 acceptance proof: a custom OpenAI-compatible provider discovers models
 * from a mock `/models` endpoint, selects one, and completes a chat
 * invocation through the mock — all on loopback, no external calls.
 */
test("custom provider discovers models and completes a chat invocation through the mock endpoint", async () => {
  const srv = await startOpenAICompatibleMockServer([
    "mock-model-1",
    "mock-model-2",
  ]);
  try {
    const { provider, endpoint } = createOpenAICompatibleCustomProvider({
      providerId: "my-custom",
      baseUrl: srv.url,
      requiresAuth: false,
    });

    // The custom provider bundle must not carry credentials.
    assert.equal(Object.hasOwn(provider, "apiKey"), false);
    assert.equal(Object.hasOwn(endpoint, "apiKey"), false);

    const providers = createProviderRegistry([provider]);
    const endpoints = createEndpointRegistry();
    endpoints.add(endpoint);
    const models = createModelRegistry();

    // 1. Discover models from the endpoint's base URL.
    const discovery = createOpenAICompatibleDiscovery();
    const ep = endpoints.get(endpoint.endpointId);
    assert.ok(ep);
    const discovered = await discovery.discoverModels(ep.baseUrl);
    for (const c of toModelCandidates(
      discovered,
      provider.providerId,
      endpoint.endpointId,
    )) {
      models.add(c);
    }

    assert.equal(providers.has("my-custom"), true);
    assert.equal(models.listForProvider("my-custom").length, 2);

    // 2. Select one model (provider-scoped identity).
    const selected = models.get("my-custom", "mock-model-1");
    assert.ok(selected);

    // 3. Chat invocation through the mock endpoint via the transport client.
    const client = createOpenAICompatibleClient();
    const result = await client.chat({
      baseUrl: ep.baseUrl,
      modelId: selected.modelId,
      messages: [{ role: "user", content: "hello" }],
    });
    assert.ok(result.content.length > 0);
    assert.equal(result.finishReason, "stop");
  } finally {
    await srv.close();
  }
});
