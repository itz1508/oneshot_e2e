/**
 * OneShot Strands AG-UI Server Adapter
 *
 * Implements the official AG-UI protocol integration for Strands Agents per:
 * https://strandsagents.com/docs/integrations/integrations/ag-ui/
 * https://github.com/ag-ui-protocol/ag-ui
 *
 * Invariants:
 * 1. Backend Ownership: Translates real Strands Agent stream events to standard AG-UI SSE protocol.
 * 2. Server-side Credentials: Uses server-owned credentials from environment (GEMINI_API_KEY, OPENAI_API_KEY).
 * 3. No Simulated Progress: Only emits events corresponding to actual agent actions.
 * 4. Safe Error Propagation: Emits RUN_FINISH with status FAILED upon error.
 * 5. Complete Tool Lifecycle: TOOL_CALL_START → TOOL_CALL_RUNNING → TOOL_CALL_FINISH|TOOL_CALL_ERROR
 * 6. Call Correlation: Every tool call and result share stable toolUseId for correlation.
 */

import type { Agent, AgentStreamEvent } from "@strands-agents/sdk";

export type AgUiServerEventType =
  | "RUN_START"
  | "RUN_FINISH"
  | "STEP_START"
  | "STEP_FINISH"
  | "TEXT_MESSAGE_DELTA"
  | "TOOL_CALL_START"
  | "TOOL_CALL_RUNNING"
  | "TOOL_CALL_FINISH"
  | "TOOL_CALL_ERROR";

export interface AgUiServerEvent {
  type: AgUiServerEventType;
  runId: string;
  timestamp: string;
  [key: string]: unknown;
}

/**
 * Formats an AG-UI event as an HTTP Server-Sent Event (SSE) payload block.
 */
