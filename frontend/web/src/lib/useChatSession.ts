import { useState, useEffect, useRef } from "react";
import {
  Session,
  Message,
  EarlierContextItem,
  ProviderId,
  ProviderConfig,
  ActivityStep,
} from "../types";
import {
  loadStoredSessions,
  saveStoredSessions,
  getActiveSessionId,
  setActiveSessionId,
} from "./storage";
import { getStoredProviderConfig, saveProviderConfig } from "./providers";
import { readJsonResponse, isRecord, resolveApiUrl, streamAgentExecution, StrandsStreamEvent } from "./api";
import { TaskEvent } from "../components/ContextReviewDrawer";

const ACTIVE_RUN_ID_KEY = "oneshot_active_run_id_v1";

export function useChatSession() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string>("");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<"IDLE" | "RUNNING" | "COMPLETED" | "CANCELLED" | "FAILED">("IDLE");
  const [isRunning, setIsRunning] = useState(false);
  const [activitySteps, setActivitySteps] = useState<ActivityStep[]>([]);
  const [toolEvents, setToolEvents] = useState<StrandsStreamEvent[]>([]);
  const [taskEvents, setTaskEvents] = useState<TaskEvent[]>([]);
  const [activityStartTime, setActivityStartTime] = useState<number>(Date.now());
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);

  const [providerConfigs, setProviderConfigs] = useState<Record<ProviderId, ProviderConfig>>({
    gemini: getStoredProviderConfig("gemini"),
    openai: getStoredProviderConfig("openai"),
    nebius: getStoredProviderConfig("nebius"),
  });

  const [systemStatusText, setSystemStatusText] = useState<string>("System Online");
  const [startupError, setStartupError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);

  useEffect(() => {
    const loaded = loadStoredSessions();
    setSessions(loaded);
    const activeId = getActiveSessionId();
    if (loaded.some((session) => session.id === activeId)) {
      setActiveSessionIdState(activeId);
    } else if (loaded.length > 0) {
      setActiveSessionIdState(loaded[0].id);
    }

    sessionStorage.removeItem(ACTIVE_RUN_ID_KEY);
    localStorage.removeItem(ACTIVE_RUN_ID_KEY);
    setActiveRunId(null);
    setRunStatus("IDLE");

    const requests: Promise<void>[] = [
      fetch(resolveApiUrl("/api/session/checkpoints"))
        .then((response) => readJsonResponse<{ checkpoints?: unknown[] }>(response, "Checkpoint request"))
        .then((data) => {
          if (!Array.isArray(data.checkpoints)) {
            throw new Error("Checkpoint response is missing checkpoints array");
          }
          if (!data.checkpoints.length) return;
          const mapped: EarlierContextItem[] = data.checkpoints.map((checkpoint) => {
            if (!isRecord(checkpoint) || ((typeof checkpoint.restoreId !== "string") && (typeof checkpoint.id !== "string")) || (!checkpoint.restoreId && !checkpoint.id) || typeof checkpoint.title !== "string") {
              throw new Error("Checkpoint response contains an invalid checkpoint record");
            }
            const payload = isRecord(checkpoint.payload) ? checkpoint.payload : {};
            const id = typeof checkpoint.restoreId === "string" ? checkpoint.restoreId : String(checkpoint.id);
            const timestamp = typeof checkpoint.timestamp === "string" ? checkpoint.timestamp : "";
            return {
              id,
              title: checkpoint.title,
              source: typeof payload.source === "string" ? payload.source : typeof payload.concept === "string" ? payload.concept : "System preserved checkpoint in SessionLedger",
              category: typeof checkpoint.category === "string" ? checkpoint.category : "General",
              date: timestamp ? timestamp.slice(0, 10) : "Unknown",
              time: timestamp ? timestamp.slice(11, 16) : "Unknown",
              agent: typeof checkpoint.agent === "string" ? checkpoint.agent : "OneShot",
              restoreId: typeof checkpoint.restoreId === "string" ? checkpoint.restoreId : id,
            };
          });
          setSessions((previous) => previous.map((session) => ({ ...session, earlierContext: mapped })));
        }),
      fetch(resolveApiUrl("/api/system/status"))
        .then((response) => readJsonResponse<{ status?: string; currentStage?: string }>(response, "Status request"))
        .then((data) => {
          if (!data.status || !data.currentStage) {
            throw new Error("System status response is missing status or currentStage");
          }
          setSystemStatusText(`Stage: ${data.currentStage.toUpperCase()}`);
        }),
    ];

    void Promise.allSettled(requests).then((results) => {
      if (results.some((result) => result.status === "rejected")) {
        setStartupError("Some workspace data could not be loaded. Retry the connection or continue with available local state.");
      }
      setIsStarting(false);
    });
  }, []);

  const addDeduplicatedEvent = (stage: string, message: string, type: "info" | "step" | "done" | "error" = "info") => {
    const eventId = `${stage}:${message}`;
    if (seenEventIdsRef.current.has(eventId)) return;
    seenEventIdsRef.current.add(eventId);
    const newEvt: TaskEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      stage,
      message,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      type,
    };
    setTaskEvents((prev) => [newEvt, ...prev]);
  };

  const handleSelectSession = (id: string) => {
    setActiveSessionIdState(id);
    setActiveSessionId(id);
  };

  const handleNewSession = async () => {
    let newId: string;
    try {
      const res = await fetch(resolveApiUrl("/api/session/new"), { method: "POST" });
      const data = await readJsonResponse<{ ok?: boolean; sessionId?: string }>(res, "New session request");
      if (data.ok !== true || !data.sessionId) {
        throw new Error("New session response is missing ok=true or sessionId");
      }
      newId = data.sessionId;
    } catch (error) {
      setStartupError(error instanceof Error ? `Could not create a new session: ${error.message}` : "Could not create a new session.");
      return;
    }

    const newSession: Session = {
      id: newId,
      title: "New chat",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      dateGroup: "Today",
      messages: [],
      earlierContext: [],
    };
    const updated = [newSession, ...sessions];
    setSessions(updated);
    saveStoredSessions(updated);
    handleSelectSession(newSession.id);
    setActivitySteps([]);
    setToolEvents([]);
    addDeduplicatedEvent("Session Ledger", `New chat session started (${newId})`, "info");
  };

  const handleClearHistory = async () => {
    try {
      const res = await fetch(resolveApiUrl("/api/session/clear"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
      const data = await readJsonResponse<{ ok?: boolean; cleared?: boolean }>(res, "Clear history request");
      if (data.ok !== true || data.cleared !== true) {
        throw new Error("Clear history response did not confirm cleared=true");
      }
    } catch (error) {
      setStartupError(error instanceof Error ? `Could not clear chat history: ${error.message}` : "Could not clear chat history.");
      return;
    }
    const updated = sessions.map((s) => (s.id === activeSessionId ? { ...s, messages: [] } : s));
    setSessions(updated);
    saveStoredSessions(updated);
    setActivitySteps([]);
    setToolEvents([]);
    addDeduplicatedEvent("Session Ledger", `Chat history cleared for session (${activeSessionId})`, "info");
  };

  const handleRefreshSystemStatus = async () => {
    try {
      const res = await fetch(resolveApiUrl("/api/system/status"));
      const data = await readJsonResponse<{ status?: string; currentStage?: string; uptimeSeconds?: number }>(res, "Status request");
      if (!data.status || !data.currentStage || typeof data.uptimeSeconds !== "number") {
        throw new Error("System status response is missing required status fields");
      }
      setSystemStatusText(`Stage: ${data.currentStage.toUpperCase()} (${Math.round(data.uptimeSeconds)}s)`);
      addDeduplicatedEvent("System Health", `Backend singletons online. Current stage: ${data.currentStage}`, "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Backend status request failed";
      setStartupError(`Could not refresh system status: ${message}`);
      setSystemStatusText("Offline");
    }
  };

  // Gate 1 confirmation and plan sync were removed from this hook.
  //   * /api/pipeline/plan always returned null, so the plan contract was unreachable.
  //   * Gate 1 confirmation moved to ContextReviewDrawer, beside the live gate
  //     status it changes (ARCHITECTURE.MD §1.4: planning is owned by Design_Planning).


  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
    setRunStatus("CANCELLED");
    addDeduplicatedEvent("User Cancellation", "Execution aborted cooperatively by user", "info");
  };

  const handleSendMessage = async (text: string, providerId: ProviderId) => {
    const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];
    if (!activeSession || isRunning) return;

    const userMsg: Message = {
      id: `msg-u-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    const assistantMsgId = `msg-a-${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isStreaming: true,
    };

    const updated = sessions.map((s) =>
      s.id === activeSession.id
        ? {
            ...s,
            title: s.title === "New chat" ? text.slice(0, 32) : s.title,
            messages: [...s.messages, userMsg, assistantMsg],
          }
        : s
    );
    setSessions(updated);
    saveStoredSessions(updated);

    sessionStorage.removeItem(ACTIVE_RUN_ID_KEY);
    localStorage.removeItem(ACTIVE_RUN_ID_KEY);
    setActiveRunId(null);
    setIsRunning(true);
    setRunStatus("RUNNING");
    setActivityStartTime(Date.now());
    seenEventIdsRef.current.clear();
    setTaskEvents([]);
    setToolEvents([]);
    setActivitySteps([]);

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;
    const activeCfg = { provider: providerId, config: providerConfigs[providerId] };

    await streamAgentExecution(
      text,
      {
        onRunStart: (runId) => {
          setActiveRunId(runId);
          sessionStorage.setItem(ACTIVE_RUN_ID_KEY, runId);
          localStorage.setItem(ACTIVE_RUN_ID_KEY, runId);
        },
        onChunk: (chunk: string) => {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === activeSession.id
                ? { ...s, messages: s.messages.map((m) => (m.id === assistantMsgId ? { ...m, content: m.content + chunk } : m)) }
                : s
            )
          );
        },
        onActivityStep: (step: ActivityStep) => {
          setActivitySteps((prev) => (prev.some((p) => p.id === step.id) ? prev.map((p) => (p.id === step.id ? { ...p, ...step } : p)) : [...prev, step]));
          addDeduplicatedEvent("Pipeline", `${step.label} [${step.status}]`, "step");
        },
        onToolEvent: (event: StrandsStreamEvent) => {
          setToolEvents((prev) => [...prev, event]);
          if (event.type === "tool_use" && event.tool) {
            addDeduplicatedEvent("Tool Use", `Invoked ${event.tool.name} [${event.tool.toolUseId}]`, "step");
            const newToolCall = {
              callId: event.tool.toolUseId,
              name: event.tool.name,
              args: event.tool.input,
              status: "running" as const,
            };
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSession.id
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantMsgId
                          ? {
                              ...m,
                              toolCalls: [
                                ...(m.toolCalls || []).filter((tc) => tc.callId !== newToolCall.callId),
                                newToolCall,
                              ],
                            }
                          : m
                      ),
                    }
                  : s
              )
            );
          } else if (event.type === "tool_running" && event.tool) {
            // Tool acknowledged as running (update status explicitly)
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSession.id
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantMsgId
                          ? {
                              ...m,
                              toolCalls: (m.toolCalls || []).map((tc) =>
                                tc.callId === event.tool?.toolUseId
                                  ? { ...tc, status: "running" as const }
                                  : tc
                              ),
                            }
                          : m
                      ),
                    }
                  : s
              )
            );
          } else if (event.type === "tool_result" && event.result) {
            addDeduplicatedEvent("Tool Result", `Result from ${event.result.toolUseId} (${event.result.status})`, "step");
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSession.id
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantMsgId
                          ? {
                              ...m,
                              toolCalls: (m.toolCalls || []).map((tc) =>
                                tc.callId === event.result?.toolUseId
                                  ? {
                                      ...tc,
                                      status: event.result?.status === "error" ? "error" : "finished",
                                      result: event.result?.content,
                                      error: event.result?.error?.message,
                                    }
                                  : tc
                              ),
                            }
                          : m
                      ),
                    }
                  : s
              )
            );
          } else if (event.type === "tool_error" && event.result) {
            addDeduplicatedEvent("Tool Error", `${event.result.toolUseId} failed: ${event.result.error?.message || "Unknown error"}`, "error");
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSession.id
                  ? {
                      ...s,
                      messages: s.messages.map((m) =>
                        m.id === assistantMsgId
                          ? {
                              ...m,
                              toolCalls: (m.toolCalls || []).map((tc) =>
                                tc.callId === event.result?.toolUseId
                                  ? {
                                      ...tc,
                                      status: "error" as const,
                                      error: event.result?.error?.message || "Tool execution failed",
                                      result: event.result?.content,
                                    }
                                  : tc
                              ),
                            }
                          : m
                      ),
                    }
                  : s
              )
            );
          }
        },
        onDone: (fullContent: string) => {
          const finalContent = fullContent;
          setIsRunning(false);
          setRunStatus("COMPLETED");
          addDeduplicatedEvent("Review", "Backend agent stream completed", "done");
          setSessions((prev) => {
            const final = prev.map((s) =>
              s.id === activeSession.id
                ? {
                    ...s,
                    messages: s.messages.map((m) =>
                      m.id === assistantMsgId
                        ? {
                            ...m,
                            content: finalContent,
                            isStreaming: false,
                          }
                        : m
                    ),
                  }
                : s
            );
            saveStoredSessions(final);
            return final;
          });
        },
        onError: (err: Error) => {
          setIsRunning(false);
          setRunStatus("FAILED");
          addDeduplicatedEvent("Execution Error", err.message, "error");
          setSessions((prev) =>
            prev.map((s) =>
              s.id === activeSession.id
                ? {
                    ...s,
                    messages: s.messages.map((m) =>
                      m.id === assistantMsgId
                        ? {
                            ...m,
                            content: err.message.startsWith("Backend Service Unavailable (503)")
                              ? err.message
                              : `Error during execution: ${err.message}`,
                            isStreaming: false,
                          }
                        : m
                    ),
                  }
                : s
            )
          );
        },
      },
      abortCtrl.signal,
      activeCfg,
      activeSession.id,
    );
  };

  const handleConfigSaved = (providerId: ProviderId, config: ProviderConfig) => {
    saveProviderConfig(providerId, config);
    setProviderConfigs((prev) => ({ ...prev, [providerId]: config }));
  };

  return {
    sessions,
    activeSessionId,
    activeRunId,
    runStatus,
    isRunning,
    activitySteps,
    toolEvents,
    taskEvents,
    activityStartTime,
    providerConfigs,
    systemStatusText,
    startupError,
    isStarting,
    handleSelectSession,
    handleNewSession,
    handleClearHistory,
    handleRefreshSystemStatus,
    handleAbort,
    handleSendMessage,
    handleConfigSaved,
    addDeduplicatedEvent,
  };
}


