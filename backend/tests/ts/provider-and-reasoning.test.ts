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
import * as fs from "node:fs/promises";
import * as path from "node:path";
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

// ── Strict provider configuration, research, and Action API v2 contracts ─────

const ENV_FILE_PATH = path.resolve(process.cwd(), "app/env/.env");

async function readEnvFile(): Promise<string | null> {
  try {
    return await fs.readFile(ENV_FILE_PATH, "utf-8");
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function restoreEnvFile(snapshot: string | null): Promise<void> {
  if (snapshot === null) {
    await fs.rm(ENV_FILE_PATH, { force: true });
    return;
  }
  await fs.writeFile(ENV_FILE_PATH, snapshot, "utf-8");
}

describe("Strict Provider Configuration & Research Response Contracts", () => {
  let server: http.Server;
  let baseUrl: string;
  let envFileSnapshot: string | null = null;
  const trackedEnvKeys = ["GEMINI_API_KEY", "GEMINI_MODEL", "TAVILY_API_KEY"];
  const envKeySnapshots = new Map<string, string | undefined>();

  before(async () => {
    envFileSnapshot = await readEnvFile();
    for (const key of trackedEnvKeys) envKeySnapshots.set(key, process.env[key]);
    server = await startAgentServer({ port: 0, host: "127.0.0.1" });
    const addr = server.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await restoreEnvFile(envFileSnapshot);
    for (const key of trackedEnvKeys) {
      const previous = envKeySnapshots.get(key);
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  });

  it("rejects an unknown provider without claiming configuration", async () => {
    const res = await fetch(`${baseUrl}/api/providers/configure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "definitely-not-a-provider", apiKey: "sk-live-contract-key-001" }),
    });

    assert.strictEqual(res.status, 400, "Unknown providers must be rejected with HTTP 400");
    const data = await res.json();
    assert.match(data.error, /provider must be one of/);
    assert.strictEqual(data.configured, undefined, "A rejected request must not report configured:true");
    assert.strictEqual(data.persisted, undefined);

    assert.strictEqual(await readEnvFile(), envFileSnapshot, "A rejected request must not touch app/env/.env");
  });

  it("rejects blank and placeholder API keys without touching app/env/.env", async () => {
    for (const apiKey of ["", "   ", "YOUR_GEMINI_API_KEY", "test"]) {
      const res = await fetch(`${baseUrl}/api/providers/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "gemini", apiKey }),
      });

      assert.strictEqual(res.status, 400, `Expected HTTP 400 for apiKey=${JSON.stringify(apiKey)}`);
      const data = await res.json();
      assert.match(data.error, /apiKey must be configured/);
      assert.strictEqual(data.configured, undefined);
    }

    assert.strictEqual(await readEnvFile(), envFileSnapshot, "Rejected keys must not be persisted");
  });

  it("persists a valid provider key and only then reports configured + persisted", async () => {
    const res = await fetch(`${baseUrl}/api/providers/configure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "gemini", apiKey: "sk-contract-gemini-key", model: "gemini-2.5-flash" }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.configured, true);
    assert.strictEqual(data.persisted, true, "Response must only claim configured after persistence succeeded");
    assert.strictEqual(data.provider, "gemini");
    assert.strictEqual(data.model, "gemini-2.5-flash");

    const envText = await readEnvFile();
    assert.ok(envText, "app/env/.env must exist after a successful configuration");
    assert.ok(envText.includes("GEMINI_API_KEY=sk-contract-gemini-key"), "Key must be written to app/env/.env");
    assert.ok(envText.includes("GEMINI_MODEL=gemini-2.5-flash"), "Model must be written to app/env/.env");
    assert.strictEqual(process.env.GEMINI_API_KEY, "sk-contract-gemini-key");
    assert.strictEqual(process.env.GEMINI_MODEL, "gemini-2.5-flash");
  });

  it("rejects a research query without a query parameter", async () => {
    const res = await fetch(`${baseUrl}/api/research/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "   " }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, "Query parameter is required");
  });

  it("reports research unavailable with no fabricated results when Tavily is unconfigured", async () => {
    const previousTavilyKey = process.env.TAVILY_API_KEY;
    delete process.env.TAVILY_API_KEY;

    try {
      const res = await fetch(`${baseUrl}/api/research/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "agentic validation contracts" }),
      });

      assert.strictEqual(res.status, 503, "Unconfigured research must fail loudly rather than return fabricated hits");
      assert.strictEqual(res.headers.get("content-type"), "application/json");
      const data = await res.json();
      assert.match(data.error, /TAVILY_API_KEY is not configured/);
      assert.strictEqual(data.results, undefined, "No synthetic results may be returned");
    } finally {
      if (previousTavilyKey !== undefined) process.env.TAVILY_API_KEY = previousTavilyKey;
    }
  });

  it("returns the Action API v2 getStatus contract required by the frontend client", async () => {
    const res = await fetch(`${baseUrl}/api/v2/getStatus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.operation, "getStatus");
    assert.strictEqual(data.status, "healthy");
    assert.ok(data.currentStage, "getStatus must report the real current stage");
    assert.ok(data.gate1 && data.gate2, "getStatus must report both gates");
    assert.ok(data.providers, "getStatus must report the provider registry");
  });

  it("returns the Action API v2 configureProvider contract with sessionId", async () => {
    const res = await fetch(`${baseUrl}/api/v2/configureProvider`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Session-Id": "v2-contract-session" },
      body: JSON.stringify({ provider: "gemini", apiKey: "sk-v2-contract-key", sessionId: "v2-contract-session" }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.operation, "configureProvider");
    assert.strictEqual(data.configured, true);
    assert.strictEqual(data.sessionId, "v2-contract-session");
    assert.strictEqual(data.provider, "gemini");
  });

  it("rejects an Action API v2 configureProvider request with a placeholder key", async () => {
    const res = await fetch(`${baseUrl}/api/v2/configureProvider`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "gemini", apiKey: "YOUR_GEMINI_API_KEY" }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /apiKey must be configured/);
    assert.strictEqual(data.configured, undefined);
  });
});

