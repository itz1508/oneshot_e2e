/**
 * useTool(...) Hook — Capability Runtime Owner
 *
 * Implements:
 * - Invariant 4: useTool(...) owns capability runtime.
 * - Invariant 23: Capabilities execute through useTool(...).
 */

import { useState, useCallback, useRef } from "react";
import { ToolCapabilityExecution } from "../types/invariants";
import { readJsonResponse } from "./api";

export interface UseToolReturn {
  // Invariant 4: useTool(...) owns capability runtime
  capabilities: ToolCapabilityExecution[];
  isExecuting: boolean;
  activeToolName: string | null;
  executeTool: (
    toolName: string,
    args: Record<string, unknown>,
    options?: { customEndpoint?: string; signal?: AbortSignal }
  ) => Promise<unknown>;
  registerExecution: (execution: ToolCapabilityExecution) => void;
  updateExecution: (callId: string, patch: Partial<ToolCapabilityExecution>) => void;
  clearHistory: () => void;
}

export function useTool(): UseToolReturn {
  const [capabilities, setCapabilities] = useState<ToolCapabilityExecution[]>([]);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const activeCountRef = useRef<number>(0);

  const registerExecution = useCallback((execution: ToolCapabilityExecution) => {
    setCapabilities((prev) => [...prev, execution]);
  }, []);

  const updateExecution = useCallback((callId: string, patch: Partial<ToolCapabilityExecution>) => {
    setCapabilities((prev) =>
      prev.map((cap) => (cap.callId === callId ? { ...cap, ...patch } : cap))
    );
  }, []);

  const clearHistory = useCallback(() => {
    setCapabilities([]);
    setActiveToolName(null);
    activeCountRef.current = 0;
  }, []);

  // Invariant 23: Capabilities execute through useTool(...)
  const executeTool = useCallback(
    async (
      toolName: string,
      args: Record<string, unknown>,
      options: { customEndpoint?: string; signal?: AbortSignal } = {}
    ): Promise<unknown> => {
      const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const startTime = Date.now();

      const execution: ToolCapabilityExecution = {
        callId,
        toolName,
        args,
        status: "running",
        startTime,
      };

      setCapabilities((prev) => [...prev, execution]);
      setActiveToolName(toolName);
      activeCountRef.current += 1;

      try {
        const endpoint = options.customEndpoint || "/api/tools/execute";
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toolName,
            input: args,
          }),
          signal: options.signal,
        });

        const data = await readJsonResponse<{ success?: boolean; toolName?: string; result?: unknown }>(response, "Capability execution request");
        if (data.success !== true || data.toolName !== toolName || !("result" in data)) {
          throw new Error("Capability execution response did not confirm the tool result");
        }
        const endTime = Date.now();

        updateExecution(callId, {
          status: "finished",
          result: data.result,
          endTime,
        });

        return data.result;
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Capability execution failed";
        updateExecution(callId, {
          status: "error",
          error: errorMessage,
          endTime: Date.now(),
        });
        throw err;
      } finally {
        activeCountRef.current = Math.max(0, activeCountRef.current - 1);
        if (activeCountRef.current === 0) {
          setActiveToolName(null);
        }
      }
    },
    [updateExecution]
  );

  return {
    capabilities,
    isExecuting: activeCountRef.current > 0 || activeToolName !== null,
    activeToolName,
    executeTool,
    registerExecution,
    updateExecution,
    clearHistory,
  };
}
