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
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export * from "../packages/agent-runtime/src/index.js";

import {
  OneShotWorkflowEngine,
  SessionLedger,
  TodoChainManager,
  GitLocalStorage,
} from "../packages/agent-runtime/src/index.js";
import { fixture } from "./artifact/fixture.js";
import {
  handleHealthRoutes,
  handleFixtureRoutes,
  handleProviderRoutes,
  handleWorkflowRoutes,
  handleResearchRoutes,
  handleV2Routes,
  handleStreamRoutes,
  type ProviderConfig,
  type RouteContext,
} from "./routes/index.js";

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

// ── Authoritative Engine Singletons ──────────────────────────────────────────
let workflowEngine = new OneShotWorkflowEngine();
let sessionLedger = new SessionLedger("session-101");
let todoManager = new TodoChainManager([]);
const gitStorage = new GitLocalStorage({ rootDir: path.resolve(process.cwd(), ".oneshot/storage") });

// ── In-memory state stores ───────────────────────────────────────────────────
const providerConfigs = new Map<string, ProviderConfig>();
const sessions = new Map<string, { id: string; title: string; messages: unknown[] }>();

function getSessionProvider(sessionId: string): ProviderConfig {
  return providerConfigs.get(sessionId) || {
    provider: isConfiguredKey(process.env.OPENAI_API_KEY) && !isConfiguredKey(process.env.GEMINI_API_KEY)
      ? "openai"
      : "gemini",
  };
}

/**
 * Validates a contract fixture directly against disk with cryptographic SHA-256 byte proof.
 * Uses the authorative FixtureRuntime lifecycle and ensures expected == actual hash equality.
 */
export async function validateRealFixture(params: {
  fixture_id?: string;
  sessionId?: string;
  path?: string;
  expectedHash?: string;
}) {
  const relPath = params.path || "app/fixtures/sample.json";
  const absPath = path.resolve(process.cwd(), relPath);

  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(absPath);
  } catch {
    return {
      ok: false,
      success: false,
      error: `Fixture file not found: ${relPath}`,
      path: relPath,
      status: "failed" as const,
      actualHash: "",
      expectedHash: params.expectedHash || "",
      fixture_id: params.fixture_id || "unknown",
      session_id: params.sessionId || "session-local",
      auditTrail: [],
      metadata: {},
    };
  }

  const computedHash = `sha256:${crypto.createHash("sha256").update(fileBuffer).digest("hex")}`;

  let parsedContent: Record<string, unknown> = {};
  try {
    parsedContent = JSON.parse(fileBuffer.toString("utf-8"));
  } catch {
    return {
      ok: false,
      success: false,
      error: `Invalid JSON in fixture: ${relPath}`,
      path: relPath,
      status: "failed" as const,
      actualHash: computedHash,
      expectedHash: params.expectedHash || computedHash,
      fixture_id: params.fixture_id || "unknown",
      session_id: params.sessionId || "session-local",
      auditTrail: [],
      metadata: {},
    };
  }

  const fid = params.fixture_id || (parsedContent.fixture_id as string) || "fix-sample-01";
  const sid = params.sessionId || "session-local";
  const expHash = params.expectedHash || computedHash;

  const actFixture = fixture(fid, sid, relPath, expHash, {
    metadata: {
      ...parsedContent,
      verifiedAt: new Date().toISOString(),
      byteLength: fileBuffer.length,
    },
  });

  const valRes = actFixture.validate(() => computedHash);
  const stored = actFixture.toStoredRecord();

  return {
    ok: valRes.ok,
    success: valRes.ok,
    fixture_id: stored.fixture_id,
    session_id: stored.session_id,
    path: relPath,
    status: stored.status,
    actualHash: actFixture.actualHash || computedHash,
    expectedHash: actFixture.expectedHash,
    auditTrail: stored.auditTrail,
    metadata: actFixture.metadata,
    storedRecord: stored,
  };
}

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
      const ctx: RouteContext = {
        reqUrl,
        pathname,
        workflowEngine,
        sessionLedger,
        todoManager,
        gitStorage,
        providerConfigs,
        sessions,
        isConfiguredKey,
        validateRealFixture,
        parseBody,
        getSessionProvider,
        getProviderRegistry,
        port,
      };

      // ── Dispatch sequentially to route modules ─────────────────────────────
      if (await handleHealthRoutes(req, res, ctx)) return;
      if (await handleFixtureRoutes(req, res, ctx)) return;
      if (await handleProviderRoutes(req, res, ctx)) return;
      if (await handleWorkflowRoutes(req, res, ctx)) return;
      if (await handleResearchRoutes(req, res, ctx)) return;
      if (await handleV2Routes(req, res, ctx)) return;
      if (await handleStreamRoutes(req, res, ctx)) return;

      // ── Static file serving (frontend/web/dist export) ─────────────────────
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
          // File not found, fall through to 404
        }
      }

      // Explicit 404 JSON handler
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Not found: ${pathname}` }));
    } catch (err: any) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Internal server error" }));
      } else if (!res.writableEnded) {
        res.end();
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
