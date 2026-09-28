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
  getConfig,
  resolveContainedPath,
  PathContainmentError,
} from "../packages/agent-runtime/src/index.js";
import {
  SlidingWindowRateLimiter,
  applySecurityHeaders,
  parseJsonBody,
  checkAuthentication,
} from "./middleware/index.js";
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

/**
 * Environment variable that carries each provider's credential.
 * Kept local so session defaulting does not depend on preset ordering.
 */
const PROVIDER_ENV_KEY: Record<ProviderConfig["provider"], string> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  nebius: "NEBIUS_API_KEY",
  ollama: "OLLAMA_API_KEY",
  tavily: "TAVILY_API_KEY",
};

/** Provider preference: config.toml's default first, then remaining providers. */
function providerPreferenceOrder(): ProviderConfig["provider"][] {
  const configured = getConfig()?.models?.default_provider as ProviderConfig["provider"] | undefined;
  const rest: ProviderConfig["provider"][] = ["mistral", "gemini", "openai", "nebius"];
  return configured ? [configured, ...rest.filter((p) => p !== configured)] : rest;
}

/**
 * Resolves the provider for a session: an explicit per-session override wins,
 * otherwise the first provider with a genuinely configured credential is used,
 * in config.toml preference order.
 *
 * Previously this only ever considered OPENAI/GEMINI and ignored both
 * MISTRAL_API_KEY and config.toml's `default_provider`, so a deployment with
 * only a Mistral credential silently fell back to the local reasoner even
 * though a working provider was configured.
 */
function getSessionProvider(sessionId: string): ProviderConfig {
  const override = providerConfigs.get(sessionId);
  if (override) return override;

  for (const provider of providerPreferenceOrder()) {
    const envKey = PROVIDER_ENV_KEY[provider];
    if (envKey && isConfiguredKey(process.env[envKey])) {
      return { provider };
    }
  }

  return { provider: providerPreferenceOrder()[0] ?? "gemini" };
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

  // Containment boundary: a request-supplied path may only address files inside
  // the fixtures directory. Previously this was `path.resolve(cwd, relPath)`,
  // which let any JSON file on the host be read back through the API.
  const fixturesRoot = path.resolve(process.cwd(), "app/fixtures");
  const normalizedInput = relPath.replace(/\\/g, "/").replace(/^\.?\/+/, "");
  const withoutPrefix = normalizedInput.replace(/^app\/fixtures\/?/, "");

  let absPath: string;
  try {
    absPath = resolveContainedPath(fixturesRoot, withoutPrefix);
  } catch (error) {
    if (error instanceof PathContainmentError) {
      return {
        ok: false,
        success: false,
        error: "Fixture path is not permitted: it must resolve inside app/fixtures.",
        path: relPath,
        status: "rejected" as const,
        actualHash: "",
        expectedHash: params.expectedHash || "",
        fixture_id: params.fixture_id || "unknown",
        session_id: params.sessionId || "session-local",
        auditTrail: [],
        metadata: {},
      };
    }
    throw error;
  }

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
  const config = getConfig();
  return parseJsonBody(req, {
    maxBytes: config.server?.request_max_bytes,
    timeoutMs: config.server?.body_timeout_ms,
  });
}

/**
 * Provider Registry — lists available auth and model providers
 * Enriched dynamically with config.toml multi-index providers
 */
function getProviderRegistry() {
  const config = getConfig();
  const modelsMap: Record<string, { id: string; models: string[]; priority?: number; fallback?: string }> = {
    mistral: {
      id: "mistral",
      models: ["ministral-8b-latest", "codestral-latest", "open-mistral-nemo", "ministral-3b-latest", "open-mistral-7b", "pixtral-12b-2409", "mistral-large-latest", "mistral-small-latest", "mistral-medium-latest"],
    },
    gemini: {
      id: "gemini",
      models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    },
    openai: {
      id: "openai",
      models: ["gpt-4o", "gpt-4o-mini", "gpt-5", "gpt-5-mini"],
    },
    nebius: {
      id: "nebius",
      models: ["moonshotai/Kimi-K2.5", "deepseek-ai/DeepSeek-R1-0528"],
    },
    ollama: {
      id: "ollama",
      models: ["llama3.2", "mistral", "deepseek-r1", "phi3"],
    },
  };

  if (config?.models?.providers?.length) {
    for (const p of config.models.providers) {
      modelsMap[p.name] = {
        id: p.name,
        models: p.models,
        priority: p.priority,
        fallback: p.fallback,
      };
    }
  }

  return {
    auth: {
      gemini: { id: "gemini", name: "Google (Gemini)" },
      mistral: { id: "mistral", name: "Mistral AI (Test Preset)" },
    },
    models: modelsMap,
  };
}

export function startAgentServer(options: ServerOptions = {}): Promise<http.Server> {
  const config = getConfig();
  const port = options.port ?? Number(process.env.PORT || config.server?.port || 8787);
  const host = options.host ?? (process.env.HOST || config.server?.host || "0.0.0.0");
  const rateLimiter = new SlidingWindowRateLimiter(config.security?.rate_limiting);

  const server = http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    res.setHeader("X-Request-Id", requestId);

    const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(reqUrl.pathname);

    // 1. Security Headers & CORS Guard
    const continuePipeline = applySecurityHeaders(req, res, {
      ...config.security?.headers,
      allowedOrigins: config.server?.cors_allowed_origins,
    });
    if (!continuePipeline) return;

    // 2. Sliding-Window Rate Limiter
    const rateLimit = rateLimiter.checkLimit(rateLimiter.getClientKey(req));
    res.setHeader("X-RateLimit-Limit", rateLimit.limit.toString());
    res.setHeader("X-RateLimit-Remaining", rateLimit.remaining.toString());
    res.setHeader("X-RateLimit-Reset", rateLimit.resetSeconds.toString());
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", rateLimit.resetSeconds.toString());
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Rate limit exceeded. Please retry later.", requestId }));
      return;
    }

    // 3. Authentication Guard
    if (!checkAuthentication(req, res, pathname, config.security?.auth)) {
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
        config,
        requestId,
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
      const statusCode = err.statusCode || (err.name === "PayloadTooLargeError" ? 413 : 500);
      if (!res.headersSent) {
        res.writeHead(statusCode, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Internal server error", requestId }));
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
