import test from "node:test";
import assert from "node:assert/strict";
import { createModelRegistry } from "../../integration/model/registry.js";

test("model registry identity is provider-scoped: same modelId under different providers coexists", () => {
  const r = createModelRegistry();
  r.add({
    modelId: "llama3.1",
    providerId: "ollama",
    endpointId: "ep1",
    displayName: "Llama 3.1",
    discovered: true,
  });
  r.add({
    modelId: "llama3.1",
    providerId: "groq",
    endpointId: "ep2",
    displayName: "Llama 3.1 70B",
    discovered: true,
  });
  assert.equal(r.list().length, 2);
  assert.equal(r.get("ollama", "llama3.1")?.endpointId, "ep1");
  assert.equal(r.get("groq", "llama3.1")?.endpointId, "ep2");
  assert.equal(r.get("openai", "llama3.1"), undefined);
});

test("model registry listForProvider and listForEndpoint", () => {
  const r = createModelRegistry();
  r.add({
    modelId: "a",
    providerId: "ollama",
    endpointId: "ep1",
    displayName: "A",
    discovered: true,
  });
  r.add({
    modelId: "b",
    providerId: "ollama",
    endpointId: "ep2",
    displayName: "B",
    discovered: true,
  });
  r.add({
    modelId: "c",
    providerId: "groq",
    endpointId: "ep3",
    displayName: "C",
    discovered: true,
  });
  assert.equal(r.listForProvider("ollama").length, 2);
  assert.equal(r.listForEndpoint("ep2").length, 1);
  assert.equal(r.listForEndpoint("ep2")[0].modelId, "b");
});

test("model registry remove is provider-scoped", () => {
  const r = createModelRegistry();
  r.add({
    modelId: "x",
    providerId: "ollama",
    endpointId: "ep1",
    displayName: "X",
    discovered: false,
  });
  r.add({
    modelId: "x",
    providerId: "groq",
    endpointId: "ep2",
    displayName: "X",
    discovered: true,
  });
  r.remove("ollama", "x");
  assert.equal(r.get("ollama", "x"), undefined);
  assert.equal(r.get("groq", "x")?.endpointId, "ep2");
  assert.equal(r.list().length, 1);
});
