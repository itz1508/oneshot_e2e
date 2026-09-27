import { createLiveModel, createMainAgent } from "../../packages/agent-runtime/src/index.js";
import { oauthManager } from "../oauth.js";
import { ProviderService } from "../services/provider-service.js";
import { sendJson, sendError } from "./helpers.js";
import type { RouteHandler } from "./types.js";

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

    // Check Mistral
    const hasMistral = isConfiguredKey(process.env.MISTRAL_API_KEY);
    status.mistral = {
      configured: hasMistral,
      available: hasMistral,
      model: process.env.MISTRAL_MODEL || "mistral-large-latest",
      endpoint: process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1",
      tested: hasMistral,
    };

    // Check Nebius
    const hasNebius = isConfiguredKey(process.env.NEBIUS_API_KEY);
    status.nebius = {
      configured: hasNebius,
      available: hasNebius,
      latency: 0,
      model: process.env.NEBIUS_MODEL || "meta-llama/Meta-Llama-3.1-70B-Instruct",
      tested: false,
    };

    // Check Ollama
    status.ollama = {
      configured: Boolean(process.env.OLLAMA_BASE_URL),
      available: Boolean(process.env.OLLAMA_BASE_URL),
      endpoint: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
      model: process.env.OLLAMA_MODEL || "llama3.2",
      tested: false,
    };

    // Check Tavily
    status.tavily = {
      configured: isConfiguredKey(process.env.TAVILY_API_KEY),
      available: isConfiguredKey(process.env.TAVILY_API_KEY),
      tested: false,
    };

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
