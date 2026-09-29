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
    assert.strictEqual(MODEL_PRESETS.mistral.defaultModel, "ministral-8b-latest");
    assert.ok(MODEL_PRESETS.mistral.models.includes("mistral-large-latest"));

    assert.ok(MODEL_PRESETS.ollama, "Ollama preset must exist");
    assert.strictEqual(MODEL_PRESETS.ollama.baseUrl, "https://ollama.com/v1");
    assert.strictEqual(MODEL_PRESETS.ollama.defaultModel, "gemma4:31b");
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
    assert.ok(data.models.ollama.models.includes("gemma4:31b"));
  });

  it("verifies /api/providers/status response payload reports configured Mistral preset", async () => {
    const res = await fetch(`${baseUrl}/api/providers/status`);
    assert.strictEqual(res.status, 200, "Expected status 200");

    const data = await res.json();
    assert.ok(data.mistral, "Provider status must contain mistral");
    assert.strictEqual(data.mistral.configured, true, "Mistral must be configured via app/env/.env");
    assert.strictEqual(data.mistral.model, "ministral-8b-latest");
    assert.strictEqual(data.mistral.endpoint, "https://api.mistral.ai/v1");

    assert.ok(data.ollama, "Provider status must contain ollama");
    assert.strictEqual(data.ollama.endpoint, "https://ollama.com/v1");
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

  it("reports local Ollama install state without a daemon (available:false, HTTP 200)", async () => {
    const prevBase = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:1/v1";
    try {
      const res = await fetch(`${baseUrl}/api/ollama/status`);
      assert.strictEqual(res.status, 200, "Install state must never 503 — unreachable is a state");
      const data = await res.json();
      assert.strictEqual(data.available, false);
      assert.strictEqual(data.installed, false);
      assert.deepStrictEqual(data.models, []);
      // A loopback base is a self-hosted daemon, so installs stay allowed once
      // it comes up — the UI needs this to decide whether [+] is meaningful.
      assert.strictEqual(data.local, true);
      assert.ok(typeof data.error === "string" && data.error.length > 0);
    } finally {
      if (prevBase === undefined) delete process.env.OLLAMA_BASE_URL;
      else process.env.OLLAMA_BASE_URL = prevBase;
    }
  });

  it("rejects an Ollama pull while the daemon is unreachable (HTTP 502, no fake progress)", async () => {
    const prevBase = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:1/v1";
    try {
      const res = await fetch(`${baseUrl}/api/ollama/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gemma4:31b" }),
      });
      assert.strictEqual(res.status, 502, "Unreachable daemon must surface 502, not a fake stream");
      const data = await res.json();
      assert.ok(typeof data.error === "string" && /unreachable|rejected/i.test(data.error));
    } finally {
      if (prevBase === undefined) delete process.env.OLLAMA_BASE_URL;
      else process.env.OLLAMA_BASE_URL = prevBase;
    }
  });

  it("refuses to pull against a remote Ollama endpoint instead of faking an install (HTTP 400)", async () => {
    const prevBase = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = "https://ollama.com/v1";
    try {
      const statusRes = await fetch(`${baseUrl}/api/ollama/status`);
      assert.strictEqual(statusRes.status, 200);
      const status = await statusRes.json();
      // The load-bearing distinction: remote endpoint ⇒ nothing to install.
      assert.strictEqual(status.local, false);

      const res = await fetch(`${baseUrl}/api/ollama/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gemma4:31b" }),
      });
      assert.strictEqual(res.status, 400, "Remote endpoints must not fake a local install");
      const data = await res.json();
      assert.match(data.error, /local Ollama daemon/i);
      // Regression: the old cleartext request aimed at port 11434 on an https
      // base and surfaced the upstream 308 as a bogus 502.
      assert.doesNotMatch(data.error, /HTTP 30\d/);
    } finally {
      if (prevBase === undefined) delete process.env.OLLAMA_BASE_URL;
      else process.env.OLLAMA_BASE_URL = prevBase;
    }
  });

  it("rejects a malicious Ollama model name (HTTP 400)", async () => {
    const res = await fetch(`${baseUrl}/api/ollama/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "../../etc/passwd; rm -rf /" }),
    });
    assert.strictEqual(res.status, 400, "Model allowlist must hold");
  });

  // Full end-to-end install proof against a daemon that really speaks the
  // Ollama API — no mocks inside the app. The backend dials it, proxies its
  // NDJSON frames verbatim, and the final state is read back from the daemon
  // rather than assumed. Needs no Docker and no real multi-GB download.
  it("installs a model end-to-end through the proxy and reports it as installed", async () => {
    const pulled = new Set<string>();
    const stub = http.createServer((req, res) => {
      if (req.method === "GET" && req.url === "/api/tags") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ models: [...pulled].map((name) => ({ name })) }));
        return;
      }
      if (req.method === "POST" && req.url === "/api/pull") {
        let raw = "";
        req.on("data", (chunk) => (raw += chunk));
        req.on("end", () => {
          const { model } = JSON.parse(raw) as { model: string };
          res.writeHead(200, { "Content-Type": "application/x-ndjson" });
          const total = 1000;
          let step = 0;
          // Paced like a real multi-GB pull so a concurrent request overlaps.
          const timer = setInterval(() => {
            step += 1;
            res.write(`${JSON.stringify({ status: "pulling manifest" })}\n`);
            res.write(
              `${JSON.stringify({ status: `downloading ${model}`, completed: (total / 4) * step, total })}\n`
            );
            if (step >= 4) {
              clearInterval(timer);
              pulled.add(model);
              res.write(`${JSON.stringify({ status: "success" })}\n`);
              res.end();
            }
          }, 40);
        });
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", () => resolve()));
    const stubPort = (stub.address() as { port: number }).port;

    const prevBase = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${stubPort}/v1`;
    try {
      const before = await (await fetch(`${baseUrl}/api/ollama/status`)).json();
      assert.strictEqual(before.available, true, "stub daemon must be reachable");
      assert.strictEqual(before.local, true, "a self-hosted daemon is installable");
      assert.strictEqual(before.installed, false, "nothing installed yet");

      const pull = await fetch(`${baseUrl}/api/ollama/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gemma4:31b" }),
      });
      assert.strictEqual(pull.status, 200);
      assert.strictEqual(pull.headers.get("content-type"), "application/x-ndjson");

      // The slot is claimed before dialing, so a second click cannot start a
      // parallel download even in the window before the daemon responds.
      const conflict = await fetch(`${baseUrl}/api/ollama/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gemma4:31b" }),
      });
      assert.strictEqual(conflict.status, 409, "second pull must be refused while one runs");
      const conflictBody = await conflict.json();
      assert.match(conflictBody.error, /Already pulling/);

      const events: Array<{ status: string; completed?: number; total?: number }> = [];
      const reader = pull.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line) events.push(JSON.parse(line) as { status: string });
        }
      }
      const progress = events.filter((e) => typeof e.completed === "number");
      assert.strictEqual(progress.length, 4, "every daemon progress frame must reach the client");
      assert.strictEqual(events.at(-1)?.status, "success");
      const last = progress.at(-1)!;
      assert.strictEqual(last.completed, last.total, "final frame must be complete");
      assert.strictEqual(Math.round((last.completed! / last.total!) * 100), 100);

      const after = await (await fetch(`${baseUrl}/api/ollama/status`)).json();
      assert.strictEqual(after.installed, true, "install must be observed on the daemon, not assumed");
      assert.ok(after.models.includes("gemma4:31b"));
    } finally {
      if (prevBase === undefined) delete process.env.OLLAMA_BASE_URL;
      else process.env.OLLAMA_BASE_URL = prevBase;
      await new Promise<void>((resolve) => stub.close(() => resolve()));
    }
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
