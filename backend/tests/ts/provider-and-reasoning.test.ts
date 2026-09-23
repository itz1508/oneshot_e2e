/**
 * OneShot Multi-Provider & Python Reasoning Engine Integration Tests
 *
 * Enforces:
 * - Response Verification Invariant (No Bare 'Passed'): Inspects actual JSON payload fields.
 * - Multi-provider registry containing prebuilt Mistral & Ollama presets.
 * - Provider status inspection and session provider configuration.
 * - Standalone Python reasoning engine execution.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startAgentServer } from "../../index.js";
import { executePythonReasoning } from "../../python-runtime.js";
import { MODEL_PRESETS } from "../../../packages/agent-runtime/src/index.js";

describe("Multi-Provider Registry & Prebuilt Presets", () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    // Start server on dynamic port
    server = await startAgentServer({ port: 0, host: "127.0.0.1" });
    const addr = server.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("exports MODEL_PRESETS with prebuilt defaults for Mistral, Gemini, OpenAI, Nebius, and Ollama", () => {
    assert.ok(MODEL_PRESETS.mistral, "Mistral preset must exist");
    assert.strictEqual(MODEL_PRESETS.mistral.baseUrl, "https://api.mistral.ai/v1");
    assert.strictEqual(MODEL_PRESETS.mistral.defaultModel, "mistral-large-latest");
    assert.ok(MODEL_PRESETS.mistral.models.includes("mistral-large-latest"));

    assert.ok(MODEL_PRESETS.ollama, "Ollama preset must exist");
    assert.strictEqual(MODEL_PRESETS.ollama.baseUrl, "http://localhost:11434/v1");
    assert.strictEqual(MODEL_PRESETS.ollama.defaultModel, "llama3.2");
  });

  it("verifies /api/integration/providers response payload contains Mistral and Ollama presets", async () => {
    const res = await fetch(`${baseUrl}/api/integration/providers`);
    assert.strictEqual(res.status, 200, "Expected status 200");
    assert.strictEqual(res.headers.get("content-type"), "application/json");

    const data = await res.json();
    assert.ok(data.auth, "Response must include auth registry");
    assert.ok(data.models, "Response must include models registry");

    // Assert Mistral preset
    assert.ok(data.auth.mistral, "Auth registry must contain mistral");
    assert.strictEqual(data.auth.mistral.id, "mistral");
    assert.ok(data.models.mistral, "Models registry must contain mistral");
    assert.ok(data.models.mistral.models.includes("mistral-large-latest"));
    assert.ok(data.models.mistral.models.includes("codestral-latest"));

    // Assert Ollama preset
    assert.ok(data.models.ollama, "Models registry must contain ollama");
    assert.ok(data.models.ollama.models.includes("llama3.2"));
  });

  it("verifies /api/providers/status response payload reports configured Mistral preset", async () => {
    const res = await fetch(`${baseUrl}/api/providers/status`);
    assert.strictEqual(res.status, 200, "Expected status 200");

    const data = await res.json();
    assert.ok(data.mistral, "Provider status must contain mistral");
    assert.strictEqual(data.mistral.configured, true, "Mistral must be configured via app/env/.env");
    assert.strictEqual(data.mistral.model, "mistral-large-latest");
    assert.strictEqual(data.mistral.endpoint, "https://api.mistral.ai/v1");

    assert.ok(data.ollama, "Provider status must contain ollama");
    assert.strictEqual(data.ollama.endpoint, "http://localhost:11434/v1");
  });

  it("verifies /api/config/provider configures session with Mistral preset", async () => {
    const res = await fetch(`${baseUrl}/api/config/provider`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": "test-session-mistral",
      },
      body: JSON.stringify({
        provider: "mistral",
        model: "mistral-large-latest",
      }),
    });

    assert.strictEqual(res.status, 200, "Expected status 200");
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.provider, "mistral");
    assert.strictEqual(data.model, "mistral-large-latest");
  });

  it("executes Python reasoning engine and validates response payload contracts", async () => {
    const pyResp = await executePythonReasoning({
      runId: "run_test_integration",
      prompt: "Validate deterministic schema contracts and runtime boundaries",
      task: "evaluation",
      constraints: ["enforce response verification invariant"],
    });

    // Deep assertion of response fields
    assert.ok(pyResp, "Python reasoner must return response");
    assert.strictEqual(pyResp.run_id, "run_test_integration");
    assert.strictEqual(pyResp.task, "evaluation");
    assert.strictEqual(pyResp.success, true);
    assert.ok(pyResp.confidence >= 0.8, `Confidence must be high: ${pyResp.confidence}`);
    assert.ok(Array.isArray(pyResp.analysis), "Analysis must be an array");
    assert.ok(pyResp.analysis.length > 0, "Analysis must contain reasoning steps");
    assert.ok(Array.isArray(pyResp.findings), "Findings must be an array");
    assert.ok(pyResp.findings.some((f) => f.code === "EVAL-200"));
    assert.strictEqual(typeof pyResp.recommendation, "string");
    assert.ok(pyResp.recommendation.length > 0);
  });
});
