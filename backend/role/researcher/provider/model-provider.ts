/**
 * model-provider — provider-neutral MODEL INFERENCE boundary.
 *
 * OneShot is the server: provider SDKs, endpoints, credentials, retries and
 * error normalization live here, below the OneShot workflow. Adapters own
 * model inference ONLY — evidence collection, ResearchDraft parsing/validation,
 * Plan creation and everything canonical stay in the Researcher boundary
 * (one shared path in remote-chat-research-provider.ts).
 *
 * Secrets never cross this boundary upward: configs carry non-secret runtime
 * settings; credentials are resolved server-side and redacted from errors.
 */
import type { ProviderTestResult } from "../../../runtime/provider-manager.js";

export type ProviderId = "openai" | "anthropic" | "gemini";

export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelRequest {
  /** Non-secret model identifier from the provider runtime configuration. */
  model: string;
  /** Normalized inference input (messages/input). */
  messages: ModelMessage[];
  /** Optional normalized parameter — adapters omit it when unsupported/absent. */
  temperature?: number;
  maxOutputTokens?: number;
  /** Ask the adapter to request JSON output when the provider supports it. */
  responseFormat?: "text" | "json";
}

export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ModelResponse {
  provider: ProviderId;
  model: string;
  /** Normalized text content of the model response. */
  text: string;
  /** Token/usage information when the provider exposes it. */
  usage?: ModelUsage;
}

export interface ModelProvider {
  id: ProviderId;
  /**
   * Real, minimal connection/readiness probe. Must demonstrate actual
   * provider reachability/auth — never return success for configuration
   * alone. Implementations return the normalized Phase 4A result.
   */
  testConnection(): Promise<ProviderTestResult>;
  /** One normalized model inference. */
  generate(request: ModelRequest): Promise<ModelResponse>;
  close?(): void;
}