import test from "node:test";
import assert from "node:assert/strict";
import { createProviderRegistry } from "../../integration/provider/registry.js";
import { ollamaPreset } from "../../integration/provider/presets/ollama.js";
import { groqPreset } from "../../integration/provider/presets/groq.js";
import { openaiPreset } from "../../integration/provider/presets/openai.js";
import { createCustomProvider } from "../../integration/provider/custom.js";

test("provider registry lists built-in presets (ollama, groq, openai)", () => {
  const r = createProviderRegistry();
  const ids = r
    .list()
    .map((p) => p.providerId)
    .sort();
  assert.deepEqual(ids, ["groq", "ollama", "openai"]);
});

test("provider registry get/has built-ins", () => {
  const r = createProviderRegistry();
  assert.equal(r.has("ollama"), true);
  assert.equal(r.get("ollama")?.transport, "openai-chat");
  assert.equal(r.get("ollama")?.requiresAuth, false);
  assert.equal(r.get("ollama")?.authMethod, "none");
  assert.equal(r.get("groq")?.requiresAuth, true);
  assert.equal(r.has("nope"), false);
  assert.equal(r.get("nope"), undefined);
});

test("provider registry accepts custom entries and rejects duplicate ids", () => {
  const r = createProviderRegistry([ollamaPreset]);
  const custom = createCustomProvider({
    providerId: "my-local",
    displayName: "My Local",
    transport: "openai-chat",
    authMethod: "none",
    requiresAuth: false,
  });
  r.add(custom);
  assert.equal(r.has("my-local"), true);
  assert.equal(r.get("my-local")?.kind, "custom");
  assert.throws(() => r.add(ollamaPreset), /provider already registered: ollama/);
});

test("presets carry no credentials", () => {
  for (const p of [ollamaPreset, groqPreset, openaiPreset]) {
    assert.equal(Object.hasOwn(p, "apiKey"), false);
    assert.equal(Object.hasOwn(p, "apiKeyEnv"), false);
    assert.equal(Object.hasOwn(p, "baseUrl"), false);
  }
});

test("createCustomProvider trims and defaults displayName to the id", () => {
  const p = createCustomProvider({
    providerId: "  custom-1  ",
    transport: "openai-chat",
    authMethod: "api-key",
    requiresAuth: true,
  });
  assert.equal(p.providerId, "custom-1");
  assert.equal(p.displayName, "custom-1");
  assert.equal(p.kind, "custom");
  assert.throws(
    () =>
      createCustomProvider({
        providerId: "   ",
        transport: "openai-chat",
        authMethod: "api-key",
        requiresAuth: true,
      }),
    /non-empty providerId/,
  );
});
