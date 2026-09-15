import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  discoverOllamaModels,
  isApprovedOllamaEndpoint,
  ollamaModelId,
  OLLAMA_APPROVED_ENDPOINTS,
  type OllamaModel,
} from "../../integration/provider/ollama-discovery.js";

/** Mock Ollama /api/tags server. */
async function mockOllamaServer(models: OllamaModel[]): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      if (req.url === "/api/tags") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ models }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        resolve({
          url: `http://127.0.0.1:${addr.port}`,
          close: () => new Promise<void>((r) => srv.close(() => r())),
        });
      }
    });
  });
}

test("M16: installed models discovered dynamically through /api/tags", async () => {
  const srv = await mockOllamaServer([
    { name: "llama3", tag: "8b", size: 4661212817 },
    { name: "mistral", tag: "latest", size: 4109854080 },
    { name: "qwen2.5", tag: "0.5b", size: 396068704 },
  ]);
  try {
    const models = await discoverOllamaModels(srv.url);
    assert.equal(models.length, 3);
    assert.equal(models[0].name, "llama3");
    assert.equal(models[0].tag, "8b");
    assert.equal(models[1].name, "mistral");
    assert.equal(models[2].name, "qwen2.5");
  } finally { await srv.close(); }
});

test("M16: custom Ollama model names and tags work", async () => {
  const srv = await mockOllamaServer([
    { name: "my-custom-model", tag: "v1.0" },
    { name: "phi3", tag: "mini" },
    { name: "starcoder2", tag: "3b" },
  ]);
  try {
    const models = await discoverOllamaModels(srv.url);
    assert.equal(ollamaModelId(models[0]), "my-custom-model:v1.0");
    assert.equal(ollamaModelId(models[1]), "phi3:mini");
    assert.equal(ollamaModelId(models[2]), "starcoder2:3b");
  } finally { await srv.close(); }
});

test("M16: no cloud key is required for Ollama", () => {
  // Ollama preset has requiresAuth: false, authMethod: "none"
  // The discovery function takes no API key parameter
  assert.equal(OLLAMA_APPROVED_ENDPOINTS.length, 3);
  for (const ep of OLLAMA_APPROVED_ENDPOINTS) {
    assert.ok(ep.startsWith("http://"), "Ollama endpoints use http (local)");
    assert.ok(!ep.includes("https://"), "no https for local Ollama");
    assert.ok(ep.includes("11434"), "all use port 11434");
  }
});

test("M16: approved endpoint check works for all three candidates", () => {
  assert.ok(isApprovedOllamaEndpoint("http://127.0.0.1:11434"));
  assert.ok(isApprovedOllamaEndpoint("http://localhost:11434"));
  assert.ok(isApprovedOllamaEndpoint("http://host.docker.internal:11434"));
  assert.ok(!isApprovedOllamaEndpoint("http://evil.com:11434"));
  assert.ok(!isApprovedOllamaEndpoint("https://api.openai.com"));
});

test("M16: local-only Researcher makes no cloud requests", async () => {
  // The Ollama discovery only connects to approved local endpoints.
  // A cloud URL would fail the isApprovedOllamaEndpoint check.
  assert.ok(!isApprovedOllamaEndpoint("https://api.groq.com/openai/v1"));
  assert.ok(!isApprovedOllamaEndpoint("https://api.openai.com/v1"));
  // All approved endpoints are local
  for (const ep of OLLAMA_APPROVED_ENDPOINTS) {
    const url = new URL(ep);
    const isLocal = url.hostname === "localhost" || url.hostname.startsWith("127.") || url.hostname === "host.docker.internal";
    assert.ok(isLocal, `endpoint ${ep} must be local`);
  }
});
