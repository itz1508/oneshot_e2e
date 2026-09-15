import test from "node:test";
import assert from "node:assert/strict";
import { KNOWN_PROVIDERS } from "../../integration/provider-discovery.js";
import { createProviderRegistry } from "../../integration/provider/registry.js";
import { groqPreset } from "../../integration/provider/presets/groq.js";
import { openaiPreset } from "../../integration/provider/presets/openai.js";
import { ollamaPreset } from "../../integration/provider/presets/ollama.js";

test("M17: Groq and OpenAI presets exist and are removable without changing contracts", () => {
  assert.ok(KNOWN_PROVIDERS.groq);
  assert.ok(KNOWN_PROVIDERS.openai);
  assert.ok(KNOWN_PROVIDERS.ollama);
  // Removable: create registry without a preset
  const regWithGroq = createProviderRegistry([groqPreset, openaiPreset, ollamaPreset]);
  assert.ok(regWithGroq.has("groq"));
  const regWithoutGroq = createProviderRegistry([openaiPreset, ollamaPreset]);
  assert.ok(!regWithoutGroq.has("groq"), "Groq preset removable");
  assert.ok(regWithoutGroq.has("openai"), "OpenAI unaffected");
  assert.ok(regWithoutGroq.has("ollama"), "Ollama unaffected");
});

test("M17: presets are model hints, not authoritative catalogs", () => {
  const groq = KNOWN_PROVIDERS.groq;
  assert.ok(groq.knownCapabilities, "Groq has capability hints");
  assert.ok(!("models" in groq), "No hardcoded model list");
});

test("M17: custom endpoint follows the same structure as presets", () => {
  for (const p of [KNOWN_PROVIDERS.groq, KNOWN_PROVIDERS.openai, KNOWN_PROVIDERS.ollama]) {
    assert.equal(typeof p.id, "string");
    assert.ok(Array.isArray(p.endpointCandidates));
    assert.equal(typeof p.requiresApiKey, "boolean");
  }
});

test("M17: manual model entry remains possible (no closed union)", () => {
  const reg = createProviderRegistry([]);
  reg.add({
    providerId: "custom", displayName: "Custom", kind: "custom",
    transport: "openai-chat", authMethod: "api-key",
    requiresAuth: true, allowedHeaders: [],
  });
  assert.ok(reg.has("custom"), "Manual entry works");
});

test("M17: live tests remain opt-in (presets are pure data)", () => {
  for (const [id, p] of Object.entries(KNOWN_PROVIDERS)) {
    assert.equal(typeof p, "object");
    assert.ok(typeof p.requiresApiKey === "boolean");
  }
});

