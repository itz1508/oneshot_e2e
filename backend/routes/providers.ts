import http from "node:http";
import { createLiveModel, createMainAgent, tavilySearchBackend } from "../../packages/agent-runtime/src/index.js";
import { oauthManager } from "../oauth.js";
import { ProviderService } from "../services/provider-service.js";
import { sendJson, sendError } from "./helpers.js";
import type { RouteHandler } from "./types.js";

// ── Local Ollama install state (Option B sidecar / host daemon) ──────────
// The browser must never learn the Ollama URL: in Docker the sidecar is on
// compose DNS (`ollama:11434`), on the host it is `localhost:11434`. Both
// endpoints below resolve the URL server-side and proxy daemon responses.

function resolveOllamaBase(): string {
  const raw = (process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1").trim();
  return raw.replace(/\/v1\/?$/, "").replace(/\/$/, "");
}

let ollamaInstalling: string | null = null;

/** Model names are allowlisted: registry path + tag, nothing else. */
function sanitizeOllamaModel(model: unknown): string | null {
  if (typeof model !== "string") return null;
  const name = model.trim();
  if (!name || name.length > 120) return null;
  if (!/^[A-Za-z0-9._/:@-]+$/.test(name)) return null;
  if (name.includes("..") || name.startsWith("/") || name.startsWith("-")) return null;
  return name;
}

async function fetchOllamaTags(base: string): Promise<string[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${base}/api/tags`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    if (!Array.isArray(data.models)) return [];
    return data.models
      .map((m) => (typeof m?.name === "string" ? m.name : ""))
      .filter((n) => n.length > 0);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}


// Event-shape-tolerant text detector used by every provider availability probe.
//
// A probe must answer "did the provider actually return model output?" — so it
// has to recognise the event shapes the installed Strands SDK really emits.
// Checking only a top-level `text`/`data`/`content` field reports every working
// provider as unavailable, because output arrives nested:
//   { type: "modelStreamUpdateEvent",
//     event: { type: "modelContentBlockDeltaEvent",
//              delta: { type: "textDelta", text } } }
// and, once complete, as a `modelMessageEvent` / `contentBlockEvent` message.
export function eventHasText(event: unknown): boolean {
  const raw = (event ?? {}) as Record<string, unknown>;

  if (typeof raw.text === "string" && raw.text) return true;
  if (typeof raw.data === "string" && raw.data) return true;

  const nested = (raw.event ?? {}) as Record<string, unknown>;
  if (nested.type === "modelContentBlockDeltaEvent") {
    const delta = (nested.delta ?? {}) as Record<string, unknown>;
    if (delta.type === "textDelta" && typeof delta.text === "string" && delta.text) return true;
  }

  // Completed assistant message.
  const message = (raw.message ?? {}) as Record<string, unknown>;
  if (Array.isArray(message.content)) {
    const hasText = message.content.some(
      (block) => block && typeof block === "object" && typeof (block as Record<string, unknown>).text === "string"
    );
    if (hasText) return true;
  }

  const contentBlock = (raw.contentBlock ?? {}) as Record<string, unknown>;
  if (typeof contentBlock.text === "string" && contentBlock.text) return true;

  return false;
}

export const handleProviderRoutes: RouteHandler = async (req, res, ctx) => {
  const {
    pathname,
    parseBody,
    isConfiguredKey,
    providerConfigs,
    sessions,
    workflowEngine,
    sessionLedger,
    getProviderRegistry,
    port,
  } = ctx;

  // ── Local Ollama install state ───────────────────────────────────────
  // GET /api/ollama/status → { available, installed, models, installing }
  // `installed` means THIS model tag is on disk. Never 503s: an unreachable
  // daemon is a state (`available:false`), not a server fault.
  if (pathname === "/api/ollama/status" && req.method === "GET") {
    const base = resolveOllamaBase();
    const wanted = (process.env.OLLAMA_MODEL || "gemma4:31b").trim();
    const models = await fetchOllamaTags(base);
    if (models === null) {
      return sendJson(res, 200, {
        available: false,
        installed: false,
        models: [],
        installing: ollamaInstalling,
        error: `Ollama daemon unreachable at server-side OLLAMA_BASE_URL (${base}). Start it (host) or enable the compose profile: docker compose --profile local-llm up.`,
      });
    }
    return sendJson(res, 200, {
      available: true,
      installed: models.some((m) => m === wanted || m.startsWith(`${wanted}:`)),
      models,
      installing: ollamaInstalling,
    });
  }

  // POST /api/ollama/pull { model } → NDJSON progress stream, proxied live
  // from `POST <ollama>/api/pull`. Single-flight: a second pull while one
  // runs gets 409, not a parallel 20 GB download.
  if (pathname === "/api/ollama/pull" && req.method === "POST") {
    const body = await parseBody(req);
    const model = sanitizeOllamaModel(body?.model ?? process.env.OLLAMA_MODEL ?? "gemma4:31b");
    if (!model) {
      return sendError(res, 400, "Invalid model name");
    }
    if (ollamaInstalling) {
      return sendError(res, 409, `Already pulling "${ollamaInstalling}"`);
    }
    const base = resolveOllamaBase();
    const target = new URL("/api/pull", base);
    const upstream = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const up = http.request(
        {
          hostname: target.hostname,
          port: Number(target.port) || 11434,
          path: "/api/pull",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          timeout: 10000,
        },
        resolve
      );
      up.on("error", reject);
      up.on("timeout", () => up.destroy(new Error("Ollama daemon unreachable")));
      up.end(JSON.stringify({ model, stream: true }));
    }).catch((err: Error) => sendError(res, 502, `Ollama daemon unreachable: ${err.message}`) as never);
    if (!upstream || upstream.statusCode !== 200) {
      upstream?.resume();
      return sendError(res, 502, `Ollama pull rejected (HTTP ${upstream?.statusCode ?? "?"})`);
    }
    ollamaInstalling = model;
    res.writeHead(200, { "Content-Type": "application/x-ndjson" });
    upstream.on("data", (chunk: Buffer) => {
      if (!res.writableEnded) res.write(chunk);
    });
    await new Promise<void>((done) => {
      upstream.on("end", done);
      upstream.on("error", done);
      (req as http.IncomingMessage).on("close", done);
    });
    ollamaInstalling = null;
    if (!res.writableEnded) res.end();
    return true;
  }

  // Provider status — checks configured status and test connectivity safely
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
          if (eventHasText(event)) {
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
          if (eventHasText(event)) {
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

    // Check Mistral — performs a REAL model invocation so that `available`
    // means "the provider actually answered", not "a credential-shaped string
    // exists". A key that is present but rejected upstream (e.g. a model that
    // is not in the account's subscription tier) must report available:false.
    const hasMistral = isConfiguredKey(process.env.MISTRAL_API_KEY);
    if (!hasMistral) {
      status.mistral = {
        configured: false,
        available: false,
        error: "API key not configured in environment",
        model: process.env.MISTRAL_MODEL || "ministral-8b-latest",
        endpoint: process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1",
        tested: false,
      };
    } else {
      try {
        const testStart = Date.now();
        const testModel = createLiveModel({
          provider: "mistral",
          apiKey: process.env.MISTRAL_API_KEY,
          modelId: process.env.MISTRAL_MODEL || "ministral-8b-latest",
        });
        const testAgent = createMainAgent({ model: testModel });

        let testPassed = false;
        for await (const event of testAgent.stream("Say OK")) {
          if (eventHasText(event)) {
            testPassed = true;
            break;
          }
        }

        status.mistral = {
          configured: true,
          available: testPassed,
          latency: Date.now() - testStart,
          model: process.env.MISTRAL_MODEL || "ministral-8b-latest",
          endpoint: process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1",
          tested: true,
          ...(testPassed ? {} : { error: "Provider did not return model output during the availability probe" }),
        };
      } catch (err: any) {
        status.mistral = {
          configured: true,
          available: false,
          error: err.message,
          model: process.env.MISTRAL_MODEL || "ministral-8b-latest",
          endpoint: process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1",
          tested: true,
        };
      }
    }

    // Check Nebius — same rule: unproven availability is never reported as true.
    const hasNebius = isConfiguredKey(process.env.NEBIUS_API_KEY);
    status.nebius = {
      configured: hasNebius,
      available: false,
      latency: 0,
      model: process.env.NEBIUS_MODEL || "meta-llama/Meta-Llama-3.1-70B-Instruct",
      tested: false,
      ...(hasNebius
        ? { error: "Availability has not been proven by a real invocation for this provider" }
        : { error: "API key not configured in environment" }),
    };

    // Check Ollama — probed for real so `available` reflects an actual
    // round-trip. Ollama Cloud needs OLLAMA_API_KEY; a local server needs only
    // OLLAMA_BASE_URL.
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "https://ollama.com/v1";
    const ollamaModel = process.env.OLLAMA_MODEL || "gemma4:31b";
    const hasOllamaKey = isConfiguredKey(process.env.OLLAMA_API_KEY);
    if (!hasOllamaKey && !process.env.OLLAMA_BASE_URL) {
      status.ollama = {
        configured: false,
        available: false,
        endpoint: ollamaBaseUrl,
        model: ollamaModel,
        tested: false,
        error: "Set OLLAMA_API_KEY (Ollama Cloud) or OLLAMA_BASE_URL (local server)",
      };
    } else {
      const ollamaStart = Date.now();
      try {
        const testModel = createLiveModel({
          provider: "ollama",
          modelId: ollamaModel,
        });
        const testAgent = createMainAgent({ model: testModel });

        let ollamaPassed = false;
        for await (const event of testAgent.stream("Say OK")) {
          if (eventHasText(event)) {
            ollamaPassed = true;
            break;
          }
        }

        status.ollama = {
          configured: true,
          available: ollamaPassed,
          latency: Date.now() - ollamaStart,
          endpoint: ollamaBaseUrl,
          model: ollamaModel,
          tested: true,
          ...(ollamaPassed ? {} : { error: "Provider did not return model output during the availability probe" }),
        };
      } catch (err: any) {
        status.ollama = {
          configured: true,
          available: false,
          error: err.message,
          endpoint: ollamaBaseUrl,
          model: ollamaModel,
          tested: true,
        };
      }
    }

    // Check Tavily — probed for real when a key is present, so `available`
    // reflects an actual provider round-trip.
    const hasTavily = isConfiguredKey(process.env.TAVILY_API_KEY);
    if (!hasTavily) {
      status.tavily = {
        configured: false,
        available: false,
        tested: false,
        error: "API key not configured in environment",
      };
    } else {
      const testStart = Date.now();
      try {
        const probe = await tavilySearchBackend.search("OneShot availability probe", { maxResults: 1 }, "agent");
        const reached = Array.isArray(probe.results) && probe.results.length > 0;
        status.tavily = {
          configured: true,
          available: reached,
          latency: Date.now() - testStart,
          tested: true,
          ...(reached ? {} : { error: "Search provider returned no results during the availability probe" }),
        };
      } catch (err: any) {
        status.tavily = {
          configured: true,
          available: false,
          error: err.message,
          latency: Date.now() - testStart,
          tested: true,
        };
      }
    }

    return sendJson(res, 200, status);
  }

  // System status — authoritative engine & session state
  if (pathname === "/api/system/status" && req.method === "GET") {
    const summary = ProviderService.getWorkflowProviderSummary(
      workflowEngine,
      sessionLedger,
      sessions.size,
      isConfiguredKey
    );
    return sendJson(res, 200, summary);
  }

  // Provider registry
  if (pathname === "/api/integration/providers" && req.method === "GET") {
    return sendJson(res, 200, getProviderRegistry());
  }

  // Provider configure (saves key to runtime and persists to app/env/.env)
  if (pathname === "/api/providers/configure" && req.method === "POST") {
    const body = await parseBody(req);
    const sessionId = (req.headers["x-session-id"] as string) || "default";
    const { provider, apiKey, model } = body;

    const allowEnvFilePersistence =
      process.env.ONESHOT_ALLOW_ENV_FILE_WRITE === "1" || process.env.NODE_ENV !== "production";

    const configRes = await ProviderService.configureProvider({
      provider,
      apiKey,
      model,
      sessionId,
      providerConfigs,
      isConfiguredKey,
      persistEnv: allowEnvFilePersistence,
    });

    if (!configRes.ok) {
      return sendError(res, configRes.status, configRes.error || "Configuration failed");
    }

    const persisted = configRes.result!.persisted;
    return sendJson(res, 200, {
      ok: true,
      configured: true,
      provider,
      model: model || `(default for ${provider})`,
      persisted,
      message: persisted
        ? `Credentials for ${provider} active and persisted to app/env/.env.`
        : `Credentials for ${provider} active for this runtime only (file persistence disabled in production).`,
    });
  }

  // Provider config — runtime switching (per session)
  if (pathname === "/api/config/provider" && req.method === "POST") {
    const body = await parseBody(req);
    const sessionId = (req.headers["x-session-id"] as string) || "default";
    const { provider, model, apiKey, baseUrl } = body;

    const valid = ["gemini", "openai", "mistral", "nebius", "ollama"];
    if (!valid.includes(provider)) {
      return sendError(res, 400, `Invalid provider. Valid: ${valid.join(", ")}`);
    }

    const resolvedKey =
      apiKey ||
      (provider === "gemini"
        ? process.env.GEMINI_API_KEY
        : provider === "openai"
        ? process.env.OPENAI_API_KEY
        : provider === "mistral"
        ? process.env.MISTRAL_API_KEY
        : provider === "ollama"
        ? "ollama"
        : process.env.NEBIUS_API_KEY) ||
      "";

    if (provider !== "ollama" && !isConfiguredKey(resolvedKey)) {
      return sendError(
        res,
        503,
        `No valid API key for provider "${provider}". Set ${provider.toUpperCase()}_API_KEY in app/env/.env or configure via settings.`
      );
    }

    providerConfigs.set(sessionId, { provider, model, apiKey: resolvedKey, baseUrl });
    return sendJson(res, 200, {
      ok: true,
      success: true,
      sessionId,
      provider,
      model: model || `(default for ${provider})`,
    });
  }

  // OAuth endpoints
  if (pathname === "/api/auth/google/init" && req.method === "GET") {
    const state = oauthManager.generateStateToken();
    const { challenge } = oauthManager.generatePKCE();
    const redirectUri =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${process.env.GOOGLE_OAUTH_CLIENT_ID || "YOUR_CLIENT_ID"}` +
      `&redirect_uri=${encodeURIComponent(process.env.GOOGLE_OAUTH_REDIRECT_URI || `http://localhost:${port}/auth/callback`)}` +
      `&response_type=code&scope=${encodeURIComponent("openid profile email")}` +
      `&state=${state}` +
      `&code_challenge=${challenge}` +
      `&code_challenge_method=S256`;

    return sendJson(res, 200, { redirectUri, state });
  }

  if (pathname === "/api/auth/google/callback" && req.method === "POST") {
    const body = await parseBody(req);
    const { code, state } = body;
    if (!code || !state) {
      return sendError(res, 400, "Missing code or state");
    }

    try {
      const tokenData = await oauthManager.exchangeCodeForToken(code, state);
      const session = oauthManager.createSession(tokenData.user, tokenData.accessToken);
      return sendJson(res, 200, {
        success: true,
        sessionId: session.sessionId,
        user: { email: session.email, name: session.name },
        expiresIn: 86400,
      });
    } catch (err: any) {
      return sendError(res, 401, err.message);
    }
  }

  if (pathname === "/api/auth/google/status" && req.method === "GET") {
    const sessionId = (req.headers["x-session-id"] as string) || "";
    if (!sessionId || !oauthManager.validateSession(sessionId)) {
      return sendJson(res, 401, { isAuthenticated: false, reason: "Session invalid or expired" });
    }

    const session = oauthManager.getSession(sessionId);
    if (!session) {
      return sendJson(res, 401, { isAuthenticated: false });
    }

    return sendJson(res, 200, {
      isAuthenticated: true,
      user: { email: session.email, name: session.name },
      expiresAt: session.expiresAt,
    });
  }

  if (pathname === "/api/auth/google/logout" && req.method === "POST") {
    const sessionId = (req.headers["x-session-id"] as string) || "";
    if (sessionId) {
      await oauthManager.destroySession(sessionId);
    }
    return sendJson(res, 200, { success: true, message: "Logged out successfully" });
  }

  return false;
};
