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
  runId?: string;
  error?: string;
}

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onActivityStep: (step: ActivityStep) => void;
  onToolEvent?: (event: StrandsStreamEvent) => void;
  onRunStart?: (runId: string) => void;
  onDone: (fullContent: string) => void;
  onError: (error: Error) => void;
}

export class ApiResponseError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiResponseError";
    this.status = status;
    this.payload = payload;
  }
}

export async function readJsonResponse<T>(response: Response, operation = "API request"): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new ApiResponseError(
      `${operation} returned a non-JSON response (HTTP ${response.status})`,
      response.status,
      null,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new ApiResponseError(
      `${operation} returned invalid JSON: ${error instanceof Error ? error.message : "parse error"}`,
      response.status,
      null,
    );
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `${operation} failed with HTTP ${response.status}`;
    throw new ApiResponseError(message, response.status, payload);
  }

  return payload as T;
}


/**
 * Checks backend health and server reachability.
 */
export async function checkBackendHealth(): Promise<{ ok: boolean; status?: string }> {
  try {
    const res = await fetch("/api/health", { method: "GET" });
    const data = await readJsonResponse<{ ok?: boolean; status?: string }>(res, "Backend health request");
    if (data.ok !== true || typeof data.status !== "string") {
      return { ok: false, status: "Backend health response is missing ok=true or status" };
    }
    return { ok: true, status: data.status };
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
    const res = await fetch("/api/providers/status", { method: "GET" });
    const data = await readJsonResponse<Record<string, { configured?: boolean }>>(res, "Provider status request");
    const providerStatus = data[provider];
    if (!providerStatus || typeof providerStatus.configured !== "boolean") {
      throw new Error(`Provider status response is missing ${provider}.configured`);
    }
    if (providerStatus.configured) {
      return {
        success: true,
        message: `Server ready: ${provider} environment credentials confirmed.`,
      };
    }
    return {
      success: false,
      message: `Provider ${provider} not configured in server environment (check app/env/.env).`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unable to reach server integration endpoint.",
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
  providerConfig?: { provider: ProviderId; config: ProviderConfig },
  sessionId?: string,
): AsyncGenerator<StrandsStreamEvent, void, unknown> {
  const streamRes = await fetch("/api/agent/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(sessionId ? { "X-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify({
      prompt,
      provider: providerConfig?.provider,
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
  let sawRunStart = false;
  let sawRunFinish = false;
  let expectedRunId = "";
  let streamDone = false;
  const activeToolCalls = new Map<string, string>();

  try {
    while (!streamDone) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      streamDone = done;

      buffer += decoder.decode(value, { stream: true });
      if (streamDone) buffer += decoder.decode();
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || "";
      if (streamDone && buffer.trim()) {
        blocks.push(buffer);
        buffer = "";
      }

      for (const block of blocks) {
        if (!block.trim()) continue;

        let eventType = "message";
        const dataLines: string[] = [];
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith("event:")) eventType = line.slice(6).trim();
          if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
        if (dataLines.length === 0) continue;

        let payload: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(dataLines.join("\n"));
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("SSE data must be a JSON object");
          payload = parsed as Record<string, unknown>;
        } catch (error) {
          yield { type: "error", error: `Agent stream returned invalid ${eventType} event: ${error instanceof Error ? error.message : "parse error"}` };
          return;
        }

        if (payload.type !== eventType || typeof payload.runId !== "string" || !payload.runId || typeof payload.timestamp !== "string" || !payload.timestamp) {
          yield { type: "error", error: `Agent stream ${eventType} is missing its type/runId/timestamp contract` };
          return;
        }
        if (expectedRunId && payload.runId !== expectedRunId) {
          yield { type: "error", error: `Agent stream run correlation mismatch: expected ${expectedRunId}, received ${payload.runId}` };
          return;
        }

        if (!sawRunStart && eventType !== "RUN_START") {
          yield { type: "error", error: `Agent stream emitted ${eventType} before RUN_START` };
          return;
        }

        if (eventType === "RUN_START") {
          if (sawRunStart) {
            yield { type: "error", error: "Agent stream emitted more than one RUN_START event" };
            return;
          }
          sawRunStart = true;
          expectedRunId = payload.runId;
          yield { type: "lifecycle", lifecycle: "beforeInvocationEvent", runId: expectedRunId };
        } else if (eventType === "STEP_START") {
          if (typeof payload.stepId !== "string" || typeof payload.label !== "string") {
            yield { type: "error", error: "Agent stream STEP_START is missing stepId or label" };
            return;
          }
          yield { type: "step", step: { id: payload.stepId, label: payload.label, status: "in_progress" } };
        } else if (eventType === "STEP_FINISH") {
          if (typeof payload.stepId !== "string" || (payload.status !== "completed" && payload.status !== "failed")) {
            yield { type: "error", error: "Agent stream STEP_FINISH is missing stepId or valid status" };
            return;
          }
          yield { type: "step", step: { id: payload.stepId, label: typeof payload.label === "string" ? payload.label : "Completed step", status: payload.status } };
        } else if (eventType === "TEXT_MESSAGE_DELTA") {
          if (typeof payload.delta !== "string") {
            yield { type: "error", error: "Agent stream TEXT_MESSAGE_DELTA is missing delta" };
            return;
          }
          yield { type: "data", data: payload.delta };
        } else if (eventType === "TOOL_CALL_START") {
          if (typeof payload.toolName !== "string" || typeof payload.toolUseId !== "string" || !payload.parameters || typeof payload.parameters !== "object" || activeToolCalls.has(payload.toolUseId)) {
            yield { type: "error", error: "Agent stream TOOL_CALL_START is missing its tool contract or reuses a toolUseId" };
            return;
          }
          activeToolCalls.set(payload.toolUseId, payload.toolName);
          yield { type: "tool_use", tool: { name: payload.toolName, toolUseId: payload.toolUseId, input: payload.parameters as Record<string, unknown> } };
        } else if (eventType === "TOOL_CALL_RUNNING") {
          if (typeof payload.toolName !== "string" || typeof payload.toolUseId !== "string" || activeToolCalls.get(payload.toolUseId) !== payload.toolName) {
            yield { type: "error", error: "Agent stream TOOL_CALL_RUNNING is missing or mismatches its started tool call" };
            return;
          }
          yield { type: "tool_running", tool: { name: payload.toolName, toolUseId: payload.toolUseId } };
        } else if (eventType === "TOOL_CALL_FINISH") {
          if (typeof payload.toolUseId !== "string" || !("result" in payload) || !activeToolCalls.has(payload.toolUseId)) {
            yield { type: "error", error: "Agent stream TOOL_CALL_FINISH is missing its started tool call or result" };
            return;
          }
          activeToolCalls.delete(payload.toolUseId);
          yield { type: "tool_result", result: { type: "toolResultBlock", toolUseId: payload.toolUseId, status: "success" as const, content: [{ type: "json" as const, json: payload.result }] } };
        } else if (eventType === "TOOL_CALL_ERROR") {
          if (typeof payload.toolUseId !== "string" || typeof payload.error !== "string" || !activeToolCalls.has(payload.toolUseId)) {
            yield { type: "error", error: "Agent stream TOOL_CALL_ERROR is missing its started tool call or error" };
            return;
          }
          activeToolCalls.delete(payload.toolUseId);
          yield { type: "tool_error", result: { type: "toolResultBlock", toolUseId: payload.toolUseId, status: "error" as const, content: [{ type: "text" as const, text: payload.error }], error: new Error(payload.error) } };
        } else if (eventType === "RUN_FINISH") {
          if (sawRunFinish) {
            yield { type: "error", error: "Agent stream emitted more than one RUN_FINISH event" };
            return;
          }
          if (activeToolCalls.size > 0) {
            yield { type: "error", error: `Agent stream ended with ${activeToolCalls.size} incomplete tool call(s)` };
            return;
          }
          sawRunFinish = true;
          if (payload.status !== "COMPLETED" && payload.status !== "CANCELLED" && payload.status !== "FAILED") {
            yield { type: "error", error: "Agent stream RUN_FINISH has an invalid status" };
            return;
          }
          if (payload.status === "FAILED") yield { type: "error", error: typeof payload.error === "string" ? payload.error : "Execution failed on server" };
          yield { type: "lifecycle", lifecycle: "afterInvocationEvent", runId: expectedRunId };
        } else {
          yield { type: "error", error: `Agent stream returned unsupported event ${eventType}` };
          return;
        }
      }
    }

    if (!sawRunStart || !sawRunFinish) {
      yield { type: "error", error: `Agent stream ended without the required lifecycle (runStart=${sawRunStart}, runFinish=${sawRunFinish})` };
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
  providerConfig?: { provider: ProviderId; config: ProviderConfig },
  sessionId?: string,
): Promise<void> {
  const { onChunk, onActivityStep, onToolEvent, onRunStart, onDone, onError } = callbacks;
  let accumulated = "";

  try {
    for await (const event of iterateAgentStream(prompt, signal, providerConfig, sessionId)) {
      if (signal?.aborted) return;

      if (event.type === "data" && event.data) {
        accumulated += event.data;
        onChunk(event.data);
      } else if (event.type === "step" && event.step) {
        onActivityStep(event.step);
      } else if (event.type === "lifecycle" && event.lifecycle === "beforeInvocationEvent" && event.runId) {
        onRunStart?.(event.runId);
      } else if ((event.type === "tool_use" || event.type === "tool_running" || event.type === "tool_result" || event.type === "tool_error") && onToolEvent) {
        onToolEvent(event);
      } else if (event.type === "error" && event.error) {
        throw new Error(event.error);
      }
    }

    if (signal?.aborted) return;
    if (!accumulated) {
      onError(new Error("Agent stream completed without text output"));
      return;
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

    return readJsonResponse<T>(res, `${options.method || "GET"} ${path}`);
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export interface StatusResponse {
  ok: boolean;
  operation: "getStatus";
  status: string;
  currentStage: string;
  gate1: { status: string; approved?: boolean };
  gate2: { status: string; approved?: boolean };
  providers: Record<string, unknown>;
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
    const response = await this.http.post<unknown>("/api/v2/getStatus", { sessionId });
    if (!isRecord(response) || response.ok !== true || response.operation !== "getStatus" ||
      typeof response.status !== "string" || typeof response.currentStage !== "string" ||
      !isRecord(response.gate1) || typeof response.gate1.status !== "string" ||
      !isRecord(response.gate2) || typeof response.gate2.status !== "string" ||
      !isRecord(response.providers) || typeof response.activeSessions !== "number") {
      throw new Error("getStatus response failed its operation/status contract");
    }
    return response as unknown as StatusResponse;
  }

  /**
   * Action API v2: promptAgent (Unified Reasoning & Agent Invocation)
   */
  async promptAgent<T = any>(payload: PromptAgentPayload): Promise<T> {
    const response = await this.http.post<unknown>("/api/v2/promptAgent", payload);
    if (!isRecord(response) || response.ok !== true || response.operation !== "promptAgent" ||
      typeof response.runId !== "string" || !response.runId || !isRecord(response.response) ||
      payload.runId && response.runId !== payload.runId) {
      throw new Error("promptAgent response failed its operation/run correlation contract");
    }
    return response as T;
  }

  /**
   * Action API v2: executeTool
   */
  async executeTool<T = any>(payload: ExecuteToolPayload): Promise<T> {
    const response = await this.http.post<unknown>("/api/v2/executeTool", payload);
    if (!isRecord(response) || response.ok !== true || response.operation !== "executeTool" ||
      response.toolName !== payload.toolName || !("result" in response)) {
      throw new Error("executeTool response failed its operation/tool correlation contract");
    }
    return response as T;
  }

  /**
   * Action API v2: configureProvider
   */
  async configureProvider<T = any>(payload: ConfigureProviderPayload): Promise<T> {
    const response = await this.http.post<unknown>("/api/v2/configureProvider", payload);
    if (!isRecord(response) || response.ok !== true || response.operation !== "configureProvider" ||
      response.configured !== true || response.provider !== payload.provider ||
      payload.sessionId && response.sessionId !== payload.sessionId) {
      throw new Error("configureProvider response failed its operation/provider/session contract");
    }
    return response as T;
  }

  /**
   * Action API v2: switchProvider
   */
  async switchProvider<T = any>(payload: SwitchProviderPayload): Promise<T> {
    const response = await this.http.post<unknown>("/api/v2/switchProvider", payload);
    if (!isRecord(response) || response.ok !== true || response.operation !== "switchProvider" ||
      response.success !== true || response.provider !== payload.provider ||
      payload.sessionId && response.sessionId !== payload.sessionId) {
      throw new Error("switchProvider response failed its operation/provider/session contract");
    }
    return response as T;
  }

  /**
   * Action API v2: transitionStage
   */
  async transitionStage<T = any>(payload: TransitionStagePayload): Promise<T> {
    const response = await this.http.post<unknown>("/api/v2/transitionStage", payload);
    if (!isRecord(response) || response.ok !== true || response.operation !== "transitionStage" ||
      typeof response.fromStage !== "string" || typeof response.toStage !== "string") {
      throw new Error("transitionStage response failed its operation/stage contract");
    }
    return response as T;
  }

  /**
   * Action API v2: validateFixtures
   */
  async validateFixtures<T = any>(payload: ValidateFixturesPayload = {}): Promise<T> {
    const response = await this.http.post<unknown>("/api/v2/validateFixtures", payload);
    if (!isRecord(response) || response.ok !== true || response.operation !== "validateFixtures" ||
      typeof response.actualHash !== "string" || response.actualHash !== response.expectedHash ||
      payload.fixture_id && response.fixture_id !== payload.fixture_id ||
      payload.sessionId && response.session_id !== payload.sessionId ||
      payload.expectedHash && response.expectedHash !== payload.expectedHash) {
      throw new Error("validateFixtures response failed its operation/hash/session contract");
    }
    return response as T;
  }

  /**
   * Action API v2: exportBundle (Portable Snapshot Extraction)
   */
  async exportBundle<T = any>(sessionId?: string): Promise<T> {
    const response = await this.http.post<unknown>("/api/v2/exportBundle", { sessionId });
    if (!isRecord(response) || response.ok !== true || response.operation !== "exportBundle" || !isRecord(response.item)) {
      throw new Error("exportBundle response failed its operation/item contract");
    }
    return response as T;
  }

  /**
   * Action API v2: importBundle (Portable Snapshot Ingestion)
   */
  async importBundle<T = any>(bundleData: unknown, sessionId?: string): Promise<T> {
    const response = await this.http.post<unknown>("/api/v2/importBundle", { bundleData, sessionId });
    if (!isRecord(response) || response.ok !== true || response.operation !== "importBundle" ||
      !isRecord(response.item) || sessionId && response.item.id !== sessionId) {
      throw new Error("importBundle response failed its operation/item/session contract");
    }
    return response as T;
  }
}

export const defaultOneShotApi = new OneShotPublicApi();




