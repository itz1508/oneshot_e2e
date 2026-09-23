/**
 * Conversation.tsx — Main Screen Conversation Stream
 *
 * Implements:
 * - Invariant 1: Session owns conversation.
 * - Invariant 6: Main owns response.
 * - Invariant 22: Conversation flows through useStream(...).
 */

import React, { useRef, useEffect } from "react";
import { StreamMessage } from "../../types/invariants";
import { ToolCapabilityExecution } from "../../types/invariants";

export interface ConversationProps {
  sessionId: string;
  sessionLabel: string;
  messages: StreamMessage[];
  streamingChunk?: string;
  isStreaming: boolean;
  error?: string | null;
  activeCapabilities?: ToolCapabilityExecution[];
}

export const Conversation: React.FC<ConversationProps> = ({
  sessionId,
  sessionLabel,
  messages,
  streamingChunk,
  isStreaming,
  error,
  activeCapabilities = [],
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingChunk, isStreaming]);

  return (
    <div
      className="flex flex-col h-full overflow-y-auto px-4 py-3 space-y-4"
      role="region"
      aria-label={`Conversation for ${sessionLabel}`}
      data-session-id={sessionId}
    >
      {/* Session Header Badge: Invariant 16: Session Label != session_id */}
      <div className="flex items-center justify-between py-1.5 px-3 bg-[#18181b]/60 rounded-md border border-[#27272a] text-xs">
        <span className="text-zinc-400 font-medium">Session: {sessionLabel}</span>
        <span className="text-zinc-500 font-mono text-[11px]">session_id: {sessionId}</span>
      </div>

      {messages.length === 0 && !isStreaming && (
        <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-500">
          <div className="w-10 h-10 rounded-full bg-zinc-800/80 flex items-center justify-center text-zinc-400 mb-2">
            💬
          </div>
          <p className="text-sm font-medium text-zinc-300">Start a conversation</p>
          <p className="text-xs text-zinc-500 mt-1">
            Prompt the agent to begin research, planning, or code generation.
          </p>
        </div>
      )}

      {/* Messages Stream: Invariant 22 */}
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex flex-col ${
            msg.role === "user" ? "items-end" : "items-start"
          } space-y-1`}
          data-message-id={msg.id}
        >
          <div className="flex items-center space-x-2 text-[11px] text-zinc-500 px-1">
            <span className="font-semibold capitalize text-zinc-400">
              {msg.role === "user" ? "You" : "OneShot Main Agent"}
            </span>
            <span>•</span>
            <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>

          <div
            className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60"
                : "bg-[#18181b] text-zinc-200 border border-zinc-800 shadow-sm"
            }`}
          >
            {msg.content}
          </div>
        </div>
      ))}

      {/* Active Capabilities (Tools in flight from useTool) */}
      {activeCapabilities.length > 0 && (
        <div className="space-y-1.5 py-1">
          {activeCapabilities.map((cap) => (
            <div
              key={cap.callId}
              className="flex items-center space-x-2 px-3 py-1.5 rounded bg-zinc-900/90 border border-zinc-800 text-xs"
            >
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="font-mono text-blue-400 font-medium">{cap.toolName}</span>
              <span className="text-zinc-500">running capability...</span>
            </div>
          ))}
        </div>
      )}

      {/* Active Streaming Chunk (Main owns response: Invariant 6) */}
      {isStreaming && (
        <div className="flex flex-col items-start space-y-1">
          <div className="flex items-center space-x-2 text-[11px] text-zinc-500 px-1">
            <span className="font-semibold text-emerald-400">OneShot Main Agent</span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-zinc-500">streaming response</span>
          </div>
          <div className="max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap bg-[#18181b] text-zinc-200 border border-emerald-900/40 shadow-sm">
            {streamingChunk ? (
              <>
                {streamingChunk}
                <span className="inline-block w-1.5 h-4 ml-1 bg-emerald-400 animate-pulse align-middle" />
              </>
            ) : (
              <span className="text-zinc-500 italic">Thinking...</span>
            )}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          className="p-3 rounded-lg border border-red-500/40 bg-red-950/20 text-red-300 text-xs flex items-center space-x-2"
          role="alert"
        >
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
