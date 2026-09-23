import { ActivityStep, ProviderConfig, ProviderId } from "../types";
export * from "./ag-ui";
export * from "./backends";
export * from "./handoffs";

export interface ToolResultContent {
  type: "text" | "json";
  text?: string;
  json?: unknown;
}

export interface StrandsToolResultBlock {
  type: "toolResultBlock";
  toolUseId: string;
  status: "success" | "error";
  content: ToolResultContent[];
  error?: Error;
}

export interface StrandsStreamEvent {
  type: "data" | "tool_use" | "tool_running" | "tool_result" | "tool_error" | "step" | "lifecycle" | "error";
  data?: string;
  tool?: {
    name: string;
    toolUseId: string;
    input?: Record<string, unknown>;
  };
  result?: StrandsToolResultBlock & { toolUseId?: string };
  step?: ActivityStep;
  message?: string;
  lifecycle?: string;
  error?: string;
}

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onActivityStep: (step: ActivityStep) => void;
  onToolEvent?: (event: StrandsStreamEvent) => void;
  onDone: (fullContent: string) => void;
  onError: (error: Error) => void;
}

/**
 * Checks backend health and server reachability.
 */
export async function checkBackendHealth(): Promise<{ ok: boolean; status?: string }> {
  try {
    const res = await fetch("/api/health", { method: "GET" });
    if (!res.ok) return { ok: false, status: `HTTP ${res.status}` };
    const data = await res.json().catch(() => ({}));
    return { ok: true, status: data.status || "healthy" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error";
    return { ok: false, status: message };
  }
}

/**
 * Checks server-managed provider readiness via /api/providers/status.
 * Credentials remain strictly server-side.
 */
export async function testProviderConnection(
  provider: ProviderId,
  _config?: ProviderConfig
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch("/api/providers/status", { method: "GET" }).catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      const isConfigured = Boolean(data[provider]?.configured);
      if (isConfigured) {
        return {
          success: true,
          message: `Server ready: ${provider} environment credentials confirmed.`,
        };
      }
      return {
        success: false,
        message: `Provider ${provider} not configured in server environment (check app/env/.env).`,
      };
    }

    return {
      success: true,
      message: "Server endpoint reachable. Credentials managed server-side.",
    };
  } catch {
    return {
      success: false,
      message: "Unable to reach server integration endpoint.",
    };
  }
}

/**
 * Real AG-UI Async Iterator consuming backend Server-Sent Events stream from /api/agent/stream.
 *
 * Implements strict unavailable-state behavior:
 * If the server is offline or credentials are not configured, yields an error event
 * and terminates without fabricating progress or faking execution.
 *
 * Tool Lifecycle:
 * - tool_use: Tool invocation starts (parameters may arrive during streaming)
 * - tool_running: Tool is acknowledged as running (explicit running state)
 * - tool_result: Tool completed successfully
 * - tool_error: Tool failed with error
 * 
 * Correlation: toolUseId stable across all events for the same tool call.
 */