// ── Python reasoning HTTP response contract ─────────────────────────────────

interface StubReply {
  status: number;
  contentType: string;
  body: string;
}

describe("Python Reasoning HTTP Response Contract", () => {
  let stubServer: http.Server;
  let previousRuntimeUrl: string | undefined;
  let reply: StubReply = { status: 500, contentType: "application/json", body: "{}" };
  let lastRequest: any = null;

  const validResponse = {
    run_id: "run_http_contract",
    task: "evaluation",
    success: true,
    confidence: 0.91,
    analysis: ["Analyzed the goal", "Verified constraints"],
    findings: [{ code: "EVAL-200", severity: "info", message: "Contract satisfied" }],
    risks: ["None identified"],
    missing_evidence: [],
    recommendation: "Proceed.",
  };

  before(async () => {
    stubServer = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        lastRequest = raw ? JSON.parse(raw) : {};
        res.writeHead(reply.status, { "Content-Type": reply.contentType });
        res.end(reply.body);
      });
    });

    await new Promise<void>((resolve) => stubServer.listen(0, "127.0.0.1", () => resolve()));
    const addr = stubServer.address() as any;
    previousRuntimeUrl = process.env.PYTHON_REASONING_URL;
    process.env.PYTHON_REASONING_URL = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (previousRuntimeUrl === undefined) delete process.env.PYTHON_REASONING_URL;
    else process.env.PYTHON_REASONING_URL = previousRuntimeUrl;
    await new Promise<void>((resolve) => stubServer.close(() => resolve()));
  });

  it("accepts a contract-conforming payload and forwards the real request fields", async () => {
    reply = { status: 200, contentType: "application/json", body: JSON.stringify(validResponse) };

    const response = await executePythonReasoning({
      runId: "run_http_contract",
      prompt: "Validate deterministic contracts",
      task: "evaluation",
      constraints: ["enforce the response verification invariant"],
    });

    assert.strictEqual(lastRequest.run_id, "run_http_contract");
    assert.strictEqual(lastRequest.task, "evaluation");
    assert.strictEqual(lastRequest.goal, "Validate deterministic contracts");
    assert.deepEqual(lastRequest.constraints, ["enforce the response verification invariant"]);

    assert.strictEqual(response.run_id, "run_http_contract");
    assert.strictEqual(response.task, "evaluation");
    assert.strictEqual(response.confidence, 0.91);
    assert.strictEqual(response.findings[0].code, "EVAL-200");
  });

  it("rejects a payload whose run_id does not match the request", async () => {
    reply = {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...validResponse, run_id: "run-someone-else" }),
    };

    await assert.rejects(
      () => executePythonReasoning({ runId: "run_http_contract", prompt: "Validate", task: "evaluation" }),
      /correlation mismatch/
    );
  });

  it("rejects an out-of-range confidence instead of trusting it", async () => {
    reply = {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...validResponse, confidence: 1.4 }),
    };

    await assert.rejects(
      () => executePythonReasoning({ runId: "run_http_contract", prompt: "Validate", task: "evaluation" }),
      /success\/confidence contract/
    );
  });

  it("rejects a response whose analysis field is not a string array", async () => {
    reply = {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...validResponse, analysis: "not an array" }),
    };

    await assert.rejects(
      () => executePythonReasoning({ runId: "run_http_contract", prompt: "Validate", task: "evaluation" }),
      /analysis must be a string array/
    );
  });

  it("rejects a response with a malformed findings record", async () => {
    reply = {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...validResponse, findings: [{ code: "EVAL-200" }] }),
    };

    await assert.rejects(
      () => executePythonReasoning({ runId: "run_http_contract", prompt: "Validate", task: "evaluation" }),
      /findings failed their object contract/
    );
  });

  it("rejects a non-JSON content type", async () => {
    reply = { status: 200, contentType: "text/plain", body: "ok" };

    await assert.rejects(
      () => executePythonReasoning({ runId: "run_http_contract", prompt: "Validate", task: "evaluation" }),
      /non-JSON content/
    );
  });

  it("rejects an invalid JSON body", async () => {
    reply = { status: 200, contentType: "application/json", body: "{ oops" };

    await assert.rejects(
      () => executePythonReasoning({ runId: "run_http_contract", prompt: "Validate", task: "evaluation" }),
      /invalid JSON/
    );
  });

  it("propagates a non-2xx HTTP status instead of returning placeholder reasoning", async () => {
    reply = { status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) };

    await assert.rejects(
      () => executePythonReasoning({ runId: "run_http_contract", prompt: "Validate", task: "evaluation" }),
      /status 500/
    );
  });
});
