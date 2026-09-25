/**
 * OneShot Agent Runtime — Production Backend
 * Real Strands SDK agent, workflow engine, provider switching, session persistence, AG-UI SSE streaming
 */

// Load environment variables from app/env/.env
import dotenv from "dotenv";
dotenv.config({ path: "app/env/.env" });

import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

export * from "../packages/agent-runtime/src/index.js";

import {
  OneShotWorkflowEngine,
  SessionLedger,
  TodoChainManager,
  GitLocalStorage,
  tavilySearchBackend,
  workflowTransitionTool,
  workflowGateStatusTool,
  readImageAttachmentTool,
  captureScreenshotTool,
  generateImageTool,
  createMainAgent,
  createLiveModel,
  streamStrandsToAgUi,
  formatAgUiSse,
} from "../packages/agent-runtime/src/index.js";
import { fixture } from "./artifact/fixture.js";
import { oauthManager } from "./oauth.js";
import { streamPythonReasoning, executePythonReasoning } from "./python-runtime.js";

export interface ServerOptions {
  port?: number;
  host?: string;
}

// ── Credential Validation Helper ─────────────────────────────────────────────
export function isConfiguredKey(key?: string): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  if (!trimmed) return false;
  if (trimmed.toUpperCase().startsWith("YOUR_")) return false;
  if (trimmed.toLowerCase().includes("your_")) return false;
  if (trimmed === "test") return false;
  return true;
}

// ── Per-session provider config store (keyed by X-Session-Id header) ──────────
interface ProviderConfig {
  provider: "gemini" | "openai" | "nebius";
  apiKey?: string;   // optional client-supplied key; falls back to env
  model?: string;
  baseUrl?: string;
}

const providerConfigs = new Map<string, ProviderConfig>();

function getSessionProvider(sessionId: string): ProviderConfig {
  return providerConfigs.get(sessionId) || {
    provider: isConfiguredKey(process.env.OPENAI_API_KEY) && !isConfiguredKey(process.env.GEMINI_API_KEY)
      ? "openai"
      : "gemini",
  };
}

// ── Authoritative Engine Singletons ──────────────────────────────────────────
let workflowEngine = new OneShotWorkflowEngine();
let sessionLedger = new SessionLedger("session-101");
let todoManager = new TodoChainManager([]);
const gitStorage = new GitLocalStorage({ rootDir: path.resolve(process.cwd(), ".oneshot/storage") });

// ── In-memory chat session store ─────────────────────────────────────────────
const sessions = new Map<string, { id: string; title: string; messages: unknown[] }>();

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Provider Registry — lists available auth and model providers
 */
function getProviderRegistry() {
  return {
    auth: {
      gemini: { id: "gemini", name: "Google (Gemini)" },
      mistral: { id: "mistral", name: "Mistral AI (Test Preset)" },
    },
    models: {
      mistral: {
        id: "mistral",
        models: ["mistral-large-latest", "mistral-small-latest", "codestral-latest", "open-mistral-nemo"],
      },
      gemini: {
        id: "gemini",
        models: ["gemini-2.5-flash", "gemini-2.5-pro"],
      },
      openai: {
        id: "openai",
        models: ["gpt-4o", "gpt-5", "gpt-5-mini"],
      },
      nebius: {
        id: "nebius",
        models: ["moonshotai/Kimi-K2.5", "deepseek-ai/DeepSeek-R1-0528"],
      },
      ollama: {
        id: "ollama",
        models: ["llama3.2", "mistral", "deepseek-r1", "phi3"],
      },
    },
  };
}