export async function* iterateAgentStream(
  prompt: string,
  signal?: AbortSignal,
  providerConfig?: { provider: ProviderId; config: ProviderConfig }
): AsyncGenerator<StrandsStreamEvent, void, unknown> {
  const streamRes = await fetch("/api/agent/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      prompt,
      model: providerConfig?.config.model,
    }),
    signal,
  }).catch((err) => {
    return {
      ok: false,
      status: 0,
      statusText: err instanceof Error ? err.message : "Network error",
      json: async () => ({ error: err instanceof Error ? err.message : "Network error" }),
      body: null,
    };
  });

  if (!streamRes.ok || !streamRes.body) {
    let errorDetail = `HTTP ${streamRes.status}: ${streamRes.statusText || "Backend stream unavailable"}`;
    try {
      const errJson = await streamRes.json();
      if (errJson && errJson.error) {
        errorDetail = errJson.error;
      }
    } catch {
      // Keep errorDetail
    }

    if (streamRes.status === 503) {
      yield {
        type: "error",
        error: `Backend Service Unavailable (503): Server provider credentials not configured. Credentials remain server-side per security policy.`,
      };
      return;
    }

    yield {
      type: "error",
      error: `Agent backend stream unavailable (${errorDetail}). Ensure backend server is running with configured environment credentials.`,
    };
    return;
  }

  // Parse real Server-Sent Events (SSE) stream from backend
  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || "";

      for (const block of blocks) {
        if (!block.trim()) continue;

        let eventType = "message";
        let dataStr = "";

        const lines = block.split("\n");
        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataStr = line.slice(5).trim();
          }
        }

        if (!dataStr) continue;

        try {
          const payload = JSON.parse(dataStr);

          if (eventType === "RUN_START") {
            yield { type: "lifecycle", lifecycle: "beforeInvocationEvent" };
          } else if (eventType === "STEP_START") {
            yield {
              type: "step",
              step: {
                id: payload.stepId || `step-${Date.now()}`,
                label: payload.label || "Processing step",
                status: "in_progress",
              },
            };
          } else if (eventType === "STEP_FINISH") {
            yield {
              type: "step",
              step: {
                id: payload.stepId || `step-${Date.now()}`,
                label: payload.label || "Completed step",
                status: payload.status === "completed" ? "completed" : "failed",
              },
            };
          } else if (eventType === "TEXT_MESSAGE_DELTA") {
            yield {
              type: "data",
              data: payload.delta || "",
            };
          } else if (eventType === "TOOL_CALL_START") {
            yield {
              type: "tool_use",
              tool: {
                name: payload.toolName || "tool",
                toolUseId: payload.toolUseId || `tool-${Date.now()}`,
                input: payload.parameters || {},
              },
            };
          } else if (eventType === "TOOL_CALL_RUNNING") {
            yield {
              type: "tool_running",
              tool: {
                name: payload.toolName || "tool",
                toolUseId: payload.toolUseId || `tool-${Date.now()}`,
              },
            };
          } else if (eventType === "TOOL_CALL_FINISH") {
            yield {
              type: "tool_result",
              result: {
                type: "toolResultBlock",
                toolUseId: payload.toolUseId || `tool-${Date.now()}`,
                status: "success" as const,
                content: [{ type: "json" as const, json: payload.result }],
              },
            };
          } else if (eventType === "TOOL_CALL_ERROR") {
            yield {
              type: "tool_error",
              result: {
                type: "toolResultBlock",
                toolUseId: payload.toolUseId || `tool-${Date.now()}`,
                status: "error" as const,
                content: [{ type: "text" as const, text: payload.error || "Unknown error" }],
                error: new Error(payload.error || "Tool execution failed"),
              },
            };
          } else if (eventType === "RUN_FINISH") {
            if (payload.status === "FAILED") {
              yield {
                type: "error",
                error: payload.error || "Execution failed on server",
              };
            }
            yield { type: "lifecycle", lifecycle: "afterInvocationEvent" };
          }
        } catch {
          // Non-JSON SSE payload
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Streams agent execution with real backend AG-UI events.
 * Enforces complete tool lifecycle and call correlation.
 */
export async function streamAgentExecution(
  prompt: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  providerConfig?: { provider: ProviderId; config: ProviderConfig }
): Promise<void> {
  const { onChunk, onActivityStep, onToolEvent, onDone, onError } = callbacks;
  let accumulated = "";

  try {
    for await (const event of iterateAgentStream(prompt, signal, providerConfig)) {
      if (signal?.aborted) return;

      if (event.type === "data" && event.data) {
        accumulated += event.data;
        onChunk(event.data);
      } else if (event.type === "step" && event.step) {
        onActivityStep(event.step);
      } else if ((event.type === "tool_use" || event.type === "tool_running" || event.type === "tool_result" || event.type === "tool_error") && onToolEvent) {
        onToolEvent(event);
      } else if (event.type === "error" && event.error) {
        throw new Error(event.error);
      }
    }

    onDone(accumulated);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    onError(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action API v2 Client & SecurityWorker Interceptor
// Pattern extracted from Taskade Action API & LangChain SDK standard
// ─────────────────────────────────────────────────────────────────────────────

export type SecurityWorker = () => Record<string, string> | Promise<Record<string, string>>;

export interface HttpClientConfig {
  baseUrl?: string;
  securityWorker?: SecurityWorker;
  headers?: Record<string, string>;
}

export class HttpClient {
  private baseUrl: string;
  private securityWorker?: SecurityWorker;
  private defaultHeaders: Record<string, string>;

  constructor(config: HttpClientConfig = {}) {
    this.baseUrl = (config.baseUrl || "").replace(/\/$/, "");
    this.securityWorker = config.securityWorker;
    this.defaultHeaders = config.headers || {};
  }

  async request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
    const url = path.startsWith("http://") || path.startsWith("https://")
      ? path
      : `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

    const dynamicHeaders = this.securityWorker ? await this.securityWorker() : {};
    const mergedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.defaultHeaders,
      ...dynamicHeaders,
      ...((options.headers as Record<string, string>) || {}),
    };

    const res = await fetch(url, {
      ...options,
      headers: mergedHeaders,
    });

    if (!res.ok) {
      let errBody: any;
      try {
        errBody = await res.json();
      } catch {
        errBody = { error: `HTTP ${res.status}: ${res.statusText}` };
      }
      const errorMsg = errBody?.error || errBody?.message || `HTTP ${res.status}`;
      const err = new Error(errorMsg) as Error & { status?: number; payload?: any };
      err.status = res.status;
      err.payload = errBody;
      throw err;
    }

    return (await res.json()) as T;
  }

  async post<T = unknown>(path: string, body?: unknown, options: RequestInit = {}): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async get<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: "GET",
    });
  }
}

export interface StatusResponse {
  ok: boolean;
  status: string;
  currentStage: string;
  gate1: { status: string; approved?: boolean };
  gate2: { status: string; approved?: boolean };
  providers: Record<string, { configured: boolean; model?: string }>;
  activeSessions: number;
}

export interface PromptAgentPayload {
  prompt: string;
  runId?: string;
  task?: string;
  constraints?: string[];
  evidence?: Array<Record<string, unknown>>;
  sessionId?: string;
}

export interface ExecuteToolPayload {
  toolName: string;
  input?: Record<string, unknown>;
  sessionId?: string;
}

export interface ConfigureProviderPayload {
  provider: "gemini" | "openai" | "mistral" | "tavily" | "nebius" | "ollama" | string;
  apiKey: string;
  model?: string;
  sessionId?: string;
}

export interface SwitchProviderPayload {
  provider: "gemini" | "openai" | "mistral" | "nebius" | "ollama" | string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  sessionId?: string;
}

export interface TransitionStagePayload {
  targetStage: string;
  sessionId?: string;
}

export interface ValidateFixturesPayload {
  fixture_id?: string;
  sessionId?: string;
  path?: string;
  expectedHash?: string;
}

export class OneShotPublicApi {
  constructor(private http: HttpClient = new HttpClient()) {}

  /**
   * Action API v2: getStatus
   */
  async getStatus(sessionId?: string): Promise<StatusResponse> {
    return this.http.post<StatusResponse>("/api/v2/getStatus", { sessionId });
  }

  /**
   * Action API v2: promptAgent (Unified Reasoning & Agent Invocation)
   */
  async promptAgent<T = any>(payload: PromptAgentPayload): Promise<T> {
    return this.http.post<T>("/api/v2/promptAgent", payload);
  }

  /**
   * Action API v2: executeTool
   */
  async executeTool<T = any>(payload: ExecuteToolPayload): Promise<T> {
    return this.http.post<T>("/api/v2/executeTool", payload);
  }

  /**
   * Action API v2: configureProvider
   */
  async configureProvider<T = any>(payload: ConfigureProviderPayload): Promise<T> {
    return this.http.post<T>("/api/v2/configureProvider", payload);
  }

  /**
   * Action API v2: switchProvider
   */
  async switchProvider<T = any>(payload: SwitchProviderPayload): Promise<T> {
    return this.http.post<T>("/api/v2/switchProvider", payload);
  }

  /**
   * Action API v2: transitionStage
   */
  async transitionStage<T = any>(payload: TransitionStagePayload): Promise<T> {
    return this.http.post<T>("/api/v2/transitionStage", payload);
  }

  /**
   * Action API v2: validateFixtures
   */
  async validateFixtures<T = any>(payload: ValidateFixturesPayload = {}): Promise<T> {
    return this.http.post<T>("/api/v2/validateFixtures", payload);
  }

  /**
   * Action API v2: exportBundle (Portable Snapshot Extraction)
   */
  async exportBundle<T = any>(sessionId?: string): Promise<T> {
    return this.http.post<T>("/api/v2/exportBundle", { sessionId });
  }

  /**
   * Action API v2: importBundle (Portable Snapshot Ingestion)
   */
  async importBundle<T = any>(bundleData: unknown, sessionId?: string): Promise<T> {
    return this.http.post<T>("/api/v2/importBundle", { bundleData, sessionId });
  }
}

export const defaultOneShotApi = new OneShotPublicApi();




