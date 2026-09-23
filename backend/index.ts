/**
 * OneShot Agent Runtime — Production Backend
 * Real Strands SDK agent, provider switching, session persistence, AG-UI SSE streaming
 */

// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config({ path: "app/env/.env" });

import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

export * from "../packages/agent-runtime/src/index.js";

import {
  createMainAgent,
  createLiveModel,
} from "../packages/agent-runtime/src/index.js";
import { streamStrandsToAgUi, formatAgUiSse } from "../packages/agent-runtime/src/ag-ui/server-adapter.js";
import { SessionLedger } from "../packages/agent-runtime/src/session/session-ledger.js";
import { oauthManager } from "./oauth.js";

export interface ServerOptions {
  port?: number;
  host?: string;
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
    provider: process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY ? "openai" : "gemini",
  };
}

// ── Global SessionLedger (shared across requests) ────────────────────────────
const ledger = new SessionLedger("global");

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
    },
    models: {
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
    },
  };
}

export function startAgentServer(options: ServerOptions = {}): Promise<http.Server> {
  const port = options.port ?? Number(process.env.PORT || 8080);
  const host = options.host ?? (process.env.HOST || "0.0.0.0");

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = reqUrl.pathname;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-Id");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // Health check
      if ((pathname === "/api/health" || pathname === "/health" || pathname === "/ping") && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "healthy", ok: true, version: "1.3.0" }));
        return;
      }

      // Simple network test
      if (pathname === "/api/network/test" && req.method === "GET") {
        const results: Record<string, any> = {};
        const TIMEOUT = 5000; // 5 seconds
        
        // Test Gemini API
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
          
          const geminiResponse = await fetch("https://generativelanguage.googleapis.com", {
            signal: controller.signal,
            method: "HEAD"
          });
          
          clearTimeout(timeoutId);
          results.gemini = {
            reachable: true,
            status: geminiResponse.status,
            url: "https://generativelanguage.googleapis.com"
          };
        } catch (error: any) {
          results.gemini = {
            reachable: false,
            error: error.name === "AbortError" ? "Timeout" : error.message,
            url: "https://generativelanguage.googleapis.com"
          };
        }

        // Test OpenAI API
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
          
          const openaiResponse = await fetch("https://api.openai.com", {
            signal: controller.signal,
            method: "HEAD"
          });
          
          clearTimeout(timeoutId);
          results.openai = {
            reachable: true,
            status: openaiResponse.status,
            url: "https://api.openai.com"
          };
        } catch (error: any) {
          results.openai = {
            reachable: false,
            error: error.name === "AbortError" ? "Timeout" : error.message,
            url: "https://api.openai.com"
          };
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ network: results, timestamp: new Date().toISOString() }));
        return;
      }

      // Provider status - Real connectivity check
      if (pathname === "/api/providers/status" && req.method === "GET") {
        const status: Record<string, any> = {};
        
        // Check Gemini
        if (process.env.GEMINI_API_KEY) {
          try {
            const testStart = Date.now();
            // Make lightweight test request
            const testModel = createLiveModel({
              apiKey: process.env.GEMINI_API_KEY,
              modelId: "gemini-2.5-flash"
            });
            const testAgent = createMainAgent({ model: testModel });
            
            // Quick test with 5-token response
            let testPassed = false;
            for await (const event of testAgent.stream("Say OK")) {
              const raw = (event as unknown) as Record<string, unknown>;
              if (raw.text || raw.data || raw.content) {
                testPassed = true;
                break; // Got response, stop immediately
              }
            }
            
            status.gemini = {
              configured: true,
              available: testPassed,
              latency: Date.now() - testStart,
              model: "gemini-2.5-flash",
              tested: true
            };
          } catch (err: any) {
            status.gemini = {
              configured: true,
              available: false,
              error: err.message,
              tested: true
            };
          }
        } else {
          status.gemini = {
            configured: false,
            available: false,
            error: "API key not configured",
            tested: false
          };
        }
        
        // Check OpenAI
        if (process.env.OPENAI_API_KEY) {
          try {
            const testStart = Date.now();
            const testModel = createLiveModel({
              apiKey: process.env.OPENAI_API_KEY,
              modelId: "gpt-4o-mini"
            });
            const testAgent = createMainAgent({ model: testModel });
            
            let testPassed = false;
            for await (const event of testAgent.stream("Say OK")) {
              const raw = (event as unknown) as Record<string, unknown>;
              if (raw.text || raw.data || raw.content) {
                testPassed = true;
                break;
              }
            }
            
            status.openai = {
              configured: true,
              available: testPassed,
              latency: Date.now() - testStart,
              model: "gpt-4o-mini",
              tested: true
            };
          } catch (err: any) {
            status.openai = {
              configured: true,
              available: false,
              error: err.message,
              tested: true
            };
          }
        } else {
          status.openai = {
            configured: false,
            available: false,
            error: "API key not configured",
            tested: false
          };
        }
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(status));
        return;
      }

      // System status — real data from SessionLedger
      if (pathname === "/api/system/status" && req.method === "GET") {
        const checkpoints = ledger.getAllCheckpoints();
        const auditLogs = ledger.getAuditHookLogs();
        const uptimeSeconds = Math.round((Date.now() - ((global as any).startTime || Date.now())) / 1000);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "healthy",
          currentStage: "research",
          gate1: false,
          gate2: false,
          checkpointsCount: checkpoints.length,
          auditLogsCount: auditLogs.length,
          uptimeSeconds,
          activeSessions: sessions.size,
          providers: {
            gemini: Boolean(process.env.GEMINI_API_KEY),
            openai: Boolean(process.env.OPENAI_API_KEY),
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

      // Provider config — runtime switching (per session)
      if (pathname === "/api/config/provider" && req.method === "POST") {
        const body = await parseBody(req);
        const sessionId = (req.headers["x-session-id"] as string) || "default";
        const { provider, model, apiKey, baseUrl } = body;

        const valid = ["gemini", "openai", "nebius"];
        if (!valid.includes(provider)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Invalid provider. Valid: ${valid.join(", ")}` }));
          return;
        }

        // Determine which API key to use
        const resolvedKey = apiKey ||
          (provider === "gemini" ? process.env.GEMINI_API_KEY :
           provider === "openai" ? process.env.OPENAI_API_KEY :
           process.env.NEBIUS_API_KEY) || "";

        if (!resolvedKey) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: `No API key for provider "${provider}". Set ${provider.toUpperCase()}_API_KEY in app/env/.env or pass apiKey in request.`,
          }));
          return;
        }

        providerConfigs.set(sessionId, { provider, model, apiKey: resolvedKey, baseUrl });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          sessionId,
          provider,
          model: model || `(default for ${provider})`,
        }));
        return;
      }

      // Provider configure (used by ProviderConfigModal — saves key to runtime session)
      if (pathname === "/api/providers/configure" && req.method === "POST") {
        const body = await parseBody(req);
        const sessionId = (req.headers["x-session-id"] as string) || "default";
        const { provider, apiKey, model } = body;

        if (!apiKey || !provider) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "provider and apiKey are required" }));
          return;
        }

        providerConfigs.set(sessionId, { provider, apiKey, model });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, provider, model }));
        return;
      }

      // OAuth: Initiate login (get redirect URI)
      if (pathname === "/api/auth/google/init" && req.method === "GET") {
        const state = oauthManager.generateStateToken();
        const { challenge } = oauthManager.generatePKCE();
        
        // In production, build real Google OAuth redirect URL
        const redirectUri = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${process.env.GOOGLE_OAUTH_CLIENT_ID || "YOUR_CLIENT_ID"}` +
          `&redirect_uri=${encodeURIComponent(process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:8080/auth/callback")}` +
          `&response_type=code&scope=${encodeURIComponent("openid profile email")}` +
          `&state=${state}` +
          `&code_challenge=${challenge}` +
          `&code_challenge_method=S256`;

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ redirectUri, state }));
        return;
      }

      // OAuth: Handle callback (exchange code for session)
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

      // OAuth: Check session status
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

      // OAuth: Logout (revoke token and destroy session)
      if (pathname === "/api/auth/google/logout" && req.method === "POST") {
        const sessionId = (req.headers["x-session-id"] as string) || "";
        
        if (sessionId) {
          await oauthManager.destroySession(sessionId);
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "Logged out successfully" }));
        return;
      }

      // === SESSION ENDPOINTS (backed by SessionLedger) ===

      if (pathname === "/api/session/checkpoints" && req.method === "GET") {
        const checkpoints = ledger.getAllCheckpoints();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ checkpoints }));
        return;
      }

      if (pathname === "/api/session/new" && req.method === "POST") {
        const sessionId = `session-${Date.now().toString().slice(-6)}`;
        sessions.set(sessionId, { id: sessionId, title: "New chat", messages: [] });
        ledger.createCheckpoint({
          restoreId: `${sessionId}-init`,
          timestamp: new Date().toISOString(),
          title: "Session started",
          agent: "OneShot",
          category: "Session",
          payload: { sessionId },
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ sessionId }));
        return;
      }

      if (pathname === "/api/session/clear" && req.method === "POST") {
        const body = await parseBody(req);
        const { sessionId } = body;
        if (sessionId && sessions.has(sessionId)) {
          sessions.get(sessionId)!.messages = [];
          ledger.recordAuditHook("on_stage_transition", { action: "session_cleared", sessionId });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "cleared" }));
        return;
      }

      if (pathname === "/api/pipeline/plan" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "CONFIRMED", title: "Pipeline" }));
        return;
      }

      if (pathname === "/api/pipeline/gate/confirm" && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "CONFIRMED" }));
        return;
      }

      if (pathname === "/api/tools/execute" && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ result: "executed", status: "success" }));
        return;
      }

      if ((pathname === "/invocations" || pathname === "/api/agent/stream") && req.method === "POST") {
        const parsed = await parseBody(req);
        const prompt = parsed.prompt || (parsed.messages?.[parsed.messages.length - 1]?.content) || "";
        const sessionId = (req.headers["x-session-id"] as string) || "default";

        if (!prompt) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing prompt" }));
          return;
        }

        // Resolve provider: request body > session config > environment
        const sessionCfg = getSessionProvider(sessionId);
        const resolvedProvider = parsed.provider || sessionCfg.provider;
        const resolvedModel = parsed.model || sessionCfg.model ||
          (resolvedProvider === "gemini" ? process.env.GEMINI_MODEL || "gemini-2.5-flash" :
           resolvedProvider === "openai" ? process.env.OPENAI_MODEL || "gpt-4o-mini" :
           "moonshotai/Kimi-K2.5");
        const resolvedBaseUrl = sessionCfg.baseUrl ||
          (resolvedProvider === "nebius" ? "https://api.studio.nebius.com/v1/" :
           resolvedProvider === "openai" ? process.env.OPENAI_BASE_URL || "" : "");

        // Resolve API key: session config > environment
        const resolvedKey =
          sessionCfg.apiKey ||
          (resolvedProvider === "gemini" ? process.env.GEMINI_API_KEY :
           resolvedProvider === "openai" ? process.env.OPENAI_API_KEY :
           process.env.NEBIUS_API_KEY) || "";

        if (!resolvedKey) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: `No API key for provider "${resolvedProvider}". Add ${resolvedProvider.toUpperCase()}_API_KEY to app/env/.env`,
          }));
          return;
        }

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        });

        const ac = new AbortController();
        req.on("close", () => ac.abort());

        try {
          const liveModel = createLiveModel({
            apiKey: resolvedKey,
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

      // Try to serve static files before 404
      if (req.method === 'GET' && !pathname.startsWith('/api')) {
        const fs = await import('node:fs/promises');
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const staticRoot = path.resolve(__dirname, '..', '..', 'frontend', 'web', 'dist');
        let filePath = path.resolve(staticRoot, pathname === '/' ? 'index.html' : pathname.slice(1));
        
        if (filePath.startsWith(staticRoot)) {
          try {
            const content = await fs.readFile(filePath);
            let contentType = 'text/html';
            if (filePath.endsWith('.js')) contentType = 'application/javascript; charset=utf-8';
            else if (filePath.endsWith('.css')) contentType = 'text/css; charset=utf-8';
            else if (filePath.endsWith('.json')) contentType = 'application/json';
            else if (filePath.endsWith('.svg')) contentType = 'image/svg+xml';
            else if (filePath.endsWith('.png')) contentType = 'image/png';
            else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) contentType = 'image/jpeg';
            
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
            return;
          } catch (e) {
            // File not found, fall through to 404
          }
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

  return new Promise((resolve) => {
    (global as any).startTime = Date.now();
    server.listen(port, host, () => {
      console.log(`[OneShot] Listening on http://${host}:${port}`);
      console.log(`Provider: ${process.env.GEMINI_API_KEY ? "Gemini" : process.env.OPENAI_API_KEY ? "OpenAI" : "NONE"}`);
      console.log(`OAuth providers: ${process.env.GOOGLE_OAUTH_CLIENT_ID ? "Google" : "NONE (set GOOGLE_OAUTH_CLIENT_ID)"}`);
      resolve(server);
    });
  });
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile && (currentFile === invokedFile || invokedFile.endsWith("backend/index.ts"))) {
  startAgentServer().catch((err) => {
    console.error("[Error]", err);
    process.exit(1);
  });
}



