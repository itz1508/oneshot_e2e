import React, { useState, useMemo, useCallback } from "react";
import { ToolCallState } from "../types";

export interface ToolCallListProps {
  toolCalls?: ToolCallState[];
}

/**
 * LoadingCard: Shows tool name, args preview, and pulsing state during execution.
 * Uses semantic <section> and proper ARIA labels for status.
 */
export const LoadingCard: React.FC<{ name: string; args?: unknown }> = ({
  name,
  args,
}) => {
  return (
    <section
      className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/10 bg-[#16171a] text-xs font-mono-code text-[#c0c0c5] animate-pulse my-1.5"
      role="status"
      aria-label={`Tool running: ${name}`}
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full bg-[#79a8ea] animate-ping"
          aria-hidden="true"
        />
        <span className="font-semibold text-[#f0f0f3]">{name}</span>
        {args !== undefined && (
          <span
            className="text-[#8e8e93] text-[11px] truncate max-w-[240px]"
            title={typeof args === "object" ? JSON.stringify(args) : String(args)}
          >
            {typeof args === "object" ? JSON.stringify(args) : String(args)}
          </span>
        )}
      </div>
      <span
        className="text-[10px] text-[#79a8ea] uppercase tracking-wider font-semibold"
        aria-hidden="true"
      >
        Running
      </span>
    </section>
  );
};

/**
 * ToolCard: Handles finished and error states, with collapsible JSON fallback.
 * Uses semantic <article> and proper ARIA labels for expandable state.
 */
export const ToolCard: React.FC<{ toolCall: ToolCallState }> = ({
  toolCall,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const isError = toolCall.status === "error";

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const renderResult = useMemo(() => {
    return (res: unknown) => {
      if (res === undefined || res === null) {
        return (
          <span className="text-[#8e8e93] italic">No output returned</span>
        );
      }
      if (typeof res === "string") {
        return (
          <span className="text-[#d0d0d5] leading-relaxed break-words">
            {res}
          </span>
        );
      }
      return (
        <pre className="text-[11px] font-mono-code text-[#a0a0a5] bg-black/30 p-2 rounded overflow-x-auto max-h-48">
          {JSON.stringify(res, null, 2)}
        </pre>
      );
    };
  }, []);

  return (
    <article
      className="my-1.5 rounded-lg border border-white/10 bg-[#141517] overflow-hidden text-xs"
      role="region"
      aria-label={`Tool call: ${toolCall.name} - ${isError ? "Error" : "Finished"}`}
    >
      <button
        type="button"
        onClick={handleToggleExpand}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/20"
        aria-expanded={isExpanded}
        aria-controls={`tool-result-${toolCall.callId}`}
      >
        <div className="flex items-center gap-2 font-mono-code min-w-0">
          <span
            className="text-[#8e8e93] flex-shrink-0"
            aria-hidden="true"
          >
            {isExpanded ? "▾" : "▸"}
          </span>
          <span className="font-semibold text-[#f0f0f3]">{toolCall.name}</span>
          {toolCall.args && (
            <span
              className="text-[#6e6e73] text-[10px] truncate max-w-[200px]"
              title={
                typeof toolCall.args === "object"
                  ? JSON.stringify(toolCall.args)
                  : String(toolCall.args)
              }
            >
              {typeof toolCall.args === "object"
                ? JSON.stringify(toolCall.args)
                : String(toolCall.args)}
            </span>
          )}
        </div>
        <span
          className={`text-[9px] uppercase font-mono-code font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${
            isError
              ? "bg-[#ff453a]/15 text-[#ff453a] border-[#ff453a]/30"
              : "bg-[#62c48d]/15 text-[#62c48d] border-[#62c48d]/30"
          }`}
          aria-hidden="true"
        >
          {isError ? "Error" : "Finished"}
        </span>
      </button>

      {isExpanded && (
        <section
          id={`tool-result-${toolCall.callId}`}
          className="px-3 pb-2.5 pt-1 border-t border-white/5 space-y-1 bg-black/20"
        >
          <header className="text-[10px] uppercase font-mono-code text-[#6e6e73]">
            Result
          </header>
          {isError ? (
            <div className="text-xs text-[#ff453a] font-mono-code leading-relaxed">
              {toolCall.error || String(toolCall.result)}
            </div>
          ) : (
            renderResult(toolCall.result)
          )}
        </section>
      )}
    </article>
  );
};

/**
 * ToolCallList: Renders tool calls inline with streaming text.
 * Manages parallel execution by separating pending (running) and completed (finished/error) cards.
 * Uses semantic <ul>/<li> structure and Map-based state management.
 */
export const ToolCallList: React.FC<ToolCallListProps> = ({ toolCalls }) => {
  if (!toolCalls || toolCalls.length === 0) return null;

  // Use a Map-like structure for tool state to avoid filter().map() collision issues
  const toolStateMap = useMemo(() => {
    const map = new Map<string, ToolCallState>();
    toolCalls.forEach((tc) => {
      map.set(tc.callId, tc);
    });
    return map;
  }, [toolCalls]);

  const { pending, completed } = useMemo(() => {
    return {
      pending: Array.from(toolStateMap.values()).filter(
        (tc) => tc.status === "running"
      ),
      completed: Array.from(toolStateMap.values()).filter(
        (tc) => tc.status === "finished" || tc.status === "error"
      ),
    };
  }, [toolStateMap]);

  return (
    <ul
      className="space-y-1.5 my-2.5 list-none p-0"
      role="list"
      aria-label={`Tool calls: ${toolCalls.length} total`}
    >
      {completed.map((tc) => (
        <li key={tc.callId} role="listitem">
          <ToolCard toolCall={tc} />
        </li>
      ))}
      {pending.map((tc) => (
        <li key={tc.callId} role="listitem">
          <LoadingCard name={tc.name} args={tc.args} />
        </li>
      ))}
    </ul>
  );
};