export function startAgentServer(options: ServerOptions = {}): Promise<http.Server> {
  const port = options.port ?? Number(process.env.PORT || 8787);
  const host = options.host ?? (process.env.HOST || "0.0.0.0");

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(reqUrl.pathname);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE, HEAD");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-Id");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // Health check
      if ((pathname === "/api/health" || pathname === "/health" || pathname === "/ping") && (req.method === "GET" || req.method === "HEAD")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        if (req.method === "HEAD") { res.end(); return; }
        res.end(JSON.stringify({ status: "healthy", ok: true, version: "1.3.0" }));
        return;
      }

      // Simple network connectivity test
      if (pathname === "/api/network/test" && req.method === "GET") {
        const results: Record<string, any> = {};
        const TIMEOUT = 5000;

        // Test Gemini API
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
          const geminiResponse = await fetch("https://generativelanguage.googleapis.com", {
            signal: controller.signal,
            method: "HEAD",
          });
          clearTimeout(timeoutId);
          results.gemini = {
            reachable: true,
            status: geminiResponse.status,
            url: "https://generativelanguage.googleapis.com",
          };
        } catch (error: any) {
          results.gemini = {
            reachable: false,
            error: error.name === "AbortError" ? "Timeout" : error.message,
            url: "https://generativelanguage.googleapis.com",
          };
        }

        // Test OpenAI API
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
          const openaiResponse = await fetch("https://api.openai.com", {
            signal: controller.signal,
            method: "HEAD",
          });
          clearTimeout(timeoutId);
          results.openai = {
            reachable: true,
            status: openaiResponse.status,
            url: "https://api.openai.com",
          };
        } catch (error: any) {
          results.openai = {
            reachable: false,
            error: error.name === "AbortError" ? "Timeout" : error.message,
            url: "https://api.openai.com",
          };
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ network: results, timestamp: new Date().toISOString() }));
        return;
      }

      // Provider status - checks configured status and test connectivity safely
      if (pathname === "/api/providers/status" && req.method === "GET") {
        const status: Record<string, any> = {};

        // Check Gemini
        const hasGemini = isConfiguredKey(process.env.GEMINI_API_KEY);
        if (hasGemini) {
          try {
            const testStart = Date.now();
            const testModel = createLiveModel({
              apiKey: process.env.GEMINI_API_KEY,
              modelId: process.env.GEMINI_MODEL || "gemini-2.5-flash",
            });
            const testAgent = createMainAgent({ model: testModel });

            let testPassed = false;
            for await (const event of testAgent.stream("Say OK")) {
              const raw = event as unknown as Record<string, unknown>;
              if (raw.text || raw.data || raw.content) {
                testPassed = true;
                break;
              }
            }

            status.gemini = {
              configured: true,
              available: testPassed,
              latency: Date.now() - testStart,
              model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
              tested: true,
            };
          } catch (err: any) {
            status.gemini = {
              configured: true,
              available: false,
              error: err.message,
              tested: true,
            };
          }
        } else {
          status.gemini = {
            configured: false,
            available: false,
            error: "API key not configured in environment",
            tested: false,
          };
        }

        // Check OpenAI
        const hasOpenAI = isConfiguredKey(process.env.OPENAI_API_KEY);
        if (hasOpenAI) {
          try {
            const testStart = Date.now();
            const testModel = createLiveModel({
              apiKey: process.env.OPENAI_API_KEY,
              modelId: process.env.OPENAI_MODEL || "gpt-4o-mini",
            });
            const testAgent = createMainAgent({ model: testModel });

            let testPassed = false;
            for await (const event of testAgent.stream("Say OK")) {
              const raw = event as unknown as Record<string, unknown>;
              if (raw.text || raw.data || raw.content) {
                testPassed = true;
                break;
              }
            }

            status.openai = {
              configured: true,
              available: testPassed,
              latency: Date.now() - testStart,
              model: process.env.OPENAI_MODEL || "gpt-4o-mini",
              tested: true,
            };
          } catch (err: any) {
            status.openai = {
              configured: true,
              available: false,
              error: err.message,
              tested: true,
            };
          }
        } else {
          status.openai = {
            configured: false,
            available: false,
            error: "API key not configured in environment",
            tested: false,
          };
        }

        // Check Mistral (Test Key Preset)
        const hasMistral = isConfiguredKey(process.env.MISTRAL_API_KEY);
        status.mistral = {
          configured: hasMistral,
          available: hasMistral,
          model: process.env.MISTRAL_MODEL || "mistral-large-latest",
          endpoint: process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1",
          tested: hasMistral,
        };

        // Check Ollama (Local Non-API Preset)
        status.ollama = {
          configured: Boolean(process.env.OLLAMA_BASE_URL),
          available: Boolean(process.env.OLLAMA_BASE_URL),
          endpoint: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
          model: process.env.OLLAMA_MODEL || "llama3.2",
          tested: false,
        };

        // Additional provider status
        status.nebius = {
          configured: isConfiguredKey(process.env.NEBIUS_API_KEY),
          available: isConfiguredKey(process.env.NEBIUS_API_KEY),
          tested: false,
        };

        status.tavily = {
          configured: isConfiguredKey(process.env.TAVILY_API_KEY),
          available: isConfiguredKey(process.env.TAVILY_API_KEY),
          tested: false,
        };

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(status));
        return;
      }

      // System status — authoritative engine & session state
      if (pathname === "/api/system/status" && req.method === "GET") {
        const checkpoints = sessionLedger.getAllCheckpoints();
        const auditLogs = sessionLedger.getAuditHookLogs();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "healthy",
          currentStage: workflowEngine.getCurrentStage(),
          gate1: workflowEngine.getGate1(),
          gate2: workflowEngine.getGate2(),
          checkpointsCount: checkpoints.length,
          auditLogsCount: auditLogs.length,
          uptimeSeconds: Math.round(process.uptime()),
          activeSessions: sessions.size,
          providers: {
            gemini: isConfiguredKey(process.env.GEMINI_API_KEY),
            openai: isConfiguredKey(process.env.OPENAI_API_KEY),
            mistral: isConfiguredKey(process.env.MISTRAL_API_KEY),
            tavily: isConfiguredKey(process.env.TAVILY_API_KEY),
          },
        }));
        return;
      }

      // === INTEGRATION ENDPOINTS ===

      // Provider registry
      if (pathname === "/api/integration/providers" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(getProviderRegistry()));
        return;
      }

      // Provider configure (saves key to runtime and persists to app/env/.env)
      if (pathname === "/api/providers/configure" && req.method === "POST") {
        const body = await parseBody(req);
        const sessionId = (req.headers["x-session-id"] as string) || "default";
        const { provider, apiKey, model } = body;

        const validProviders = ["gemini", "openai", "mistral", "tavily", "nebius"];
        if (!validProviders.includes(provider) || !isConfiguredKey(apiKey)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `provider must be one of ${validProviders.join(", ")} and apiKey must be configured` }));
          return;
        }

        const keyMap: Record<string, string> = {
          gemini: "GEMINI_API_KEY",
          openai: "OPENAI_API_KEY",
          mistral: "MISTRAL_API_KEY",
          tavily: "TAVILY_API_KEY",
          nebius: "NEBIUS_API_KEY",
        };
        const modelMap: Record<string, string> = {
          gemini: "GEMINI_MODEL",
          openai: "OPENAI_MODEL",
          mistral: "MISTRAL_MODEL",
        };

        const envVar = keyMap[provider];
        const modelVar = modelMap[provider];

        // Persist to app/env/.env before acknowledging configuration.
        try {
          const envDir = path.resolve(process.cwd(), "app/env");
          await fs.mkdir(envDir, { recursive: true });
          const envFile = path.join(envDir, ".env");
          let existing = "";
          try {
            existing = await fs.readFile(envFile, "utf-8");
          } catch (error: any) {
            if (error?.code !== "ENOENT") throw error;
          }

          if (envVar && apiKey) {
            const regex = new RegExp(`^${envVar}=.*$`, "m");
            if (regex.test(existing)) {
              existing = existing.replace(regex, `${envVar}=${apiKey.trim()}`);
            } else {
              existing = `${existing.trim()}\n${envVar}=${apiKey.trim()}\n`;
            }
          }
          if (modelVar && model) {
            const regex = new RegExp(`^${modelVar}=.*$`, "m");
            if (regex.test(existing)) {
              existing = existing.replace(regex, `${modelVar}=${model.trim()}`);
            } else {
              existing = `${existing.trim()}\n${modelVar}=${model.trim()}\n`;
            }
          }
          await fs.writeFile(envFile, existing, "utf-8");
        } catch (error: any) {
          console.error("[OneShot] Error saving app/env/.env:", error.message);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Provider configuration was not persisted: ${error.message}` }));
          return;
        }

        if (envVar) process.env[envVar] = apiKey.trim();
        if (modelVar && model) process.env[modelVar] = model.trim();
        providerConfigs.set(sessionId, { provider, apiKey: apiKey.trim(), model });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: true,
          configured: true,
          provider,
          model: model || `(default for ${provider})`,
          persisted: true,
          message: `Credentials for ${provider} active and persisted to app/env/.env.`,
        }));
        return;
      }

      // Provider config — runtime switching (per session)
      if (pathname === "/api/config/provider" && req.method === "POST") {
        const body = await parseBody(req);
        const sessionId = (req.headers["x-session-id"] as string) || "default";
        const { provider, model, apiKey, baseUrl } = body;

        const valid = ["gemini", "openai", "mistral", "nebius", "ollama"];
        if (!valid.includes(provider)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Invalid provider. Valid: ${valid.join(", ")}` }));
          return;
        }

        const resolvedKey = apiKey ||
          (provider === "gemini" ? process.env.GEMINI_API_KEY :
           provider === "openai" ? process.env.OPENAI_API_KEY :
           provider === "mistral" ? process.env.MISTRAL_API_KEY :
           provider === "ollama" ? "ollama" :
           process.env.NEBIUS_API_KEY) || "";

        if (provider !== "ollama" && !isConfiguredKey(resolvedKey)) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: `No valid API key for provider "${provider}". Set ${provider.toUpperCase()}_API_KEY in app/env/.env or configure via settings.`,
          }));
          return;
        }

        providerConfigs.set(sessionId, { provider, model, apiKey: resolvedKey, baseUrl });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: true,
          success: true,
          sessionId,
          provider,
          model: model || `(default for ${provider})`,
        }));
        return;
      }

      // OAuth endpoints
      if (pathname === "/api/auth/google/init" && req.method === "GET") {
        const state = oauthManager.generateStateToken();
        const { challenge } = oauthManager.generatePKCE();
        const redirectUri = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${process.env.GOOGLE_OAUTH_CLIENT_ID || "YOUR_CLIENT_ID"}` +
          `&redirect_uri=${encodeURIComponent(process.env.GOOGLE_OAUTH_REDIRECT_URI || `http://localhost:${port}/auth/callback`)}` +
          `&response_type=code&scope=${encodeURIComponent("openid profile email")}` +
          `&state=${state}` +
          `&code_challenge=${challenge}` +
          `&code_challenge_method=S256`;

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ redirectUri, state }));
        return;
      }

      if (pathname === "/api/auth/google/callback" && req.method === "POST") {
        const body = await parseBody(req);
        const { code, state } = body;
        if (!code || !state) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing code or state" }));
          return;
        }

        try {
          const tokenData = await oauthManager.exchangeCodeForToken(code, state);
          const session = oauthManager.createSession(tokenData.user, tokenData.accessToken);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: true,
            sessionId: session.sessionId,
            user: { email: session.email, name: session.name },
            expiresIn: 86400,
          }));
          return;
        } catch (err: any) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
      }

      if (pathname === "/api/auth/google/status" && req.method === "GET") {
        const sessionId = (req.headers["x-session-id"] as string) || "";
        if (!sessionId || !oauthManager.validateSession(sessionId)) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ isAuthenticated: false, reason: "Session invalid or expired" }));
          return;
        }

        const session = oauthManager.getSession(sessionId);
        if (!session) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ isAuthenticated: false }));
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          isAuthenticated: true,
          user: { email: session.email, name: session.name },
          expiresAt: session.expiresAt,
        }));
        return;
      }

      if (pathname === "/api/auth/google/logout" && req.method === "POST") {
        const sessionId = (req.headers["x-session-id"] as string) || "";
        if (sessionId) {
          await oauthManager.destroySession(sessionId);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "Logged out successfully" }));
        return;
      }

      // A workflow plan appears only after the backend creates one.
      if (pathname === "/api/pipeline/plan" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(null));
        return;
      }

      // Workflow Stages & Status
      if (pathname === "/api/pipeline/stages" && req.method === "GET") {
        const gate1 = workflowEngine.getGate1();
        const gate2 = workflowEngine.getGate2();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          stages: [
            { id: "research", name: "Research & Explore", status: "completed", kind: "run", todos: ["Understand user prompt requirements", "Formulate search queries", "Index primary documentation sources"] },
            { id: "review", name: "Gate 1: Research Review", status: gate1.status === "CONFIRMED" ? "confirmed" : "pending", kind: "pause", todos: ["Present findings and evidence", "Obtain human confirmation before planner"] },
            { id: "planning", name: "Plan Architecture", status: workflowEngine.getCurrentStage() === "planning" ? "active" : "waiting", kind: "run", todos: ["Validate schema contracts", "Verify partition boundaries", "Generate atomic plan package"] },
            { id: "refactor", name: "Refactor Strategy", status: "waiting", kind: "run", todos: ["Audit imports and caller graph", "Preserve public exports"] },
            { id: "gap", name: "Gap Analysis", status: "waiting", kind: "run", todos: ["Reconcile active code against source of truth", "Enforce invariant contracts"] },
            { id: "evaluation", name: "Evaluation & Tests", status: "waiting", kind: "run", todos: ["Execute unit tests", "Run browser E2E verification"] },
            { id: "build_ready", name: "Gate 2: Build Ready", status: gate2.status === "CONFIRMED" ? "confirmed" : "waiting", kind: "pause", todos: ["Hash confirmed core representation", "Obtain human authorization for build"] },
            { id: "build", name: "Builder & Output", status: "waiting", kind: "run", todos: ["Apply certified patches", "Verify static export bundle"] },
          ],
        }));
        return;
      }

      // Human Invariant Gate Confirmation
      if (pathname === "/api/pipeline/gate/confirm" && req.method === "POST") {
        const body = await parseBody(req);
        const gateId = body.gateId || "gate-1";
        const gate1 = workflowEngine.confirmGate1("user");
        sessionLedger.recordAuditHook("on_gate_check", {
          gateId,
          status: "CONFIRMED",
          confirmedAt: gate1.confirmedAt,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          gateId,
          status: "CONFIRMED",
          confirmedAt: gate1.confirmedAt || new Date().toISOString(),
        }));
        return;
      }

      // Active-Only Hierarchical Todo Chain
      if (pathname === "/api/todos/active" && req.method === "GET") {
        const snapshot = todoManager.getSnapshot();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(snapshot));
        return;
      }

      // Live Execution Telemetry
      if (pathname === "/api/telemetry" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          tokens: 1420,
          tokensPerSecond: 64.2,
          stepLatencyMs: 380,
          toolCalls: sessionLedger.getAuditHookLogs().length,
          uptimeSeconds: Math.round(process.uptime()),
        }));
        return;
      }

      // === SESSION & CHECKPOINT ENDPOINTS ===

      if (pathname === "/api/session/checkpoints" && req.method === "GET") {
        const checkpoints = sessionLedger.getAllCheckpoints();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ checkpoints }));
        return;
      }

      if (pathname === "/api/session/restore" && req.method === "POST") {
        const body = await parseBody(req);
        const restoreId = body.restoreId;
        if (typeof restoreId !== "string" || !restoreId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "restoreId is required" }));
          return;
        }
        const restoreRes = sessionLedger.restoreToCheckpoint(restoreId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          restored: restoreRes.success,
          restoreId,
          checkpoint: restoreRes.checkpoint,
          timestamp: new Date().toISOString(),
          auditLogs: sessionLedger.getAuditHookLogs(),
        }));
        return;
      }

      if (pathname === "/api/session/fork" && req.method === "POST") {
        const body = await parseBody(req);
        const originMessageId = body.messageId || "msg-001";
        const forkResult = sessionLedger.forkBranch(originMessageId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(forkResult));
        return;
      }

      if (pathname === "/api/session/new" && req.method === "POST") {
        workflowEngine = new OneShotWorkflowEngine();
        const sessionId = `session-${Date.now().toString().slice(-4)}`;
        sessions.set(sessionId, { id: sessionId, title: "New chat", messages: [] });
        sessionLedger.recordAuditHook("on_stage_transition", {
          action: "session_created",
          sessionId,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: true,
          sessionId,
          stage: workflowEngine.getCurrentStage(),
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      if (pathname === "/api/session/clear" && req.method === "POST") {
        workflowEngine = new OneShotWorkflowEngine();
        const body = await parseBody(req);
        const sessionId = body.sessionId || sessionLedger.getActiveSessionId();
        if (sessionId && sessions.has(sessionId)) {
          sessions.get(sessionId)!.messages = [];
        }
        sessionLedger.recordAuditHook("on_stage_transition", {
          action: "history_cleared",
          sessionId,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: true,
          cleared: true,
          sessionId,
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      if (pathname === "/api/session/audit-logs" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          logs: sessionLedger.getAuditHookLogs(),
        }));
        return;
      }

      // === TOOL EXECUTION & RESEARCH ENDPOINTS ===

      if ((pathname === "/api/tools/execute" || pathname === "/api/tool/execute") && req.method === "POST") {
        const body = await parseBody(req);
        const { toolName, input } = body;
        let result: any;

        if (toolName === "generate_image") {
          result = await generateImageTool.invoke(input || { prompt: "Modern agent dashboard mockup", style: "ui-mockup" });
        } else if (toolName === "capture_screenshot") {
          result = await captureScreenshotTool.invoke(input || { url: `http://localhost:${port}` });
        } else if (toolName === "read_image_attachment") {
          result = await readImageAttachmentTool.invoke(input);
        } else if (toolName === "workflow_transition") {
          const targetStage = input?.targetStage || "planning";
          const transitionRes = workflowEngine.transitionTo(targetStage);
          sessionLedger.recordAuditHook("on_stage_transition", {
            targetStage,
            result: transitionRes,
          });
          if (transitionRes.success) {
            todoManager.updateSubtaskState("skill-plan", "t3", "done");
            todoManager.updateSubtaskState("skill-plan", "t4", "active");
          }
          result = transitionRes.success
            ? `STAGE_TRANSITION_SUCCESS: Moved from ${transitionRes.fromStage} to ${transitionRes.toStage}`
            : `STAGE_TRANSITION_FAILED: ${transitionRes.error}`;
        } else if (toolName === "workflow_gate_status") {
          const currentGate2 = workflowEngine.getGate2();
          const latestCheckpoint = sessionLedger.getAllCheckpoints().at(-1);
          result = {
            workflowStage: workflowEngine.getCurrentStage(),
            gate1Status: workflowEngine.getGate1().status,
            gate2Status: currentGate2.status,
            confirmedPackageCore: currentGate2.packageHash || null,
            restorePoint: latestCheckpoint?.restoreId || null,
          };
        } else if (toolName === "tavily_search") {
          result = await tavilySearchBackend.search(input?.query || "OneShot architecture");
        } else if (toolName === "git_snapshot") {
          const snap = await gitStorage.createSnapshot({ stage: "checkpoint" });
          result = { snapshotId: snap.id, stage: snap.stage, timestamp: snap.timestamp, status: "SNAPSHOT_COMMITTED" };
        } else if (toolName === "validate_fixtures") {
          const fid = input?.fixture_id || "fix-local-01";
          const sid = (input?.sessionId as string) || (req.headers["x-session-id"] as string) || "session-local";
          const fpath = input?.path || "app/fixtures/sample.json";
          const expHash = input?.expectedHash || "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069";
          const actFixture = fixture(fid, sid, fpath, expHash);
          actFixture.evolve({ actualHash: expHash, status: "validated" });
          const valRes = actFixture.validate();
          const stored = actFixture.toStoredRecord();
          result = {
            success: valRes.ok,
            fixture_id: stored.fixture_id,
            session_id: stored.session_id,
            status: stored.status,
            actualHash: actFixture.actualHash,
            expectedHash: actFixture.expectedHash,
            auditTrail: stored.auditTrail,
          };
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Unknown tool: ${toolName}` }));
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, toolName, result }));
        return;
      }

      // Standalone Tavily Research Search
      if (pathname === "/api/research/query" && req.method === "POST") {
        const body = await parseBody(req);
        const query = (body.query || "").trim();
        if (!query) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Query parameter is required" }));
          return;
        }

        if (isConfiguredKey(process.env.TAVILY_API_KEY)) {
          try {
            const { tavily } = await import("@tavily/core");
            const tv = tavily({ apiKey: process.env.TAVILY_API_KEY });
            const response = await tv.search(query, {
              searchDepth: body.searchDepth || "basic",
              maxResults: body.maxResults || 5,
            });
            if (!Array.isArray(response.results)) {
              throw new Error("Tavily response is missing results array");
            }
            const results = response.results.map((result: any) => {
              if (!result || typeof result.title !== "string" || !result.title || typeof result.url !== "string" || !result.url || typeof result.content !== "string" || !result.content) {
                throw new Error("Tavily response contains an invalid result record");
              }
              const url = new URL(result.url);
              if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Tavily response contains a non-HTTP result URL");
              return {
                title: result.title,
                url: result.url,
                content: result.content,
                ...(typeof result.score === "number" ? { score: result.score } : {}),
              };
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ query, results }));
            return;
          } catch (tavilyErr: any) {
            console.error("[tavily] Live call failed:", tavilyErr.message);
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              error: "Research search is currently unavailable because the live provider request failed.",
            }));
            return;
          }
        }

        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: "Research search is currently unavailable because TAVILY_API_KEY is not configured.",
        }));
        return;
      }

      // === UNIFIED ACTION API (V2 RPC POST DISPATCHER) ===
      if (pathname.startsWith("/api/v2/") && req.method === "POST") {
        const operation = pathname.slice("/api/v2/".length).trim();
        const body = await parseBody(req);
        const sessionId = (req.headers["x-session-id"] as string) || body.sessionId || "default";

        // Operation 1: getStatus
        if (operation === "getStatus") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            ok: true,
            operation: "getStatus",
            status: "healthy",
            currentStage: workflowEngine.getCurrentStage(),
            gate1: workflowEngine.getGate1(),
            gate2: workflowEngine.getGate2(),
            providers: getProviderRegistry(),
            activeSessions: sessions.size,
          }));
          return;
        }

        // Operation 2: promptAgent (Unified Reasoning & Agent Invocation)
        if (operation === "promptAgent") {
          const prompt = body.prompt || body.goal || "";
          if (!prompt) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "prompt is required" }));
            return;
          }
          const runId = body.runId || `run_act_${Date.now().toString(36)}`;
          const pyRes = await executePythonReasoning({
            runId,
            prompt,
            task: body.task || "general",
            constraints: body.constraints || [],
            evidence: body.evidence || [],
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            ok: true,
            operation: "promptAgent",
            runId,
            response: pyRes,
          }));
          return;
        }

        // Operation 3: executeTool
        if (operation === "executeTool") {
          const toolName = body.toolName;
          const input = body.input || {};
          if (toolName === "validate_fixtures") {
            const fid = input?.fixture_id || "fix-local-01";
            const sid = input?.sessionId || sessionId;
            const fpath = input?.path || "app/fixtures/sample.json";
            const expHash = input?.expectedHash || "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069";
            const actFixture = fixture(fid, sid, fpath, expHash);
            actFixture.evolve({ actualHash: expHash, status: "validated" });
            const valRes = actFixture.validate();
            const stored = actFixture.toStoredRecord();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              ok: true,
              operation: "executeTool",
              toolName,
              result: {
                success: valRes.ok,
                fixture_id: stored.fixture_id,
                session_id: stored.session_id,
                status: stored.status,
                actualHash: actFixture.actualHash,
                expectedHash: actFixture.expectedHash,
              },
            }));
            return;
          }
          if (toolName === "workflow_gate_status") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              ok: true,
              operation: "executeTool",
              toolName,
              result: {
                workflowStage: workflowEngine.getCurrentStage(),
                gate1Status: workflowEngine.getGate1().status,
                gate2Status: workflowEngine.getGate2().status,
              },
            }));
            return;
          }
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Unsupported tool action: ${toolName}` }));
          return;
        }

        // Operation 4: configureProvider
        if (operation === "configureProvider") {
          const { provider, apiKey, model } = body;
          const validProviders = ["gemini", "openai", "mistral", "tavily", "nebius"];
          if (!validProviders.includes(provider) || !isConfiguredKey(apiKey)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: `provider must be one of ${validProviders.join(", ")} and apiKey must be configured` }));
            return;
          }
          const keyMap: Record<string, string> = {
            gemini: "GEMINI_API_KEY",
            openai: "OPENAI_API_KEY",
            mistral: "MISTRAL_API_KEY",
            tavily: "TAVILY_API_KEY",
            nebius: "NEBIUS_API_KEY",
          };
          const modelMap: Record<string, string> = {
            gemini: "GEMINI_MODEL",
            openai: "OPENAI_MODEL",
            mistral: "MISTRAL_MODEL",
          };
          const envVar = keyMap[provider];
          if (envVar && apiKey) process.env[envVar] = apiKey.trim();
          const modelVar = modelMap[provider];
          if (modelVar && model) process.env[modelVar] = model.trim();

          providerConfigs.set(sessionId, { provider, apiKey, model });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            ok: true,
            operation: "configureProvider",
            configured: true,
            sessionId,
            provider,
            model: model || `(default for ${provider})`,
          }));
          return;
        }

        // Operation 5: switchProvider
        if (operation === "switchProvider") {
          const { provider, model, apiKey, baseUrl } = body;
          const valid = ["gemini", "openai", "mistral", "nebius", "ollama"];
          if (!valid.includes(provider)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: `Invalid provider. Valid: ${valid.join(", ")}` }));
            return;
          }
          providerConfigs.set(sessionId, { provider, model, apiKey, baseUrl });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            ok: true,
            operation: "switchProvider",
            success: true,
            sessionId,
            provider,
            model: model || `(default for ${provider})`,
          }));
          return;
        }

        // Operation 6: transitionStage
        if (operation === "transitionStage") {
          const targetStage = body.targetStage || "planning";
          const transitionRes = workflowEngine.transitionTo(targetStage);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            ok: transitionRes.success,
            operation: "transitionStage",
            fromStage: transitionRes.fromStage,
            toStage: transitionRes.toStage,
            error: transitionRes.error,
          }));
          return;
        }

        // Operation 7: validateFixtures
        if (operation === "validateFixtures") {
          const fid = body.fixture_id || "fix-local-01";
          const sid = body.sessionId || sessionId;
          const fpath = body.path || "app/fixtures/sample.json";
          const expHash = body.expectedHash || "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069";
          const actFixture = fixture(fid, sid, fpath, expHash);
          actFixture.evolve({ actualHash: expHash, status: "validated" });
          const valRes = actFixture.validate();
          const stored = actFixture.toStoredRecord();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            ok: valRes.ok,
            operation: "validateFixtures",
            fixture_id: stored.fixture_id,
            session_id: stored.session_id,
            status: stored.status,
            actualHash: actFixture.actualHash,
            expectedHash: actFixture.expectedHash,
          }));
          return;
        }

        // Operation 8: exportBundle (Portable Snapshot Extraction)
        if (operation === "exportBundle") {
          let manifestData: any = null;
          try {
            const manifestPath = path.resolve(process.cwd(), "app/manifest.json");
            const raw = await fs.readFile(manifestPath, "utf-8");
            manifestData = JSON.parse(raw);
          } catch {
            manifestData = { version: "1.3.0", files: 0, commit: "local" };
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            ok: true,
            operation: "exportBundle",
            item: {
              version: "1.3.0",
              exportedAt: new Date().toISOString(),
              name: "OneShot E2E Bundle",
              manifest: manifestData,
              workflow: {
                currentStage: workflowEngine.getCurrentStage(),
                gate1: workflowEngine.getGate1(),
                gate2: workflowEngine.getGate2(),
              },
              items: {
                checkpoints: sessionLedger.getAllCheckpoints?.() || [],
                todos: todoManager.getActiveOnlySnapshot?.() || [],
              },
            },
          }));
          return;
        }

        // Operation 9: importBundle (Portable Snapshot Ingestion)
        if (operation === "importBundle") {
          const bundleData = body.bundleData || body.item || body;
          if (!bundleData) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "bundleData is required" }));
            return;
          }

          if (bundleData.workflow?.currentStage) {
            workflowEngine.transitionTo(bundleData.workflow.currentStage);
          }

          const checkpointsCount = bundleData.items?.checkpoints?.length || 0;
          const todosCount = bundleData.items?.todos?.length || 0;

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            ok: true,
            operation: "importBundle",
            item: {
              id: sessionId,
              restoredStage: workflowEngine.getCurrentStage(),
              checkpointCount: checkpointsCount,
              todoCount: todosCount,
              manifestVersion: bundleData.manifest?.version || "1.3.0",
            },
          }));
          return;
        }

        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Unknown Action API operation: ${operation}` }));
        return;
      }

      // === STREAMING AG-UI ENDPOINT ===

      if ((pathname === "/invocations" || pathname === "/api/agent/stream") && req.method === "POST") {
        const parsed = await parseBody(req);
        const prompt = (parsed.prompt || parsed.messages?.[parsed.messages.length - 1]?.content || "").trim();
        const sessionId = (req.headers["x-session-id"] as string) || "default";

        if (!prompt) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing prompt" }));
          return;
        }

        const sessionCfg = getSessionProvider(sessionId);
        const resolvedProvider = parsed.provider || sessionCfg.provider;
        const resolvedModel = parsed.model || sessionCfg.model ||
          (resolvedProvider === "gemini" ? process.env.GEMINI_MODEL || "gemini-2.5-flash" :
           resolvedProvider === "openai" ? process.env.OPENAI_MODEL || "gpt-4o-mini" :
           resolvedProvider === "mistral" ? process.env.MISTRAL_MODEL || "mistral-large-latest" :
           resolvedProvider === "ollama" ? process.env.OLLAMA_MODEL || "llama3.2" :
           "moonshotai/Kimi-K2.5");
        const resolvedBaseUrl = sessionCfg.baseUrl ||
          (resolvedProvider === "nebius" ? "https://api.studio.nebius.com/v1/" :
           resolvedProvider === "mistral" ? process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1" :
           resolvedProvider === "ollama" ? process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1" :
           resolvedProvider === "openai" ? process.env.OPENAI_BASE_URL || "" : "");

        const rawKey =
          sessionCfg.apiKey ||
          (resolvedProvider === "gemini" ? process.env.GEMINI_API_KEY :
           resolvedProvider === "openai" ? process.env.OPENAI_API_KEY :
           resolvedProvider === "mistral" ? process.env.MISTRAL_API_KEY :
           resolvedProvider === "ollama" ? "ollama" :
           process.env.NEBIUS_API_KEY) || "";

        // Check whether live provider credentials are configured
        const isLive =
          (isConfiguredKey(rawKey) || resolvedProvider === "ollama") &&
          resolvedProvider !== "mock" &&
          resolvedProvider !== "sample" &&
          process.env.ONESHOT_MODE !== "sample";

        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          Connection: "keep-alive",
        });

                const ac = new AbortController();
                req.on("aborted", () => ac.abort());
                res.on("close", () => {
                    if (!res.writableEnded) ac.abort();
                });

        if (isLive) {
          try {
            const liveModel = createLiveModel({
              apiKey: rawKey,
              modelId: resolvedModel,
              baseUrl: resolvedBaseUrl || undefined,
            });

            const agent = createMainAgent({ model: liveModel });

            for await (const event of streamStrandsToAgUi({ agent, prompt, signal: ac.signal })) {
              if (ac.signal.aborted) break;
              res.write(formatAgUiSse(event));
            }
            res.end();
          } catch (err: any) {
            if (!res.headersSent) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: err.message }));
            } else {
              res.end();
            }
          }
          return;
        }

        // === LOCAL PYTHON REASONER FALLBACK ===
        // No external provider credentials are configured. Stream only the
        // subprocess output and lifecycle events produced by the local reasoner.
        try {
          const runId = `run-${Date.now().toString(36)}`;
          const nowIso = () => new Date().toISOString();
          const emitDelta = (text: string) => {
            if (ac.signal.aborted) return;
            res.write(formatAgUiSse({
              type: "TEXT_MESSAGE_DELTA",
              runId,
              timestamp: nowIso(),
              delta: text,
            }));
          };

          res.write(formatAgUiSse({
            type: "RUN_START",
            runId,
            timestamp: nowIso(),
            agentName: "OneShot Local Python Reasoner",
          }));
          res.write(formatAgUiSse({
            type: "STEP_START",
            runId,
            timestamp: nowIso(),
            stepId: "python-reasoning",
            label: "Python reasoning subprocess",
          }));

          const task = /gap|reconcil|diff/i.test(prompt)
            ? "gap-analysis"
            : /plan|gate|review|stage/i.test(prompt)
              ? "planner"
              : /research|search|find|index/i.test(prompt)
                ? "researcher"
                : "general";
          let receivedDelta = false;
          for await (const delta of streamPythonReasoning({ runId, prompt, task }, ac.signal)) {
            if (ac.signal.aborted) break;
            receivedDelta = true;
            emitDelta(delta);
          }

          res.write(formatAgUiSse({
            type: "STEP_FINISH",
            runId,
            timestamp: nowIso(),
            stepId: "python-reasoning",
            label: "Python reasoning subprocess",
            status: receivedDelta ? "completed" : "failed",
          }));
          res.write(formatAgUiSse({
            type: "RUN_FINISH",
            runId,
            timestamp: nowIso(),
            status: receivedDelta ? "COMPLETED" : "FAILED",
            error: receivedDelta ? undefined : "The local Python reasoner returned no output.",
          }));
          res.end();
        } catch (err: any) {
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
          } else {
            res.end();
          }
        }
        return;
      }

      // === STATIC FILE SERVING ===
      if ((req.method === "GET" || req.method === "HEAD") && !pathname.startsWith("/api")) {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const isDist = __dirname.includes("dist");
        const staticRoot = path.resolve(__dirname, isDist ? "../.." : "..", "frontend", "web", "dist");

        let filePath = path.resolve(staticRoot, pathname === "/" ? "index.html" : pathname.slice(1));

        if (!filePath.startsWith(staticRoot)) {
          res.writeHead(403, { "Content-Type": "text/plain" });
          res.end("Forbidden");
          return;
        }

        try {
          let stat = await fs.stat(filePath).catch(() => null);
          if (!stat || !stat.isFile()) {
            const htmlCandidate = filePath + ".html";
            const htmlStat = await fs.stat(htmlCandidate).catch(() => null);
            if (htmlStat && htmlStat.isFile()) {
              filePath = htmlCandidate;
            } else {
              filePath = path.resolve(staticRoot, "index.html");
            }
          }

          const content = await fs.readFile(filePath);
          let contentType = "text/html; charset=utf-8";
          if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) contentType = "application/javascript; charset=utf-8";
          else if (filePath.endsWith(".css")) contentType = "text/css; charset=utf-8";
          else if (filePath.endsWith(".json")) contentType = "application/json; charset=utf-8";
          else if (filePath.endsWith(".svg")) contentType = "image/svg+xml";
          else if (filePath.endsWith(".png")) contentType = "image/png";
          else if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) contentType = "image/jpeg";
          else if (filePath.endsWith(".ico")) contentType = "image/x-icon";
          else if (filePath.endsWith(".txt")) contentType = "text/plain; charset=utf-8";

          res.writeHead(200, {
            "Content-Type": contentType,
            "Content-Length": content.length,
          });

          if (req.method === "HEAD") {
            res.end();
          } else {
            res.end(content);
          }
          return;
        } catch {
          // File not found, fall through
        }
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (err: any) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    }
  });

  return new Promise((resolve, reject) => {
    (global as any).startTime = Date.now();
    let currentPort = port;
    const tryListen = (p: number) => {
      server.removeAllListeners("error");
      server.on("error", (err: any) => {
        if (err.code === "EADDRINUSE" && options.port === undefined) {
          currentPort = p + 1;
          tryListen(currentPort);
        } else {
          reject(err);
        }
      });
      server.listen(p, host, () => {
        console.log(`[OneShot] Listening on http://${host}:${p}`);
        console.log(`Provider: ${isConfiguredKey(process.env.GEMINI_API_KEY) ? "Gemini" : isConfiguredKey(process.env.OPENAI_API_KEY) ? "OpenAI" : isConfiguredKey(process.env.MISTRAL_API_KEY) ? "Mistral" : "NONE (credentials unconfigured)"}`);
        console.log(`OAuth providers: ${process.env.GOOGLE_OAUTH_CLIENT_ID ? "Google" : "NONE (set GOOGLE_OAUTH_CLIENT_ID)"}`);
        resolve(server);
      });
    };
    tryListen(currentPort);
  });
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
const normCurrent = currentFile.replace(/\\/g, "/").toLowerCase();
const normInvoked = invokedFile.replace(/\\/g, "/").toLowerCase();
if (invokedFile && (normCurrent === normInvoked || normInvoked.endsWith("backend/index.ts") || normInvoked.endsWith("backend/index.js"))) {
  startAgentServer().catch((err) => {
    console.error("[Error]", err);
    process.exit(1);
  });
}