export function formatAgUiSse(event: AgUiServerEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export interface StreamStrandsAgUiOptions {
  agent: Agent;
  prompt: string;
  runId?: string;
  signal?: AbortSignal;
  invocationState?: Record<string, unknown>;
}

/**
 * Maintains stable toolUseId → metadata mapping for concurrent tool execution.
 */
interface ActiveToolCall {
  toolUseId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  startedAt: number;
}

/**
 * Executes a real Strands Agent stream and yields formatted AG-UI Server-Sent Events.
 *
 * Tool Lifecycle Contract:
 * - TOOL_CALL_START: Tool invocation begins (parameters may be partial during streaming)
 * - TOOL_CALL_RUNNING: Tool acknowledged as running (emitted after START, before result)
 * - TOOL_CALL_FINISH: Tool completed successfully with result
 * - TOOL_CALL_ERROR: Tool failed with error
 *
 * Call Correlation:
 * - Every event carries stable toolUseId matching the original TOOL_CALL_START
 * - Multiple concurrent tools can run independently and resolve independently
 */
export async function* streamStrandsToAgUi(
  options: StreamStrandsAgUiOptions
): AsyncGenerator<AgUiServerEvent, void, unknown> {
  const runId = options.runId || `run-${Date.now().toString(36)}`;
  const now = () => new Date().toISOString();
  const invocationState: Record<string, unknown> = options.invocationState || {
    runId,
    startedAt: now(),
  };

  // Track active tool calls to enforce complete lifecycle
  const activeToolCalls = new Map<string, ActiveToolCall>();
  const emittedRunningState = new Set<string>();

  // 1. RUN_START
  yield {
    type: "RUN_START",
    runId,
    timestamp: now(),
    agentName: "OneShot Strands Agent",
  };

  let stepCount = 0;
  let activeStepId: string | null = null;
  let activeStepLabel: string | null = null;
  let accumulatedText = "";

  try {
    for await (const event of options.agent.stream(options.prompt, {
      invocationState,
      cancelSignal: options.signal,
    })) {
      if (options.signal?.aborted) {
        yield {
          type: "RUN_FINISH",
          runId,
          timestamp: now(),
          status: "CANCELLED",
          finalMessage: accumulatedText,
          finalInvocationState: invocationState,
        };
        return;
      }

      const raw = (event as unknown) as Record<string, unknown>;
      const rawType = typeof raw.type === "string" ? raw.type : "";

      // -- Text deltas ----------------------------------------------------------
      // Real Strands shape:
      //   { type: "modelStreamUpdateEvent",
      //     event: { type: "modelContentBlockDeltaEvent",
      //              delta: { type: "textDelta", text: "..." } } }
      // The previous implementation read a top-level `data`/`text` field that
      // this SDK version never emits, so no model output was ever captured and
      // every live run terminated as an empty stream.
      const nestedEvent = (raw.event ?? {}) as Record<string, unknown>;
      const nestedDelta = (nestedEvent.delta ?? {}) as Record<string, unknown>;
      let chunk: string | null = null;

      if (rawType === "modelStreamUpdateEvent" && nestedEvent.type === "modelContentBlockDeltaEvent") {
        if (nestedDelta.type === "textDelta" && typeof nestedDelta.text === "string") {
          chunk = nestedDelta.text;
        }
      } else if (
        rawType === "data" ||
        rawType === "chunk" ||
        typeof raw.text === "string" ||
        typeof raw.data === "string"
      ) {
        // Legacy/compat shapes retained so existing integrations keep working.
        const legacy = (raw.data || raw.text || raw.delta || "") as string;
        if (legacy) chunk = legacy;
      }

      if (chunk) {
        accumulatedText += chunk;
        yield {
          type: "TEXT_MESSAGE_DELTA",
          runId,
          timestamp: now(),
          delta: chunk,
        };
      }

      // -- Step lifecycle -------------------------------------------------------
      // Real events carry the name in `type`; `lifecycle` is a compat shim.
      // "lifecycle" is a generic legacy wrapper, so the inner `lifecycle`
      // value takes precedence over it when present.
      const stepName =
        rawType && rawType !== "lifecycle"
          ? rawType
          : typeof raw.lifecycle === "string"
            ? raw.lifecycle
            : "";

      if (stepName === "beforeModelCallEvent" || stepName === "beforeToolsEvent") {
        stepCount++;
        activeStepId = `step-${stepCount}`;
        activeStepLabel = stepName;
        yield {
          type: "STEP_START",
          runId,
          timestamp: now(),
          stepId: activeStepId,
          label: stepName,
        };
      }

      if (stepName === "afterModelCallEvent" || stepName === "afterToolsEvent") {
        if (activeStepId) {
          yield {
            type: "STEP_FINISH",
            runId,
            timestamp: now(),
            stepId: activeStepId,
            status: "completed",
            // Repeat the label so the consumer can close the step by id alone
            // and show the real step name, not a generic placeholder.
            label: activeStepLabel ?? stepName,
          };
          activeStepId = null;
          activeStepLabel = null;
        }
      }

      // -- Tool call start ------------------------------------------------------
      // Real shape: { type: "beforeToolCallEvent", toolUse: { name, toolUseId, input } }
      // Only this event opens a call. `contentBlockEvent` and
      // `modelContentBlockStartEvent` carry the same toolUse and previously
      // opened duplicate calls via the `raw.tool` fallback.
      if (rawType === "beforeToolCallEvent") {
        const toolUse = (raw.toolUse ?? {}) as Record<string, unknown>;
        const toolUseId = (toolUse.toolUseId as string) || `tool-${Date.now()}`;
        const toolName = (toolUse.name as string) || "unknownTool";
        const parameters = (toolUse.input ?? {}) as Record<string, unknown>;

        activeToolCalls.set(toolUseId, {
          toolUseId,
          toolName,
          parameters,
          startedAt: Date.now(),
        });

        yield {
          type: "TOOL_CALL_START",
          runId,
          timestamp: now(),
          toolUseId,
          toolName,
          parameters,
        };

        yield {
          type: "TOOL_CALL_RUNNING",
          runId,
          timestamp: now(),
          toolUseId,
          toolName,
        };
        emittedRunningState.add(toolUseId);
      }

      // -- Tool call result -----------------------------------------------------
      // Real shape:
      //   { type: "afterToolCallEvent", toolUse: { name, toolUseId },
      //     result: ToolResultBlock { type, toolUseId, status, content, error },
      //     error }
      // The previous implementation matched `type === "tool_result"`, which this
      // SDK never emits, so TOOL_CALL_FINISH was never produced and the real tool
      // output was silently discarded.
      if (rawType === "afterToolCallEvent") {
        const toolUse = (raw.toolUse ?? {}) as Record<string, unknown>;
        // `result` IS the ToolResultBlock. Only its toJSON() wraps it as
        // { toolResult: ... } on the wire, so reading a .toolResult property
        // yields undefined and the emitted payload would serialise to {}.
        const toolResult = (raw.result ?? {}) as Record<string, unknown>;
        const toolUseId = (toolResult.toolUseId as string) || (toolUse.toolUseId as string) || "";
        const toolCall = activeToolCalls.get(toolUseId);
        const toolName = toolCall?.toolName || (toolUse.name as string) || "tool";
        const content = toolResult.content as Array<Record<string, unknown>> | undefined;
        const toolError = raw.error ?? toolResult.error;

        if (toolError || toolResult.status === "error") {
          const firstBlock = content?.[0];
          const errorMsg =
            toolError instanceof Error
              ? toolError.message
              : String(toolError ?? firstBlock?.text ?? "Tool execution failed");

          yield {
            type: "TOOL_CALL_ERROR",
            runId,
            timestamp: now(),
            toolUseId,
            toolName,
            error: errorMsg,
            status: "error",
          };
        } else {
          yield {
            type: "TOOL_CALL_FINISH",
            runId,
            timestamp: now(),
            toolUseId,
            toolName,
            result: toolResult ?? {},
            status: "success",
          };
        }

        activeToolCalls.delete(toolUseId);
        emittedRunningState.delete(toolUseId);
      }
    }

    // Terminal status must reflect whether the run actually produced output.
    // A stream that ends without any text is a FAILED run, not a success.
    // This matches the local Python reasoner path, which already reports
    // `failed` when no delta was received.
    if (accumulatedText.trim() === "") {
      yield {
        type: "RUN_FINISH",
        runId,
        timestamp: now(),
        status: "FAILED",
        error: "Agent stream completed without producing any text output",
        finalMessage: accumulatedText,
        finalInvocationState: invocationState,
      };
      return;
    }

    // 2. RUN_FINISH (Successful completion)
    yield {
      type: "RUN_FINISH",
      runId,
      timestamp: now(),
      status: "COMPLETED",
      finalMessage: accumulatedText,
      finalInvocationState: invocationState,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    yield {
      type: "RUN_FINISH",
      runId,
      timestamp: now(),
      status: "FAILED",
      error: errorMsg,
      finalMessage: accumulatedText,
      finalInvocationState: invocationState,
    };
  }
}