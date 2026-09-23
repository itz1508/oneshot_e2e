/**
 * ChatShell.tsx — Main Screen Orchestrator
 *
 * Implements:
 * - Orchestrates: Conversation, ArtifactView, PreviewView
 * - Consumes: useStream(...), BuildCompleted, ValidationConfirmed
 * - Invariant 1: Session owns conversation
 * - Invariant 6: Main owns response
 * - Invariant 18: Every Artifact requires a Consumer
 * - Invariant 22: Conversation flows through useStream(...)
 */

import React, { useState } from "react";
import { Conversation } from "./Conversation";
import { ArtifactView } from "./ArtifactView";
import { PreviewView } from "./PreviewView";
import { useStream, UseStreamReturn } from "../../lib/useStream";
import {
  ArtifactEntity,
  BuildCompletedEvent,
  ValidationConfirmedEvent,
  ToolCapabilityExecution,
} from "../../types/invariants";

export type MainViewTab = "conversation" | "artifact" | "preview" | "split";

export interface ChatShellProps {
  sessionId: string;
  sessionLabel: string;
  streamHook?: UseStreamReturn;
  artifacts?: ArtifactEntity[];
  activeCapabilities?: ToolCapabilityExecution[];
  mockScreenHtml?: string;
  onSendPrompt?: (text: string) => void;
}

export const ChatShell: React.FC<ChatShellProps> = ({
  sessionId,
  sessionLabel,
  streamHook,
  artifacts = [],
  activeCapabilities = [],
  mockScreenHtml,
}) => {
  // If streamHook isn't passed from parent, initialize directly
  const localStream = useStream({ sessionId });
  const activeStream = streamHook || localStream;

  const [activeTab, setActiveTab] = useState<MainViewTab>("split");
  const [promptText, setPromptText] = useState("");

  const handleSend = () => {
    if (!promptText.trim()) return;
    activeStream.sendMessage(promptText);
    setPromptText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="flex flex-col h-full w-full bg-[#0d0d0e] overflow-hidden"
      role="region"
      aria-label="OneShot Main Screen Chat Shell"
      data-session-id={sessionId}
    >
      {/* View Switcher Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#27272a] bg-[#141416]">
        <div className="flex items-center space-x-1.5">
          <span className="text-xs font-semibold text-zinc-300 mr-2">View:</span>
          {(["conversation", "split", "artifact", "preview"] as MainViewTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Streaming & Status Indicator */}
        <div className="flex items-center space-x-2 text-xs">
          {activeStream.isStreaming && (
            <span className="flex items-center space-x-1.5 text-emerald-400 font-mono text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Streaming active</span>
            </span>
          )}
          {activeStream.latestBuildEvent && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800/40">
              BuildCompleted: {activeStream.latestBuildEvent.build_id}
            </span>
          )}
        </div>
      </div>

      {/* Main Content Area based on Tab */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Conversation View */}
        {(activeTab === "conversation" || activeTab === "split") && (
          <div
            className={`flex flex-col h-full ${
              activeTab === "split" ? "w-1/2 border-r border-[#27272a]" : "w-full"
            }`}
          >
            <div className="flex-1 overflow-y-auto">
              <Conversation
                sessionId={sessionId}
                sessionLabel={sessionLabel}
                messages={activeStream.conversation.messages}
                streamingChunk={activeStream.streamingChunk}
                isStreaming={activeStream.isStreaming}
                error={activeStream.error}
                activeCapabilities={activeCapabilities}
              />
            </div>

            {/* Quick Composer Input Bar */}
            <div className="p-3 border-t border-[#27272a] bg-[#141416]/90 flex items-center space-x-2">
              <input
                type="text"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask OneShot Main Agent or execute a workflow..."
                disabled={activeStream.isStreaming}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-50"
              />
              {activeStream.isStreaming ? (
                <button
                  onClick={activeStream.abort}
                  className="px-3 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-xs font-medium transition-colors"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!promptText.trim()}
                  className="px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-semibold disabled:opacity-40 transition-colors"
                >
                  Send
                </button>
              )}
            </div>
          </div>
        )}

        {/* Secondary View (Split / Artifact / Preview) */}
        {activeTab === "split" && (
          <div className="w-1/2 flex flex-col h-full overflow-hidden">
            <ArtifactView
              artifacts={artifacts}
              buildEvent={activeStream.latestBuildEvent}
              validationEvent={activeStream.latestValidationEvent}
            />
          </div>
        )}

        {activeTab === "artifact" && (
          <div className="w-full flex flex-col h-full overflow-hidden">
            <ArtifactView
              artifacts={artifacts}
              buildEvent={activeStream.latestBuildEvent}
              validationEvent={activeStream.latestValidationEvent}
            />
          </div>
        )}

        {activeTab === "preview" && (
          <div className="w-full flex flex-col h-full overflow-hidden">
            <PreviewView
              buildEvent={activeStream.latestBuildEvent}
              mockScreenHtml={mockScreenHtml}
            />
          </div>
        )}
      </div>
    </div>
  );
};
