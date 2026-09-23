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

      // Text delta events
      if (raw.type === "data" || raw.type === "chunk" || typeof raw.text === "string" || typeof raw.data === "string") {
        const chunk = (raw.data || raw.text || raw.delta || "") as string;
        if (chunk) {
          accumulatedText += chunk;
          yield {
            type: "TEXT_MESSAGE_DELTA",
            runId,
            timestamp: now(),
            delta: chunk,
          };
        }
      }

      // Lifecycle / Step start
      if (raw.type === "lifecycle" || raw.lifecycle === "beforeModelCallEvent" || raw.lifecycle === "beforeToolsEvent") {
        stepCount++;
        activeStepId = `step-${stepCount}`;
        yield {
          type: "STEP_START",
          runId,
          timestamp: now(),
          stepId: activeStepId,
          label: (raw.lifecycle || raw.name || "Processing step") as string,
        };
      }

      // Step finish
      if (raw.lifecycle === "afterModelCallEvent" || raw.lifecycle === "afterToolsEvent") {
        if (activeStepId) {
          yield {
            type: "STEP_FINISH",
            runId,
            timestamp: now(),
            stepId: activeStepId,
            status: "completed",
          };
          activeStepId = null;
        }
      }

      // Tool call start
      if (raw.type === "tool_use" || raw.tool) {
        const toolObj = (raw.tool || raw) as Record<string, unknown>;
        const toolUseId = (toolObj.toolUseId || toolObj.id || `tool-${Date.now()}`) as string;
        const toolName = (toolObj.name || "unknownTool") as string;
        const parameters = (toolObj.input || toolObj.parameters || {}) as Record<string, unknown>;

        // Track active tool call for correlation
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

        // Emit RUNNING state immediately after START
        yield {
          type: "TOOL_CALL_RUNNING",
          runId,
          timestamp: now(),
          toolUseId,
          toolName,
        };
        emittedRunningState.add(toolUseId);
      }

      // Tool call finish (success)
      if (raw.type === "tool_result" && !raw.error) {
        const resObj = (raw.result || raw) as Record<string, unknown>;
        const toolUseId = (resObj.toolUseId || "") as string;
        const toolCall = activeToolCalls.get(toolUseId);
        const toolName = toolCall?.toolName || (resObj.toolName as string) || "tool";

        yield {
          type: "TOOL_CALL_FINISH",
          runId,
          timestamp: now(),
          toolUseId,
          toolName,
          result: resObj,
          status: "success",
        };

        activeToolCalls.delete(toolUseId);
        emittedRunningState.delete(toolUseId);
      }

      // Tool call error
      if (raw.type === "tool_result" && raw.error) {
        const resObj = (raw.result || raw) as Record<string, unknown>;
        const toolUseId = (resObj.toolUseId || "") as string;
        const toolCall = activeToolCalls.get(toolUseId);
        const toolName = toolCall?.toolName || (resObj.toolName as string) || "tool";
        const errorMsg = (raw.error instanceof Error ? raw.error.message : String(raw.error)) || "Unknown error";

        yield {
          type: "TOOL_CALL_ERROR",
          runId,
          timestamp: now(),
          toolUseId,
          toolName,
          error: errorMsg,
          status: "error",
        };

        activeToolCalls.delete(toolUseId);
        emittedRunningState.delete(toolUseId);
      }
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
