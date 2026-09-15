import test from "node:test";
import assert from "node:assert/strict";
import { createEndpointRegistry } from "../../integration/endpoint/registry.js";

function ollamaEp() {
  return {
    endpointId: "ep-ollama-1",
    providerId: "ollama",
    baseUrl: "http://localhost:11434",
    authMethod: "none" as const,
    locality: "loopback" as const,
    origin: "preset" as const,
    allowedHeaders: [],
  };
}

test("endpoint registry stores definitions separately from health", () => {
  const r = createEndpointRegistry();
  r.add(ollamaEp());
  assert.equal(r.get("ep-ollama-1")?.baseUrl, "http://localhost:11434");
  // health starts undefined
  assert.equal(r.getHealth("ep-ollama-1"), undefined);
  r.setHealth("ep-ollama-1", {
    endpointId: "ep-ollama-1",
    reachable: true,
    latencyMs: 5,
  });
  assert.equal(r.getHealth("ep-ollama-1")?.reachable, true);
  // definition is unaffected by health
  assert.equal(r.get("ep-ollama-1")?.baseUrl, "http://localhost:11434");
  assert.equal(Object.hasOwn(r.get("ep-ollama-1")!, "reachable"), false);
});

test("endpoint registry rejects duplicate ids", () => {
  const r = createEndpointRegistry();
  r.add(ollamaEp());
  assert.throws(() => r.add(ollamaEp()), /endpoint already registered/);
});

test("endpoint registry remove clears both definition and health", () => {
  const r = createEndpointRegistry();
  r.add(ollamaEp());
  r.setHealth("ep-ollama-1", { endpointId: "ep-ollama-1", reachable: true });
  r.remove("ep-ollama-1");
  assert.equal(r.get("ep-ollama-1"), undefined);
  assert.equal(r.getHealth("ep-ollama-1"), undefined);
  assert.equal(r.list().length, 0);
});
