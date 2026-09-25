/**
 * useStream(...) Hook — Conversation Runtime Owner
 *
 * Implements:
 * - Invariant 3: useStream(...) owns conversation runtime.
 * - Invariant 22: Conversation flows through useStream(...).
 * - Consumes: BuildCompleted, ValidationConfirmed
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  StreamMessage,
  ConversationState,
  BuildCompletedEvent,
  ValidationConfirmedEvent,
} from "../types/invariants";
import { streamAgentExecution } from "./api";
import { ProviderId, ProviderConfig } from "../types";

export interface UseStreamOptions {
  sessionId: string;
  initialMessages?: StreamMessage[];
  onBuildCompleted?: (event: BuildCompletedEvent) => void;
  onValidationConfirmed?: (event: ValidationConfirmedEvent) => void;
}

export interface UseStreamReturn {
  // Invariant 1: Session owns conversation
  // Invariant 3: useStream(...) owns conversation runtime
  conversation: ConversationState;
  isStreaming: boolean;
  streamingChunk: string;
  error: string | null;
  latestBuildEvent: BuildCompletedEvent | null;
  latestValidationEvent: ValidationConfirmedEvent | null;
  sendMessage: (content: string, providerId?: string) => Promise<void>;
  abort: () => void;
  clearMessages: () => void;
  appendMessage: (message: StreamMessage) => void;
  setStreamChunk: (chunk: string) => void;
}

export function useStream({
  sessionId,
  initialMessages = [],
  onBuildCompleted,
  onValidationConfirmed,
}: UseStreamOptions): UseStreamReturn {
  const [messages, setMessages] = useState<StreamMessage[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [streamingChunk, setStreamingChunk] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [latestBuildEvent, setLatestBuildEvent] = useState<BuildCompletedEvent | null>(null);
  const [latestValidationEvent, setLatestValidationEvent] = useState<ValidationConfirmedEvent | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync initial messages when session changes
  useEffect(() => {
    setMessages(initialMessages);
  }, [sessionId]);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setStreamingChunk("");
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingChunk("");
    setError(null);
  }, []);

  const appendMessage = useCallback((message: StreamMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const setStreamChunk = useCallback((chunk: string) => {
    setStreamingChunk(chunk);
  }, []);

  const sendMessage = useCallback(
    async (content: string, providerId: string = "gemini") => {
      if (!content.trim() || isStreaming) return;

      setError(null);
      const userMessageId = `msg_user_${Date.now()}`;
      const assistantMessageId = `msg_asst_${Date.now()}`;

      const userMsg: StreamMessage = {
        id: userMessageId,
        role: "user",
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setStreamingChunk("");

      abortControllerRef.current = new AbortController();

      try {
        const selectedProvider: ProviderId = providerId === "openai" || providerId === "nebius" ? providerId : "gemini";
        const providerConfig: ProviderConfig = {
          key: "",
          model: "",
          baseUrl: "",
          temperature: "0.4",
          configured: true,
        };
        let accumulatedAssistantText = "";

        await streamAgentExecution(
          content,
          {
            onChunk: (delta) => {
              accumulatedAssistantText += delta;
              setStreamingChunk(accumulatedAssistantText);
            },
            onActivityStep: () => {
              // Reference-only consumers do not project activity steps.
            },
            onDone: (fullContent) => {
              if (!fullContent) {
                setError("Agent stream completed without text output");
                return;
              }
              const asstMsg: StreamMessage = {
                id: assistantMessageId,
                role: "assistant",
                content: fullContent,
                timestamp: new Date().toISOString(),
              };
              setMessages((prev) => [...prev, asstMsg]);
            },
            onError: (streamError) => {
              if (streamError.name !== "AbortError") setError(streamError.message);
            },
          },
          abortControllerRef.current.signal,
          { provider: selectedProvider, config: providerConfig },
          sessionId,
        );
      } finally {
        setIsStreaming(false);
        setStreamingChunk("");
        abortControllerRef.current = null;
      }
    },
    [sessionId, isStreaming]
  );

  const conversation: ConversationState = {
    session_id: sessionId,
    messages,
    streamingChunk: isStreaming ? streamingChunk : undefined,
    isStreaming,
  };

  return {
    conversation,
    isStreaming,
    streamingChunk,
    error,
    latestBuildEvent,
    latestValidationEvent,
    sendMessage,
    abort,
    clearMessages,
    appendMessage,
    setStreamChunk,
  };
}
