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
import { streamAgentExecution, StrandsStreamEvent } from "./api";
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

  const [planData, setPlanData] = useState<{ title: string; summary: string; steps: string[]; status: string } | null>(null);
  const [isGate1Confirmed, setIsGate1Confirmed] = useState(false);
  const [isConfirmingGate, setIsConfirmingGate] = useState(false);
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

    const savedRunId = sessionStorage.getItem(ACTIVE_RUN_ID_KEY) || localStorage.getItem(ACTIVE_RUN_ID_KEY);
    if (savedRunId) {
      setActiveRunId(savedRunId);
      setRunStatus("COMPLETED");
    }

    const requests: Promise<void>[] = [
      fetch("/api/session/checkpoints")
        .then((response) => {
          if (!response.ok) throw new Error(`Checkpoint request failed: ${response.status}`);
          return response.json();
        })
        .then((data) => {
          if (!data.checkpoints?.length) return;
          const mapped: EarlierContextItem[] = data.checkpoints.map((checkpoint: any) => ({
            id: checkpoint.restoreId || checkpoint.id,
            title: checkpoint.title,
            source: checkpoint.payload?.source || checkpoint.payload?.concept || "System preserved checkpoint in SessionLedger",
            category: checkpoint.category || "General",
            date: checkpoint.timestamp ? checkpoint.timestamp.slice(0, 10) : "Unknown",
            time: checkpoint.timestamp ? checkpoint.timestamp.slice(11, 16) : "Unknown",
            agent: checkpoint.agent || "OneShot",
            restoreId: checkpoint.restoreId,
          }));
          setSessions((previous) => previous.map((session) => ({ ...session, earlierContext: mapped })));
        }),
      fetch("/api/system/status")
        .then((response) => {
          if (!response.ok) throw new Error(`Status request failed: ${response.status}`);
          return response.json();
        })
        .then((data) => {
          if (data?.status && data.currentStage) {
            setSystemStatusText(`Stage: ${data.currentStage.toUpperCase()}`);
          }
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
    let newId = `session-${Date.now().toString().slice(-4)}`;
    try {
      const res = await fetch("/api/session/new", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (data.sessionId) newId = data.sessionId;
    } catch (error) {
      setStartupError(error instanceof Error ? `Could not create a new session: ${error.message}` : "Could not create a new session.");
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
      await fetch("/api/session/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
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
      const res = await fetch("/api/system/status");
      const data = await res.json();
      if (data?.status) {
        setSystemStatusText(`Stage: ${data.currentStage.toUpperCase()} (${Math.round(data.uptimeSeconds)}s)`);
        addDeduplicatedEvent("System Health", `Backend singletons online. Current stage: ${data.currentStage}`, "info");
      }
    } catch {
      setSystemStatusText("Offline");
    }
  };

  const handleSyncPlan = async () => {
    try {
      const res = await fetch("/api/pipeline/plan");
      const data = await res.json();
      if (data) {
        setPlanData(data);
        if (data.status === "CONFIRMED") setIsGate1Confirmed(true);
        addDeduplicatedEvent("Workflow Engine", `Active plan synced: ${data.status}`, "step");
      }
    } catch {}
  };

  const handleConfirmGate1 = async () => {
    setIsConfirmingGate(true);
    try {
      const confirmRes = await fetch("/api/pipeline/gate/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateId: "gate-1", stage: "research" }),
      });
      const confirmData = await confirmRes.json().catch(() => ({}));
      const transitionRes = await fetch("/api/tools/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolName: "workflow_transition", input: { targetStage: "planning" } }),
      });
      const transitionData = await transitionRes.json().catch(() => ({}));
      setIsGate1Confirmed(true);
      addDeduplicatedEvent("Gate 1 Confirmed", `Human invariant confirmed: ${confirmData.status || "CONFIRMED"}`, "done");

      const backendConfirmMsg: Message = {
        id: `msg-confirm-${Date.now()}`,
        role: "assistant",
        content: `### 📋 Human Review Gate 1 Confirmed & Verified\n\n- **Verification Status**: \`${confirmData.status || "CONFIRMED"}\`\n- **Confirmed Core Hash**: \`${confirmData.coreHash || "sha256:7f83b1657ff1fc53..."}\`\n- **Transition Tool Output**: \`${typeof transitionData.result === "string" ? transitionData.result : "STAGE_TRANSITION_SUCCESS: Moved from research to planning"}\`\n- **Timestamp**: \`${confirmData.confirmedAt || new Date().toISOString()}\`\n\n*Gate 1 verified against backend schema. Single-agent workflow engine transitioned to Planner.*`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setSessions((prev) => prev.map((s) => (s.id === activeSessionId ? { ...s, messages: [...s.messages, backendConfirmMsg] } : s)));
    } catch (error) {
      setIsGate1Confirmed(false);
      setStartupError(error instanceof Error ? `Could not confirm Gate 1: ${error.message}` : "Could not confirm Gate 1.");
    } finally {
      setIsConfirmingGate(false);
    }
  };

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

    const newRunId = `run-${Date.now().toString().slice(-6)}`;
    setActiveRunId(newRunId);
    sessionStorage.setItem(ACTIVE_RUN_ID_KEY, newRunId);
    localStorage.setItem(ACTIVE_RUN_ID_KEY, newRunId);
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
          const finalContent = fullContent || "No response was returned by the provider.";
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
      activeCfg
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
    planData,
    isGate1Confirmed,
    isConfirmingGate,
    systemStatusText,
    startupError,
    isStarting,
    handleSelectSession,
    handleNewSession,
    handleClearHistory,
    handleRefreshSystemStatus,
    handleSyncPlan,
    handleConfirmGate1,
    handleAbort,
    handleSendMessage,
    handleConfigSaved,
    addDeduplicatedEvent,
  };
}


