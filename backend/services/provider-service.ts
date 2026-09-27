import path from "node:path";
import fs from "node:fs/promises";
import type { OneShotWorkflowEngine, SessionLedger } from "../../packages/agent-runtime/src/index.js";
import type { ProviderConfig } from "../routes/types.js";

export const VALID_CONFIG_PROVIDERS = ["gemini", "openai", "mistral", "tavily", "nebius"] as const;
export const VALID_SWITCH_PROVIDERS = ["gemini", "openai", "mistral", "nebius", "ollama"] as const;

export const PROVIDER_KEY_MAP: Record<string, string> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  tavily: "TAVILY_API_KEY",
  nebius: "NEBIUS_API_KEY",
};

export const PROVIDER_MODEL_MAP: Record<string, string> = {
  gemini: "GEMINI_MODEL",
  openai: "OPENAI_MODEL",
  mistral: "MISTRAL_MODEL",
};

export interface ConfigureProviderParams {
  provider: string;
  apiKey?: string;
  model?: string;
  sessionId: string;
  providerConfigs: Map<string, ProviderConfig>;
  isConfiguredKey: (key?: string) => boolean;
  persistEnv?: boolean;
}

export interface ConfigureProviderResult {
  ok: boolean;
  status: number;
  error?: string;
  result?: {
    configured: boolean;
    sessionId: string;
    provider: string;
    model: string;
    persisted?: boolean;
  };
}

export interface SwitchProviderParams {
  provider: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  sessionId: string;
  providerConfigs: Map<string, ProviderConfig>;
}

export interface SwitchProviderResult {
  ok: boolean;
  status: number;
  error?: string;
  result?: {
    success: boolean;
    sessionId: string;
    provider: string;
    model: string;
  };
}

export class ProviderService {
  /**
   * Configures a provider key and model, optionally persisting to app/env/.env.
   */
  static async configureProvider(params: ConfigureProviderParams): Promise<ConfigureProviderResult> {
    const { provider, apiKey, model, sessionId, providerConfigs, isConfiguredKey, persistEnv } = params;

    if (!VALID_CONFIG_PROVIDERS.includes(provider as (typeof VALID_CONFIG_PROVIDERS)[number]) || !isConfiguredKey(apiKey)) {
      return {
        ok: false,
        status: 400,
        error: `provider must be one of ${VALID_CONFIG_PROVIDERS.join(", ")} and apiKey must be configured`,
      };
    }

    const envVar = PROVIDER_KEY_MAP[provider];
    const modelVar = PROVIDER_MODEL_MAP[provider];

    let persisted = false;
    if (persistEnv) {
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
        return {
          ok: false,
          status: 500,
          error: `Provider configuration was not persisted: ${error.message}`,
        };
      }
    }

    if (envVar && apiKey) process.env[envVar] = apiKey.trim();
    if (modelVar && model) process.env[modelVar] = model.trim();

    providerConfigs.set(sessionId, {
      provider: provider as ProviderConfig["provider"],
      apiKey,
      model,
    });

    return {
      ok: true,
      status: 200,
      result: {
        configured: true,
        sessionId,
        provider,
        model: model || `(default for ${provider})`,
        persisted,
      },
    };
  }

  /**
   * Switches the active provider for a session.
   */
  static switchProvider(params: SwitchProviderParams): SwitchProviderResult {
    const { provider, model, apiKey, baseUrl, sessionId, providerConfigs } = params;

    if (!VALID_SWITCH_PROVIDERS.includes(provider as (typeof VALID_SWITCH_PROVIDERS)[number])) {
      return {
        ok: false,
        status: 400,
        error: `Invalid provider. Valid: ${VALID_SWITCH_PROVIDERS.join(", ")}`,
      };
    }

    providerConfigs.set(sessionId, {
      provider: provider as ProviderConfig["provider"],
      model,
      apiKey,
      baseUrl,
    });

    return {
      ok: true,
      status: 200,
      result: {
        success: true,
        sessionId,
        provider,
        model: model || `(default for ${provider})`,
      },
    };
  }

  /**
   * Returns a high-level status summary for workflow engine and providers.
   */
  static getWorkflowProviderSummary(
    workflowEngine: OneShotWorkflowEngine,
    sessionLedger: SessionLedger,
    activeSessionsCount: number,
    isConfiguredKey: (key?: string) => boolean
  ) {
    const checkpoints = sessionLedger.getAllCheckpoints();
    const auditLogs = sessionLedger.getAuditHookLogs();

    return {
      status: "healthy",
      currentStage: workflowEngine.getCurrentStage(),
      gate1: workflowEngine.getGate1(),
      gate2: workflowEngine.getGate2(),
      checkpointsCount: checkpoints.length,
      auditLogsCount: auditLogs.length,
      uptimeSeconds: Math.round(process.uptime()),
      activeSessions: activeSessionsCount,
      providers: {
        gemini: isConfiguredKey(process.env.GEMINI_API_KEY),
        openai: isConfiguredKey(process.env.OPENAI_API_KEY),
        mistral: isConfiguredKey(process.env.MISTRAL_API_KEY),
        tavily: isConfiguredKey(process.env.TAVILY_API_KEY),
      },
    };
  }
}
