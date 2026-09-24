/**
 * OneShot Action API v2 Integration & Deep Verification Tests
 *
 * Enforces:
 * - Response Verification Invariant (No Bare 'Passed'): Inspects actual JSON payload fields.
 * - Uniform POST /api/v2/{operation} dispatcher (Taskade Action API pattern).
 * - Deep assertions on status, body schema, and payload equality.
 * - SecurityWorker header injection via typed client.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startAgentServer } from "../../index.js";

describe("Action API v2 Unified RPC Dispatcher", () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    server = await startAgentServer({ port: 0, host: "127.0.0.1" });
    const addr = server.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("POST /api/v2/getStatus returns authoritative engine state and provider registry", async () => {
    const res = await fetch(`${baseUrl}/api/v2/getStatus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.strictEqual(res.status, 200, "Expected status 200");
    assert.strictEqual(res.headers.get("content-type"), "application/json");

    const data = await res.json();
    assert.strictEqual(data.ok, true, "Expected ok: true");
    assert.strictEqual(data.status, "healthy", "Expected status: healthy");
    assert.strictEqual(typeof data.currentStage, "string", "Expected currentStage string");
    assert.ok(data.gate1, "gate1 must exist");
    assert.strictEqual(typeof data.gate1.status, "string");
    assert.ok(data.gate2, "gate2 must exist");
    assert.strictEqual(typeof data.gate2.status, "string");
    assert.ok(data.providers, "providers registry must exist");
    assert.ok(data.providers.models, "models registry must exist in providers");
    assert.ok(data.providers.models.mistral, "mistral must be in provider models registry");
    assert.ok(data.providers.models.mistral.models.includes("mistral-large-latest"), "mistral models must include mistral-large-latest");
    assert.ok(data.providers.auth.mistral, "mistral must be in provider auth registry");
    assert.strictEqual(typeof data.activeSessions, "number");
  });

  it("POST /api/v2/promptAgent invokes Python reasoning engine and returns structured response", async () => {
    const res = await fetch(`${baseUrl}/api/v2/promptAgent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Analyze architectural invariants for OneShot Action API",
        task: "critic",
        constraints: ["Must not fabricate progress", "Must verify response payloads"],
      }),
    });

    assert.strictEqual(res.status, 200, "Expected status 200");
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.operation, "promptAgent");
    assert.ok(data.runId.startsWith("run_act_"));
    assert.ok(data.response, "Expected response payload from Python reasoning");
    assert.strictEqual(data.response.success, true);
    assert.strictEqual(data.response.task, "critic");
    assert.ok(data.response.confidence >= 0.9);
    assert.ok(Array.isArray(data.response.analysis));
    assert.ok(data.response.analysis.length > 0);
    assert.strictEqual(data.response.recommendation, "Proceed with the proposed plan.");

    // Assert findings contract
    assert.ok(Array.isArray(data.response.findings));
    assert.strictEqual(data.response.findings[0].code, "CRITIC-001");
    assert.strictEqual(data.response.findings[0].severity, "info");
  });

  it("POST /api/v2/promptAgent rejects request when prompt is missing", async () => {
    const res = await fetch(`${baseUrl}/api/v2/promptAgent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.strictEqual(res.status, 400, "Expected status 400");
    const data = await res.json();
    assert.strictEqual(data.error, "prompt is required");
  });

  it("POST /api/v2/executeTool executes validate_fixtures with deep byte/hash equality verification", async () => {
    const testHash = "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069";
    const res = await fetch(`${baseUrl}/api/v2/executeTool`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toolName: "validate_fixtures",
        input: {
          fixture_id: "fix-action-api-01",
          path: "app/fixtures/sample.json",
          expectedHash: testHash,
        },
      }),
    });

    assert.strictEqual(res.status, 200, "Expected status 200");
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.operation, "executeTool");
    assert.strictEqual(data.toolName, "validate_fixtures");
    assert.ok(data.result, "Result payload must exist");
    assert.strictEqual(data.result.success, true);
    assert.strictEqual(data.result.fixture_id, "fix-action-api-01");
    assert.strictEqual(data.result.status, "validated");
    assert.strictEqual(data.result.actualHash, testHash);
    assert.strictEqual(data.result.expectedHash, testHash);
  });

  it("POST /api/v2/executeTool executes workflow_gate_status and returns gate inspection", async () => {
    const res = await fetch(`${baseUrl}/api/v2/executeTool`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toolName: "workflow_gate_status",
      }),
    });

    assert.strictEqual(res.status, 200, "Expected status 200");
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.operation, "executeTool");
    assert.strictEqual(data.toolName, "workflow_gate_status");
    assert.ok(data.result.workflowStage);
    assert.ok(data.result.gate1Status);
    assert.ok(data.result.gate2Status);
  });

  it("POST /api/v2/executeTool returns 400 for unknown tool", async () => {
    const res = await fetch(`${baseUrl}/api/v2/executeTool`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toolName: "unregistered_tool_xyz",
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, "Unsupported tool action: unregistered_tool_xyz");
  });

  it("POST /api/v2/configureProvider configures credentials and returns confirmation payload", async () => {
    const res = await fetch(`${baseUrl}/api/v2/configureProvider`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": "sess_act_cfg_1",
      },
      body: JSON.stringify({
        provider: "mistral",
        apiKey: "mstrl_test_action_key_12345",
        model: "codestral-latest",
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.configured, true);
    assert.strictEqual(data.provider, "mistral");
    assert.strictEqual(data.model, "codestral-latest");
  });

  it("POST /api/v2/switchProvider switches active session provider preset", async () => {
    const res = await fetch(`${baseUrl}/api/v2/switchProvider`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": "sess_act_switch_1",
      },
      body: JSON.stringify({
        provider: "ollama",
        model: "llama3.2",
        baseUrl: "http://localhost:11434/v1",
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.sessionId, "sess_act_switch_1");
    assert.strictEqual(data.provider, "ollama");
    assert.strictEqual(data.model, "llama3.2");
  });

  it("POST /api/v2/switchProvider returns 400 on invalid provider", async () => {
    const res = await fetch(`${baseUrl}/api/v2/switchProvider`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "invalid_ai_provider",
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes("Invalid provider"));
  });

  it("POST /api/v2/validateFixtures verifies standalone fixture validation", async () => {
    const testHash = "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069";
    const res = await fetch(`${baseUrl}/api/v2/validateFixtures`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fixture_id: "fix-standalone-v2",
        path: "app/fixtures/sample.json",
        expectedHash: testHash,
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.operation, "validateFixtures");
    assert.strictEqual(data.fixture_id, "fix-standalone-v2");
    assert.strictEqual(data.status, "validated");
    assert.strictEqual(data.actualHash, testHash);
    assert.strictEqual(data.expectedHash, testHash);
  });

  it("POST /api/v2/exportBundle exports portable workspace bundle with manifest and workflow gates", async () => {
    const res = await fetch(`${baseUrl}/api/v2/exportBundle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.operation, "exportBundle");
    assert.ok(data.item, "item must exist in export bundle");
    assert.strictEqual(data.item.version, "1.3.0");
    assert.strictEqual(data.item.name, "OneShot E2E Bundle");
    assert.ok(data.item.exportedAt);
    assert.ok(data.item.manifest);
    assert.ok(data.item.workflow);
    assert.strictEqual(typeof data.item.workflow.currentStage, "string");
    assert.ok(data.item.workflow.gate1);
    assert.ok(data.item.workflow.gate2);
    assert.ok(data.item.items);
  });

  it("POST /api/v2/importBundle restores bundle state and reports imported resource counts", async () => {
    const sampleBundle = {
      version: "1.3.0",
      manifest: { version: "1.3.0", files: 817 },
      workflow: {
        currentStage: "research",
        gate1: { status: "pending" },
      },
      items: {
        checkpoints: [{ id: "chk_1", title: "Test Checkpoint" }],
        todos: [{ id: "todo_1", title: "Test Todo" }],
      },
    };

    const res = await fetch(`${baseUrl}/api/v2/importBundle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": "sess_bundle_import",
      },
      body: JSON.stringify({ bundleData: sampleBundle }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.operation, "importBundle");
    assert.strictEqual(data.item.id, "sess_bundle_import");
    assert.strictEqual(data.item.restoredStage, "research");
    assert.strictEqual(data.item.checkpointCount, 1);
    assert.strictEqual(data.item.todoCount, 1);
    assert.strictEqual(data.item.manifestVersion, "1.3.0");
  });

  it("POST /api/v2/{unknown} returns 404 with descriptive error message", async () => {
    const res = await fetch(`${baseUrl}/api/v2/nonExistentAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.error, "Unknown Action API operation: nonExistentAction");
  });
});
