import path from "node:path";
import fs from "node:fs/promises";
import { createLiveModel, createMainAgent } from "../../packages/agent-runtime/src/index.js";
import { oauthManager } from "../oauth.js";
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
    return true;
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
    return true;
  }

  // Provider registry
  if (pathname === "/api/integration/providers" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getProviderRegistry()));
    return true;
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
      return true;
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
        return true;
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
    return true;
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
      return true;
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
      return true;
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
    return true;
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
    return true;
  }

  if (pathname === "/api/auth/google/callback" && req.method === "POST") {
    const body = await parseBody(req);
    const { code, state } = body;
    if (!code || !state) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing code or state" }));
      return true;
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
      return true;
    } catch (err: any) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
      return true;
    }
  }

  if (pathname === "/api/auth/google/status" && req.method === "GET") {
    const sessionId = (req.headers["x-session-id"] as string) || "";
    if (!sessionId || !oauthManager.validateSession(sessionId)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ isAuthenticated: false, reason: "Session invalid or expired" }));
      return true;
    }

    const session = oauthManager.getSession(sessionId);
    if (!session) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ isAuthenticated: false }));
      return true;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      isAuthenticated: true,
      user: { email: session.email, name: session.name },
      expiresAt: session.expiresAt,
    }));
    return true;
  }

  if (pathname === "/api/auth/google/logout" && req.method === "POST") {
    const sessionId = (req.headers["x-session-id"] as string) || "";
    if (sessionId) {
      await oauthManager.destroySession(sessionId);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "Logged out successfully" }));
    return true;
  }

  return false;
};
