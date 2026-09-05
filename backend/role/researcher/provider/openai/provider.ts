/**
 * OpenAI ModelProvider — server-side adapter over the OpenAI REST API.
 *
 * Responsibility: translate OneShot's normalized ModelRequest/ModelResponse
 * to/from the OpenAI API. Owns transport, endpoint defaults, authentication
 * and OpenAI-specific error interpretation. Knows NOTHING about OneShot's
 * ResearchDraft/Plan/Builder. Credentials are BYOK: supplied by the user,
 * resolved server-side, and redacted from every surface.
 */
import type { ProviderTestResult } from "../../../../runtime/provider-manager.js";
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "../model-provider.js";
import {
  httpFailureDetail,
  networkFailureDetail,
  redactSecret,
  type ModelProviderConfig,
} from "../transport.js";
import type { ProviderRuntimeSettings } from "../../../../runtime/provider-runtime-config.js";

export function loadOpenAIConfig(
  projectRoot: string,
  settings: ProviderRuntimeSettings,
  credentialValue?: string,
): ModelProviderConfig {
  void projectRoot;
  return {
    model:
      process.env.OPENAI_MODEL ||
      (settings.model && settings.model !== "fixture"
        ? settings.model
        : "") ||
      "gpt-4o-mini",
    baseUrl:
      process.env.OPENAI_API_BASE ||
      settings.apiBase ||
      "https://api.openai.com/v1",
    apiKey: credentialValue ?? process.env.OPENAI_API_KEY,
    timeoutSeconds: settings.timeoutSeconds ?? 300,
    maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS) || 3072,
  };
}

/** Interpret OpenAI's actual error payloads into Phase 4A categories. */
function classifyOpenAIError(status: number, body: string): string {
  let code = "";
  let type = "";
  try {
    const parsed = JSON.parse(body) as {
      error?: { code?: string; type?: string };
    };
    code = String(parsed.error?.code ?? "");
    type = String(parsed.error?.type ?? "");
  } catch {
    // Non-JSON body: fall through to status-based mapping.
  }
  if (
    status === 401 ||
    status === 403 ||
    code === "invalid_api_key" ||
    (type === "invalid_request_error" && /api key/i.test(body))
  ) {
    return "PROVIDER_AUTH_FAILURE";
  }
  if (code === "model_not_found" || (/model/i.test(body) && status === 404)) {
    return "PROVIDER_MODEL_FAILURE";
  }
  if (status === 429 || type === "rate_limit_error") {
    return "PROVIDER_NETWORK_FAILURE";
  }
  if (status >= 500) return "PROVIDER_INTERNAL_FAILURE";
  // Fallback for unmapped statuses (wrong URL, API version, etc.).
  return status >= 400 && status < 500
    ? "PROVIDER_CONFIGURATION_FAILURE"
    : "PROVIDER_INTERNAL_FAILURE";
}

export class OpenAIModelProvider implements ModelProvider {
  readonly id = "openai" as const;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: ModelProviderConfig) {
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  private authHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${this.config.apiKey ?? ""}`,
      "content-type": "application/json",
    };
  }

  private probeFailure(status: number, body: string): ProviderTestResult {
    const category = classifyOpenAIError(status, body);
    return {
      ok: false,
      provider: this.id,
      model: this.config.model,
      category: category as ProviderTestResult["category"],
      message: `${this.id} connection probe failed`,
      detail: redactSecret(
        httpFailureDetail(this.id, status, body),
        this.config.apiKey,
      ),
      retryable: category === "PROVIDER_NETWORK_FAILURE",
    };
  }

  async testConnection(): Promise<ProviderTestResult> {
    if (!this.config.apiKey) {
      return {
        ok: false,
        provider: this.id,
        model: this.config.model,
        category: "PROVIDER_AUTH_FAILURE",
        message:
          "Authentication failed — the credential was rejected or is missing",
        detail: "OPENAI_API_KEY is not configured",
        retryable: false,
      };
    }
    try {
      const response = await this.fetchImpl(`${this.config.baseUrl}/models`, {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(this.config.timeoutSeconds * 1000),
      });
      const body = await response.text().catch(() => "");
      if (!response.ok) return this.probeFailure(response.status, body);
      const data = JSON.parse(body) as { data?: Array<{ id?: string }> };
      const ids = (data.data ?? [])
        .map((m) => String(m.id ?? ""))
        .filter(Boolean)
        .slice(0, 500);
      if (ids.includes(this.config.model)) {
        return {
          ok: true,
          provider: this.id,
          model: this.config.model,
          message:
            "live OpenAI probe verified: model available from the models endpoint",
          retryable: false,
        };
      }
      return {
        ok: false,
        provider: this.id,
        model: this.config.model,
        category: "PROVIDER_MODEL_FAILURE",
        message:
          "Model unavailable — the configured model was not accepted by the provider",
        detail: `configured model ${this.config.model} was not returned by the live OpenAI models endpoint`,
        retryable: false,
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.id,
        model: this.config.model,
        category: "PROVIDER_NETWORK_FAILURE",
        message: "Network failure — the provider could not be reached",
        detail: redactSecret(networkFailureDetail(error), this.config.apiKey),
        retryable: true,
      };
    }
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (!this.config.apiKey) {
      throw new Error(
        "PROVIDER_AUTH_FAILURE: OPENAI_API_KEY is not configured for model inference",
      );
    }
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      max_tokens: request.maxOutputTokens ?? this.config.maxOutputTokens,
    };
    // Temperature is optional — omit when the request does not provide one.
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.responseFormat === "json") {
      body.response_format = { type: "json_object" };
    }
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.config.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: this.authHeaders(),
          signal: AbortSignal.timeout(this.config.timeoutSeconds * 1000),
          body: JSON.stringify(body),
        },
      );
    } catch (error) {
      throw new Error(
        redactSecret(networkFailureDetail(error), this.config.apiKey),
      );
    }
    const rawBody = await response.text().catch(() => "");
    if (!response.ok) {
      throw new Error(
        redactSecret(
          `${classifyOpenAIError(response.status, rawBody)}: ${httpFailureDetail(
            this.id,
            response.status,
            rawBody,
          )}`,
          this.config.apiKey,
        ),
      );
    }
    const data = JSON.parse(rawBody) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      provider: this.id,
      model: data.model ?? request.model,
      text: data.choices?.[0]?.message?.content ?? "",
      usage: data.usage
        ? {
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens,
          }
        : undefined,
    };
  }

  close(): void {
    // No child processes or pooled connections; nothing to release.
  }
}