import { httpJsonRequest } from "./http-request.js";
import { createHeaderAllowlist } from "../../security/header-allowlist.js";

/**
 * Generic OpenAI-compatible chat client (M5). Speaks the OpenAI Chat
 * Completions shape against any base URL (cloud preset or local server like
 * Ollama). This is a TRANSPORT client, not a runtime: runtimes (M9/M10)
 * consume a ResolvedExecutionRoute and may use this client to actually call
 * the endpoint.
 *
 * No credentials are stored here; an apiKey in the invocation is sent as a
 * Bearer header and otherwise discarded. Header allowlisting arrives in M11.
 */

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface ChatInvocation {
  readonly baseUrl: string;
  readonly modelId: string;
  readonly messages: readonly ChatMessage[];
  readonly apiKey?: string;
  readonly headers?: Readonly<Record<string, string>>;
  /**
   * Provider-approved custom header names. Custom `headers` are validated
   * against this list (minus forbidden names) before send (M11, correction #6).
   * If `headers` is non-empty and this is absent/empty, validation fails closed.
   */
  readonly allowedHeaders?: readonly string[];
  readonly timeoutMs?: number;
}

export interface ChatCompletionResult {
  readonly content: string;
  readonly model: string;
  readonly finishReason: string;
}

export interface OpenAICompatibleClient {
  chat(invocation: ChatInvocation): Promise<ChatCompletionResult>;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function createOpenAICompatibleClient(): OpenAICompatibleClient {
  return {
    chat: async (inv: ChatInvocation): Promise<ChatCompletionResult> => {
      const url = joinUrl(inv.baseUrl, "/chat/completions");
      // Validate custom headers FIRST (correction #6), then add OneShot-managed
      // headers (content-type, authorization). Forbidden names (incl. these
      // managed names) are rejected with HEADER_NOT_ALLOWED, never silently
      // dropped. OneShot-managed headers cannot be overridden by custom input.
      const customHeaders = inv.headers ?? {};
      const hasCustom = Object.keys(customHeaders).length > 0;
      const validated = hasCustom
        ? createHeaderAllowlist(inv.allowedHeaders ?? []).validate(customHeaders)
        : {};
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...validated,
      };
      if (inv.apiKey) {
        headers.authorization = `Bearer ${inv.apiKey}`;
      }
      const res = await httpJsonRequest(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: inv.modelId,
          messages: inv.messages,
        }),
        timeoutMs: inv.timeoutMs,
      });
      if (!res.ok) {
        throw new Error(`chat completions failed: ${res.status} ${await res.text()}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        model?: string;
      };
      const choice = data.choices?.[0];
      return {
        content: choice?.message?.content ?? "",
        model: data.model ?? inv.modelId,
        finishReason: choice?.finish_reason ?? "stop",
      };
    },
  };
}
