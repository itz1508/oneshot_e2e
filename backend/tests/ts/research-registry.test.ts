import test from "node:test";
import assert from "node:assert/strict";
import { createResearchRegistry } from "../../integration/research/registry.js";
import { tavilyResearchProvider } from "../../integration/research/tavily-adapter.js";

test("research registry lists the Tavily preset", () => {
  const r = createResearchRegistry([tavilyResearchProvider]);
  assert.equal(r.list().length, 1);
  assert.equal(r.get("tavily")?.requiresAuth, true);
  assert.equal(r.has("tavily"), true);
});

test("research registry disable supports local-only mode (M12)", () => {
  const r = createResearchRegistry([tavilyResearchProvider]);
  r.disable("tavily");
  assert.equal(r.get("tavily"), undefined);
  assert.equal(r.has("tavily"), false);
  assert.equal(r.list().length, 0);
});

test("research registry accepts custom research providers", () => {
  const r = createResearchRegistry();
  r.add({
    providerId: "future-research",
    displayName: "Future",
    requiresAuth: false,
  });
  assert.equal(r.get("future-research")?.requiresAuth, false);
  assert.equal(r.list().length, 1);
});

test("tavily descriptor carries no credentials", () => {
  assert.equal(Object.hasOwn(tavilyResearchProvider, "apiKey"), false);
  assert.equal(Object.hasOwn(tavilyResearchProvider, "apiKeyEnv"), false);
});
