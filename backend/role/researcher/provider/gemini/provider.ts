/**
 * Gemini ModelProvider — server-side adapter normalizing the existing,
 * working Google ADK pipeline behind the provider-neutral ModelProvider
 * contract. The ADK implementation is NOT duplicated: testConnection
 * delegates to the ADK worker health probe and generate delegates to the
 * ADK worker research op, returning the produced draft as normalized
 * ModelResponse text so it flows through the ONE shared canonical parser.
 *
 * BYOK: the user's Gemini API key is resolved server-side (transient probe/
 * run value or stored credential) and injected into the worker environment
 * without persistence. Vertex AI remains available as the existing
 * advanced/deployment mode via GOOGLE_GENAI_USE_VERTEXAI.
 */
import { randomUUID } from "node:crypto";
import type { ProviderTestResult } from "../../../../runtime/provider-manager.js";
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "../model-provider.js";
import {
  networkFailureDetail,
  redactSecret,
  type ModelProviderConfig,
} from "../transport.js";
import {
  AdkGemmaWorker,
} from "../adk-gemma2/worker-bridge.js";
import {
  loadAdkGemmaConfig,
} from "../adk-gemma2/provider.js";
import type { ProviderRuntimeSettings } from "../../../../runtime/provider-runtime-config.js";

export interface GeminiProviderConfig extends ModelProviderConfig {
  distributionModel: string;
  researchModel: string;
  synthesisModel: string;
  googleCloudProject?: string;
  googleCloudLocation: string;
  useVertexAi: boolean;
  workerPoolSize: number;
  cacheUrl?: string;
  cacheTtlSeconds: number;
  testDraftFile?: string;
}

export function loadGeminiConfig(
  projectRoot: string,
  settings: ProviderRuntimeSettings,
  credentialValue?: string,
): GeminiProviderConfig {
  const base = loadAdkGemmaConfig(projectRoot);
  return {
    ...base,
    model: "gemini-pipeline",
    apiKey: credentialValue ?? base.apiKey,
    workerPoolSize: settings.parallelism ?? base.workerPoolSize,
    timeoutSeconds: settings.timeoutSeconds ?? base.timeoutSeconds,
  };
}

export class GeminiModelProvider implements ModelProvider {
  readonly id = "gemini" as const;
  private readonly worker: AdkGemmaWorker;

  constructor(
    private readonly config: GeminiProviderConfig,
    private readonly projectRoot: string,
  ) {
    this.worker = new AdkGemmaWorker(projectRoot, config);
  }

  private redact(text: string): string {
    return redactSecret(text, this.config.apiKey);
  }

  async testConnection(): Promise<ProviderTestResult> {
    try {
      const health = await this.worker.health("provider-test:gemini");
      const detail = this.redact(
        health.detail || `${health.backend}${health.models ? `: ${health.models.join("->")}` : ""}`,
      );
      if (health.ready) {
        return {
          ok: true,
          provider: this.id,
          model: this.config.model,
          message: detail,
          retryable: false,
        };
      }
      const category = /API_KEY|is required|not configured/i.test(detail)
        ? "PROVIDER_AUTH_FAILURE"
        : /timed? ?out|connection|ENOTFOUND|ECONNREFUSED/i.test(detail)
          ? "PROVIDER_NETWORK_FAILURE"
          : "PROVIDER_INTERNAL_FAILURE";
      return {
        ok: false,
        provider: this.id,
        model: this.config.model,
        category: category as ProviderTestResult["category"],
        message: `${this.id} connection probe failed`,
        detail,
        retryable: category === "PROVIDER_NETWORK_FAILURE",
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.id,
        model: this.config.model,
        category: "PROVIDER_NETWORK_FAILURE",
        message: "Network failure — the provider could not be reached",
        detail: this.redact(networkFailureDetail(error)),
        retryable: true,
      };
    }
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    // The Researcher boundary sends {prompt, evidence} as the user payload;
    // the ADK worker consumes exactly that shape for its model pipeline.
    const userContent =
      request.messages.find((m) => m.role === "user")?.content ?? "";
    let payload: { prompt?: unknown; evidence?: unknown };
    try {
      payload = JSON.parse(userContent) as {
        prompt?: unknown;
        evidence?: unknown;
      };
    } catch {
      throw new Error(
        "PROVIDER_CONFIGURATION_FAILURE: gemini generate request payload is malformed",
      );
    }
    if (!payload.prompt) {
      throw new Error(
        "PROVIDER_CONFIGURATION_FAILURE: gemini generate request is missing the prompt payload",
      );
    }
    const runId = `gemini-${randomUUID()}`;
    try {
      const draft = await this.worker.research({
        prompt: payload.prompt,
        run_id: runId,
        evidence: payload.evidence,
      });
      return {
        provider: this.id,
        model: this.config.synthesisModel || request.model,
        // The draft is returned as text so it flows through the ONE shared
        // canonical ResearchDraft parser/validator like every other provider.
        text: JSON.stringify(draft),
      };
    } catch (error) {
      throw new Error(
        this.redact(networkFailureDetail(error)),
      );
    }
  }

  close(): void {
    this.worker.close();
  }
}