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
        const response = await fetch("/api/agent/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            sessionId,
            prompt: content,
            provider: providerId,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`Stream request failed with status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Response body is not readable");
        }

        const decoder = new TextDecoder();
        let accumulatedAssistantText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const rawData = line.slice(6).trim();
              if (rawData === "[DONE]") continue;

              try {
                const parsed = JSON.parse(rawData);

                // Handle text delta
                if (parsed.type === "text-delta" || parsed.delta) {
                  const delta = parsed.delta || parsed.text || "";
                  accumulatedAssistantText += delta;
                  setStreamingChunk(accumulatedAssistantText);
                }

                // Handle BuildCompleted event
                if (parsed.type === "BuildCompleted" || parsed.event === "BuildCompleted") {
                  const bEvent: BuildCompletedEvent = {
                    type: "BuildCompleted",
                    build_id: parsed.build_id || parsed.id || `build_${Date.now()}`,
                    buildManifest: parsed.buildManifest || {
                      build_id: parsed.build_id || `build_${Date.now()}`,
                      commitHash: parsed.commitHash || "HEAD",
                      artifacts: parsed.artifacts || [],
                      manifestHash: parsed.manifestHash || "hash_valid",
                      isValid: true,
                    },
                    timestamp: parsed.timestamp || Date.now(),
                  };
                  setLatestBuildEvent(bEvent);
                  onBuildCompleted?.(bEvent);
                }

                // Handle ValidationConfirmed event
                if (parsed.type === "ValidationConfirmed" || parsed.event === "ValidationConfirmed") {
                  const vEvent: ValidationConfirmedEvent = {
                    type: "ValidationConfirmed",
                    validation_id: parsed.validation_id || parsed.id || `val_${Date.now()}`,
                    validations: parsed.validations || [],
                    allPassed: parsed.allPassed !== false,
                    timestamp: parsed.timestamp || Date.now(),
                  };
                  setLatestValidationEvent(vEvent);
                  onValidationConfirmed?.(vEvent);
                }
              } catch {
                // Raw text stream chunk fallback
                accumulatedAssistantText += rawData;
                setStreamingChunk(accumulatedAssistantText);
              }
            }
          }
        }

        // Commit final assistant message
        if (accumulatedAssistantText) {
          const asstMsg: StreamMessage = {
            id: assistantMessageId,
            role: "assistant",
            content: accumulatedAssistantText,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, asstMsg]);
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") {
          // Aborted gracefully by user
        } else {
          const errorMsg = err instanceof Error ? err.message : "Stream connection failed";
          setError(errorMsg);
        }
      } finally {
        setIsStreaming(false);
        setStreamingChunk("");
        abortControllerRef.current = null;
      }
    },
    [sessionId, isStreaming, onBuildCompleted, onValidationConfirmed]
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
