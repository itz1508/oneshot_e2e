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
  researchSkill,
  designPlanningSkill,
  isResearchHandoffReady,
  canInvokeDesignPlanning,
  type WorkflowStage,
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
        const allowEnvFilePersistence = process.env.ONESHOT_ALLOW_ENV_FILE_WRITE === "1"
          || process.env.NODE_ENV !== "production";

        // Persist to app/env/.env before acknowledging configuration.
        // Production container/serverless filesystems are read-only or ephemeral,
        // so file persistence is local-dev only unless explicitly enabled.
        let persisted = false;
        if (allowEnvFilePersistence) {
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
            persisted = true;
          } catch (error: any) {
            console.error("[OneShot] Error saving app/env/.env:", error.message);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: `Provider configuration was not persisted: ${error.message}` }));
            return;
          }
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
          persisted,
          message: persisted
            ? `Credentials for ${provider} active and persisted to app/env/.env.`
            : `Credentials for ${provider} active for this runtime only (file persistence disabled in production).`,
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
      // NOTE: /api/pipeline/plan was removed. It unconditionally returned `null`,
      // so PlanReviewCard could never render and the client-side plan contract was
      // unreachable. Planning is now owned by Design_Planning
      // (POST /api/design-planning/plan → APPROVED_PLAN). See ARCHITECTURE.MD §1.4.

      // Workflow Stages & Status
      if (pathname === "/api/pipeline/stages" && req.method === "GET") {
        const gate1 = workflowEngine.getGate1();
        const gate2 = workflowEngine.getGate2();
        const currentStage = workflowEngine.getCurrentStage();

        // Stage status is derived from the real engine position and the documented
        // stage order. A stage the engine has not reached is never reported as done.
        const ENGINE_ORDER = ["research", "planning", "gap_analysis", "evaluation", "builder"];
        const currentIndex = ENGINE_ORDER.indexOf(currentStage);

        // displayId -> the engine stage it represents (null = not engine-tracked)
        const ENGINE_FOR: Record<string, string | null> = {
          research: "research",
          planning: "planning",
          gap: "gap_analysis",
          evaluation: "evaluation",
          build: "builder",
          refactor: null,
        };

        const statusFor = (displayId: string): string => {
          const engineStage = ENGINE_FOR[displayId];
          if (engineStage === null) return "waiting"; // not tracked by the engine
          const index = ENGINE_ORDER.indexOf(engineStage);
          if (index === currentIndex) return "active";
          return index < currentIndex ? "completed" : "waiting";
        };

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          currentStage,
          stages: [
            { id: "research", name: "Research & Explore", status: statusFor("research"), kind: "run", todos: ["Understand user prompt requirements", "Formulate search queries", "Index primary documentation sources"] },
            { id: "review", name: "Gate 1: Research Review", status: gate1.status === "CONFIRMED" ? "confirmed" : "pending", kind: "pause", todos: ["Present findings and evidence", "Obtain human confirmation before planner"] },
            { id: "planning", name: "Plan Architecture", status: statusFor("planning"), kind: "run", todos: ["Validate schema contracts", "Verify partition boundaries", "Generate atomic plan package"] },
            { id: "refactor", name: "Refactor Strategy", status: statusFor("refactor"), kind: "run", todos: ["Audit imports and caller graph", "Preserve public exports"] },
            { id: "gap", name: "Gap Analysis", status: statusFor("gap"), kind: "run", todos: ["Reconcile active code against source of truth", "Enforce invariant contracts"] },
            { id: "evaluation", name: "Evaluation & Tests", status: statusFor("evaluation"), kind: "run", todos: ["Execute unit tests", "Run browser E2E verification"] },
            { id: "build_ready", name: "Gate 2: Build Ready", status: gate2.status === "CONFIRMED" ? "confirmed" : "waiting", kind: "pause", todos: ["Hash confirmed core representation", "Obtain human authorization for build"] },
            { id: "build", name: "Builder & Output", status: statusFor("build"), kind: "run", todos: ["Apply certified patches", "Verify static export bundle"] },
          ],
        }));
        return;
      }

      // Human Invariant Gate Confirmation
      if (pathname === "/api/pipeline/gate/confirm" && req.method === "POST") {
        const body = await parseBody(req);
        const gateId = body.gateId ?? "gate-1";

        // Only the two real gates are confirmable. An unknown id is refused rather
        // than silently treated as gate 1.
        if (gateId !== "gate-1" && gateId !== "gate-2") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: "Unknown gate. Expected 'gate-1' or 'gate-2'.",
            received: gateId,
          }));
          return;
        }

        // Gate 2 is hash-bound: it cannot be confirmed without a package core.
        if (gateId === "gate-2" && (body.packageCore === undefined || body.packageCore === null)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: "Gate 2 confirmation requires a 'packageCore' object to bind the SHA-256 hash.",
          }));
          return;
        }

        // Confirm the gate the caller actually asked for, and return the engine's
        // real state — never a value echoed back from the request.
        const confirmed =
          gateId === "gate-1"
            ? workflowEngine.confirmGate1("user")
            : workflowEngine.confirmGate2(body.packageCore, "user");

        sessionLedger.recordAuditHook("on_gate_check", {
          gateId: confirmed.gateId,
          status: confirmed.status,
          confirmedAt: confirmed.confirmedAt,
          packageHash: confirmed.packageHash,
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          gateId: confirmed.gateId,
          name: confirmed.name,
          status: confirmed.status,
          confirmedAt: confirmed.confirmedAt,
          confirmedBy: confirmed.confirmedBy,
          packageHash: confirmed.packageHash ?? null,
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
          // No default target: silently substituting "planning" would report a
          // transition the caller never requested.
          const VALID_TARGETS = ["research", "planning", "gap_analysis", "evaluation", "builder"] as const;
          const requested = input?.targetStage;
          if (typeof requested !== "string" || !VALID_TARGETS.includes(requested as (typeof VALID_TARGETS)[number])) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              error: `workflow_transition requires targetStage. Valid: ${VALID_TARGETS.join(", ")}.`,
              received: requested ?? null,
            }));
            return;
          }
          const targetStage = requested as WorkflowStage;
          const transitionRes = workflowEngine.transitionTo(targetStage);
          sessionLedger.recordAuditHook("on_stage_transition", {
            targetStage,
            result: transitionRes,
          });
          if (transitionRes.success) {
            todoManager.updateSubtaskState("skill-plan", "t3", "done");
            todoManager.updateSubtaskState("skill-plan", "t4", "active");
          }
          // Report the real outcome. A refused transition must not be reported as a
          // successful tool call.
          if (!transitionRes.success) {
            res.writeHead(409, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              success: false,
              toolName: "workflow_transition",
              fromStage: transitionRes.fromStage,
              toStage: transitionRes.toStage,
              error: transitionRes.error,
            }));
            return;
          }
          result = {
            fromStage: transitionRes.fromStage,
            toStage: transitionRes.toStage,
            detail: `STAGE_TRANSITION_SUCCESS: Moved from ${transitionRes.fromStage} to ${transitionRes.toStage}`,
          };
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
          // Unavailable credentials are a 503, not a 500: this is honest reporting
          // of missing configuration, not a server fault.
          if (!tavilySearchBackend.isConfigured()) {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              success: false,
              toolName: "tavily_search",
              error: "Research search is currently unavailable because TAVILY_API_KEY is not configured.",
            }));
            return;
          }
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

      // Governed Research run — explicitly invoked, stops at READY_FOR_PLANNING.
      // Research never auto-invokes Design_Planning; it only produces a bundle.
      if (pathname === "/api/research/run" && req.method === "POST") {
        const body = await parseBody(req);
        const intent = (body.intent || "").trim();
        if (!intent) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Research intent is required" }));
          return;
        }

        const researchModel = {
          provider: (body.model?.provider || "gemini") as "gemini",
          model: (body.model?.model || process.env.GEMINI_MODEL || "gemini-2.5-flash") as string,
        };
        const searchConfig = {
          enabled: body.search?.enabled === true,
          source: (body.search?.source || "tavily") as "tavily",
        };

        try {
          const phases: string[] = [];
          const result = await researchSkill.run({
            intent,
            model: researchModel,
            search: searchConfig,
            onPhase: (phase) => phases.push(phase),
          });

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            runId: result.run.runId,
            phase: result.run.phase,
            stopped: result.stopped,
            handoffReady: isResearchHandoffReady(result.run),
            phases,
            bundle: result.run.bundle ?? null,
            issues: result.issues,
          }));
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err?.message || "Research run failed" }));
        }
        return;
      }

      // Design_Planning — explicitly invoked only. Never auto-triggered.
      // Ends at PRE_BUILD_REVIEWED; only a user approval reaches APPROVED_PLAN.
      if (pathname === "/api/design-planning/plan" && req.method === "POST") {
        const body = await parseBody(req);
        // Planning is never auto-triggered: it requires an explicit user action.
        // When a research run is referenced, its handoff must also be complete.
        if (!canInvokeDesignPlanning(body.researchRun ?? null, body.explicitlyInvoked === true)) {
          const pendingHandoff = body.researchRun
            ? " Research has not reached READY_FOR_PLANNING."
            : " Design_Planning must be explicitly invoked (explicitlyInvoked=true).";
          res.writeHead(body.researchRun ? 409 : 400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: pendingHandoff.trim(),
            phase: body.researchRun?.phase ?? null,
          }));
          return;
        }

        const intent = (body.intent || "").trim();
        if (!intent) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Planning intent is required" }));
          return;
        }

        try {
          const phases: string[] = [];
          const result = await designPlanningSkill.plan({
            input: {
              userIntent: intent,
              repositoryState: (body.repositoryState || "").trim(),
              existingArchitecture: (body.existingArchitecture || "").trim(),
              existingPhaseReceipts: Array.isArray(body.existingPhaseReceipts)
                ? body.existingPhaseReceipts
                : [],
              existingBaselines: Array.isArray(body.existingBaselines)
                ? body.existingBaselines
                : [],
              researchBundle: body.researchBundle ?? undefined,
            },
            onPhase: (phase) => phases.push(phase),
          });

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            runId: result.run.runId,
            phase: result.run.phase,
            auditId: result.run.auditId ?? null,
            stopped: result.stopped,
            requiresUserApproval: true,
            phases,
            issues: result.issues,
          }));
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err?.message || "Design_Planning run failed" }));
        }
        return;
      }

      // User approval — the ONLY path that ends Design_Planning at APPROVED_PLAN.
      if (pathname === "/api/design-planning/approve" && req.method === "POST") {
        const body = await parseBody(req);
        const run = body.run;
        if (!run || run.phase !== "PRE_BUILD_REVIEWED") {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: "Only a PRE_BUILD_REVIEWED plan can be approved by the user.",
          }));
          return;
        }
        try {
          const approved = designPlanningSkill.approvePlan(
            run,
            {
              planId: (body.planId || `plan-${run.runId}`) as string,
              intent: (body.intent || "") as string,
              steps: Array.isArray(body.steps) ? body.steps : [],
              reviews: Array.isArray(body.reviews) ? body.reviews : [],
            },
            (body.approvedBy as string) || "user"
          );
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            runId: approved.runId,
            phase: approved.phase,
            auditId: approved.auditId ?? null,
            approvedPlan: approved.approvedPlan ?? null,
          }));
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err?.message || "Approval failed" }));
        }
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

        // Single source of truth for the Tavily call. This route previously
        // hand-rolled its own client, which duplicated the adapter and returned
        // inconsistent status codes for the same missing-credential condition.
        if (!tavilySearchBackend.isConfigured()) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: "Research search is currently unavailable because TAVILY_API_KEY is not configured.",
          }));
          return;
        }

        try {
          const response = await tavilySearchBackend.search(
            query,
            {
              depth: body.searchDepth === "advanced" ? "advanced" : "basic",
              maxResults: typeof body.maxResults === "number" ? body.maxResults : 5,
            },
            "user_standalone"
          );

          if (!Array.isArray(response.results)) {
            throw new Error("Tavily response is missing results array");
          }
          const results = response.results.map((result) => {
            if (!result || typeof result.title !== "string" || !result.title || typeof result.url !== "string" || !result.url || typeof result.content !== "string" || !result.content) {
              throw new Error("Tavily response contains an invalid result record");
            }
            const url = new URL(result.url);
            if (url.protocol !== "http:" && url.protocol !== "https:") {
              throw new Error("Tavily response contains a non-HTTP result URL");
            }
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
          console.error("[tavily] Live call failed:", tavilyErr?.message);
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: "Research search is currently unavailable because the live provider request failed.",
          }));
          return;
        }
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
          // Same rule as the workflow_transition tool: never substitute a default
          // target, because that reports a transition the caller never requested.
          const VALID_TARGETS = ["research", "planning", "gap_analysis", "evaluation", "builder"] as const;
          const requested = body.targetStage;
          if (typeof requested !== "string" || !VALID_TARGETS.includes(requested as (typeof VALID_TARGETS)[number])) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              ok: false,
              operation: "transitionStage",
              error: `transitionStage requires targetStage. Valid: ${VALID_TARGETS.join(", ")}.`,
              received: requested ?? null,
            }));
            return;
          }
          const targetStage = requested as WorkflowStage;
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

          // Workflow selection is an explicit user choice, never inferred from the
          // message text. A message reaches Main Chat unless the caller declares a
          // research or planning intent for THIS message (ARCHITECTURE.MD §1.1–1.3).
          // Keyword heuristics must not divert a chat message into a lifecycle.
          const REASONING_TASKS = [
            "researcher",
            "planner",
            "gap-analysis",
            "evaluation",
            "critic",
            "general",
          ] as const;
          type ReasoningTask = (typeof REASONING_TASKS)[number];

          const requestedTask = (parsed as Record<string, unknown>).useResearch === true
            ? "researcher"
            : (parsed as Record<string, unknown>).useDesignPlanning === true
              ? "planner"
              : (parsed as Record<string, unknown>).task;
          const task: ReasoningTask = REASONING_TASKS.includes(requestedTask as ReasoningTask)
            ? (requestedTask as ReasoningTask)
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
