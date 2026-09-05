/**
 * Anthropic ModelProvider — server-side adapter over the Anthropic REST API.
 *
 * Responsibility: translate OneShot's normalized ModelRequest/ModelResponse
 * to/from the Anthropic Messages API. Owns transport, endpoint defaults,
 * authentication and Anthropic-specific error interpretation. Knows NOTHING
 * about OneShot's ResearchDraft/Plan/Builder. Credentials are BYOK: supplied
 * by the user, resolved server-side, and redacted from every surface.
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

const ANTHROPIC_VERSION = "2023-06-01";

export function loadAnthropicConfig(
  projectRoot: string,
  settings: ProviderRuntimeSettings,
  credentialValue?: string,
): ModelProviderConfig {
  void projectRoot;
  return {
    model:
      process.env.ANTHROPIC_MODEL ||
      (settings.model && settings.model !== "fixture"
        ? settings.model
        : "") ||
      "claude-sonnet-4-5",
    baseUrl:
      process.env.ANTHROPIC_API_BASE ||
      settings.apiBase ||
      "https://api.anthropic.com",
    apiKey: credentialValue ?? process.env.ANTHROPIC_API_KEY,
    timeoutSeconds: settings.timeoutSeconds ?? 300,
    maxOutputTokens: Number(process.env.ANTHROPIC_MAX_OUTPUT_TOKENS) || 3072,
  };
}

/** Interpret Anthropic's actual error payloads into Phase 4A categories. */
function classifyAnthropicError(status: number, body: string): string {
  let type = "";
  try {
    const parsed = JSON.parse(body) as { error?: { type?: string } };
    type = String(parsed.error?.type ?? "");
  } catch {
    // Non-JSON body: fall through to status-based mapping.
  }
  if (
    status === 401 ||
    status === 403 ||
    type === "authentication_error" ||
    type === "permission_error"
  ) {
    return "PROVIDER_AUTH_FAILURE";
  }
  if (type === "not_found_error" && /model/i.test(body)) {
    return "PROVIDER_MODEL_FAILURE";
  }
  if (status === 429 || type === "rate_limit_error") {
    return "PROVIDER_NETWORK_FAILURE";
  }
  if (status >= 500 || type === "api_error" || type === "overloaded_error") {
    return "PROVIDER_INTERNAL_FAILURE";
  }
  // Fallback for unmapped statuses (wrong URL, API version, etc.).
  return status >= 400 && status < 500
    ? "PROVIDER_CONFIGURATION_FAILURE"
    : "PROVIDER_INTERNAL_FAILURE";
}

export class AnthropicModelProvider implements ModelProvider {
  readonly id = "anthropic" as const;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: ModelProviderConfig) {
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  private authHeaders(): Record<string, string> {
    return {
      "x-api-key": this.config.apiKey ?? "",
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    };
  }

  private probeFailure(status: number, body: string): ProviderTestResult {
    const category = classifyAnthropicError(status, body);
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
        detail: "ANTHROPIC_API_KEY is not configured",
        retryable: false,
      };
    }
    try {
      const response = await this.fetchImpl(
        `${this.config.baseUrl}/v1/models`,
        {
          headers: this.authHeaders(),
          signal: AbortSignal.timeout(this.config.timeoutSeconds * 1000),
        },
      );
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
            "live Anthropic probe verified: model available from the models endpoint",
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
        detail: `configured model ${this.config.model} was not returned by the live Anthropic models endpoint`,
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
        "PROVIDER_AUTH_FAILURE: ANTHROPIC_API_KEY is not configured for model inference",
      );
    }
    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxOutputTokens ?? this.config.maxOutputTokens,
      messages: request.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content })),
    };
    const system = request.messages.find((m) => m.role === "system");
    if (system) body.system = system.content;
    // Temperature is optional — omit when the request does not provide one.
    if (request.temperature !== undefined) body.temperature = request.temperature;
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl}/v1/messages`, {
        method: "POST",
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(this.config.timeoutSeconds * 1000),
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(
        redactSecret(networkFailureDetail(error), this.config.apiKey),
      );
    }
    const rawBody = await response.text().catch(() => "");
    if (!response.ok) {
      throw new Error(
        redactSecret(
          `${classifyAnthropicError(response.status, rawBody)}: ${httpFailureDetail(
            this.id,
            response.status,
            rawBody,
          )}`,
          this.config.apiKey,
        ),
      );
    }
    const data = JSON.parse(rawBody) as {
      content?: Array<{ type?: string; text?: string }>;
      model?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      provider: this.id,
      model: data.model ?? request.model,
      text: (data.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => String(block.text ?? ""))
        .join(""),
      usage: data.usage
        ? {
            inputTokens: data.usage.input_tokens,
            outputTokens: data.usage.output_tokens,
          }
        : undefined,
    };
  }

  close(): void {
    // No child processes or pooled connections; nothing to release.
  }
}