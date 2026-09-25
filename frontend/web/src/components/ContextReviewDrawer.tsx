import React, { useEffect, useState } from "react";
import { useOverlayFocus } from "../lib/useOverlayFocus";
import { EarlierContextItem, ActivityStep } from "../types";
import { CANONICAL_BACKEND_PARTITIONS, isRecord, readJsonResponse } from "../lib/api";

export interface TaskEvent {
  id: string;
  stage: string;
  message: string;
  timestamp: string;
  type?: "info" | "step" | "done" | "error";
}

interface ContextReviewDrawerProps {
  item: EarlierContextItem | null;
  isOpen: boolean;
  onClose: () => void;
  activeTab?: "context" | "task" | "backends" | "architecture";
  runId?: string | null;
  runStatus?: "IDLE" | "RUNNING" | "COMPLETED" | "CANCELLED" | "FAILED";
  activitySteps?: ActivityStep[];
  taskEvents?: TaskEvent[];
}

export const CANONICAL_TASK_GROUPS = [
  "Researcher",
  "Planner",
  "Refactor",
  "Gap Analysis",
  "Evaluation",
  "Builder",
  "Review",
];

export const ContextReviewDrawer: React.FC<ContextReviewDrawerProps> = ({
  item,
  isOpen,
  onClose,
  activeTab = "context",
  runId = null,
  runStatus = "IDLE",
  activitySteps = [],
  taskEvents = [],
}) => {
  const [tab, setTab] = useState<"context" | "task" | "backends" | "architecture">(activeTab);
  const [isTasksFlipped, setIsTasksFlipped] = useState(false);
  const [gate1, setGate1] = useState<{ status: string; confirmedAt?: string } | null>(null);
  const [gate2, setGate2] = useState<{ status: string; confirmedAt?: string; packageHash?: string } | null>(null);
  const [serverAuditLogs, setServerAuditLogs] = useState<unknown[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const drawerRef = useOverlayFocus<HTMLDivElement>(isOpen, onClose);

  const fetchAuditLogs = async () => {
    const response = await fetch("/api/session/audit-logs");
    const data = await readJsonResponse<{ logs?: unknown[] }>(response, "Audit log request");
    if (!Array.isArray(data.logs)) {
      throw new Error("Audit log response is missing logs array");
    }
    setServerAuditLogs(data.logs);
  };

  useEffect(() => {
    if (isOpen) {
      const loadDrawerState = async () => {
        setLoadError(null);
        try {
          const response = await fetch("/api/system/status");
          const statusData = await readJsonResponse<{ status?: string; currentStage?: string; gate1?: unknown; gate2?: unknown }>(response, "System status request");
          const gate1 = statusData.gate1;
          const gate2 = statusData.gate2;
          if (!isRecord(gate1) || typeof gate1.status !== "string" || !isRecord(gate2) || typeof gate2.status !== "string") {
            throw new Error("System status response has invalid gate payloads");
          }
          setGate1({ status: gate1.status, confirmedAt: typeof gate1.confirmedAt === "string" ? gate1.confirmedAt : undefined });
          setGate2({ status: gate2.status, confirmedAt: typeof gate2.confirmedAt === "string" ? gate2.confirmedAt : undefined, packageHash: typeof gate2.packageHash === "string" ? gate2.packageHash : undefined });
          await fetchAuditLogs();
        } catch (error) {
          setGate1(null);
          setGate2(null);
          setServerAuditLogs([]);
          setLoadError(error instanceof Error ? error.message : "Context data is currently unavailable.");
        }
      };
      void loadDrawerState();
    }
  }, [isOpen]);

  useEffect(() => {
    if (activeTab) setTab(activeTab);
  }, [activeTab]);

  return (
    <div
      ref={drawerRef}
      id="contextDrawer"
      className={`context-review-drawer ${isOpen ? "open" : ""}`}
      aria-hidden={!isOpen}
      aria-label="Context review drawer"
      role="dialog"
      aria-modal="true"
      inert={!isOpen}
      data-testid="context-review-drawer"
    >
      {/* Header with Tab Switcher */}
      <div className="min-h-[52px] px-4 flex items-center justify-between border-b border-white/[0.075] bg-[#141416]">
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          <button
            id="tabContextBtn"
            type="button"
            onClick={() => setTab("context")}
            className={`px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              tab === "context"
                ? "bg-white/10 text-white"
                : "text-[#8e8e93] hover:text-white"
            }`}
          >
            Context
          </button>
          <button
            id="tabTaskBtn"
            type="button"
            onClick={() => setTab("task")}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              tab === "task"
                ? "bg-white/10 text-white"
                : "text-[#8e8e93] hover:text-white"
            }`}
          >
            <span>Tasks</span>
            {runStatus === "RUNNING" && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#62c48d] animate-pulse" />
            )}
          </button>
          <button
            id="tabBackendsBtn"
            type="button"
            onClick={() => setTab("backends")}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              tab === "backends"
                ? "bg-white/10 text-white"
                : "text-[#8e8e93] hover:text-white"
            }`}
          >
            <span>Backends</span>
            <span className="text-[10px] text-[#6e6e73]">4</span>
          </button>
          <button
            id="tabArchitectureBtn"
            type="button"
            onClick={() => setTab("architecture")}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              tab === "architecture"
                ? "bg-white/10 text-white"
                : "text-[#8e8e93] hover:text-white"
            }`}
          >
            <span>🏛️ Architecture</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="w-7 h-7 shrink-0 rounded-lg bg-transparent hover:bg-white/10 text-[#8e8e93] hover:text-white grid place-items-center text-sm transition-colors"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loadError && (
          <div role="alert" className="rounded-lg border border-[#e5a84b]/30 bg-[#e5a84b]/10 p-3 text-[11px] text-[#e5a84b]">
            {loadError}
          </div>
        )}
        {tab === "context" ? (
          /* CONTEXT REVIEW TAB */
          <div className="space-y-4">
            <div>
              <strong className="block text-xs font-semibold text-[#dedede]">
                {item?.title || "Stored context"}
              </strong>
              <small className="block text-[8px] text-[#6e6e73]">
                Original conversation source
              </small>
            </div>

            {/* Source Card */}
            <div className="p-3 rounded-lg border border-white/10 bg-[#141414]">
              <span className="block text-[8px] font-bold uppercase tracking-wider text-[#8a8a8a] mb-1.5">
                Original Content
              </span>
              <p className="m-0 text-[11px] text-[#b0b0b5] leading-relaxed">
                {item?.source || "Stored source content appears here."}
              </p>
            </div>

            {/* Category / Session meta */}
            <div className="text-[10px] text-[#65656a]">
              {item ? `${item.category} · ${item.id}` : "Stored in this session"}
            </div>

            {/* 4-Cell Metadata Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg border border-white/5 bg-[#151517]">
                <span className="block text-[8px] uppercase tracking-wider text-[#6e6e73]">
                  Date
                </span>
                <strong className="block mt-1 text-[11px] font-medium text-[#bdbdbd] font-mono-code">
                  {item?.date || "—"}
                </strong>
              </div>
              <div className="p-2.5 rounded-lg border border-white/5 bg-[#151517]">
                <span className="block text-[8px] uppercase tracking-wider text-[#6e6e73]">
                  Time
                </span>
                <strong className="block mt-1 text-[11px] font-medium text-[#bdbdbd] font-mono-code">
                  {item?.time || "—"}
                </strong>
              </div>
              <div className="p-2.5 rounded-lg border border-white/5 bg-[#151517]">
                <span className="block text-[8px] uppercase tracking-wider text-[#6e6e73]">
                  Agent
                </span>
                <strong className="block mt-1 text-[11px] font-medium text-[#bdbdbd]">
                  {item?.agent || "Unknown"}
                </strong>
              </div>
              <div className="p-2.5 rounded-lg border border-white/5 bg-[#151517]">
                <span className="block text-[8px] uppercase tracking-wider text-[#6e6e73]">
                  Restore ID
                </span>
                <strong className="block mt-1 text-[11px] font-medium text-[#bdbdbd] font-mono-code truncate">
                  {item?.restoreId || "—"}
                </strong>
              </div>
            </div>
          </div>
        ) : tab === "task" ? (
          /* TASK MANAGEMENT TAB */
          <div className="space-y-4">
            {/* Run Snapshot Status */}
            <div className="p-3 rounded-lg border border-white/10 bg-[#141414] flex items-center justify-between">
              <div>
                <span className="block text-[8px] font-bold uppercase tracking-wider text-[#6e6e73]">
                  Current Run
                </span>
                <span className="font-mono-code text-xs text-[#ececec] font-semibold">
                  {runId || "run-idle"}
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono-code font-bold ${
                  runStatus === "RUNNING"
                    ? "bg-[#62c48d]/20 text-[#62c48d] border border-[#62c48d]/40 animate-pulse"
                    : runStatus === "COMPLETED"
                    ? "bg-[#62c48d]/20 text-[#62c48d]"
                    : runStatus === "CANCELLED"
                    ? "bg-[#e5a84b]/20 text-[#e5a84b]"
                    : runStatus === "FAILED"
                    ? "bg-[#e5534b]/20 text-[#e5534b]"
                    : "bg-white/5 text-[#888]"
                }`}
              >
                {runStatus}
              </span>
            </div>

            {/* Canonical Human Gates Status */}
            <div className="p-3 rounded-lg border border-white/10 bg-[#151517] space-y-2">
              <span className="block text-[8px] font-bold uppercase tracking-wider text-[#8e8e93]">
                Human Invariants &amp; Gates
              </span>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-black/30 border border-white/5">
                  <div>
                    <span className="font-semibold text-[#dedede]">Gate 1: Research Review</span>
                    <span className="block text-[9px] text-[#8e8e93]">Mandatory before Planner</span>
                  </div>
                  <span className={`px-1.5 py-0.5 text-[9px] font-mono-code rounded ${gate1?.status === "CONFIRMED" ? "bg-[#62c48d]/15 text-[#62c48d] border border-[#62c48d]/30" : "bg-[#e5a84b]/10 text-[#e5a84b] border border-[#e5a84b]/30"}`}>
                    {gate1?.status || "UNAVAILABLE"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-black/30 border border-white/5">
                  <div>
                    <span className="font-semibold text-[#dedede]">Gate 2: Build Ready</span>
                    <span className="block text-[9px] text-[#8e8e93]">{gate2?.packageHash || "No package hash recorded"}</span>
                  </div>
                  <span className={`px-1.5 py-0.5 text-[9px] font-mono-code rounded ${gate2?.status === "CONFIRMED" && gate2.packageHash ? "bg-[#62c48d]/15 text-[#62c48d] border border-[#62c48d]/30" : "bg-[#e5a84b]/10 text-[#e5a84b] border border-[#e5a84b]/30"}`}>
                    {gate2?.status || "UNAVAILABLE"}
                  </span>
                </div>
              </div>
            </div>

            {/* Stage Todos Flip Card (Flip between Stage Todos ⇆ Hook Audit Log) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6e6e73]">
                  {isTasksFlipped ? "Hook Audit Log" : "Pipeline Stages"}
                </span>
                <button
                  id="tasksFlipBtn"
                  type="button"
                  onClick={() => {
                    const next = !isTasksFlipped;
                    setIsTasksFlipped(next);
                    if (next) fetchAuditLogs();
                  }}
                  className="px-2 py-1 rounded text-[10px] font-medium bg-white/5 hover:bg-white/10 text-[#d0d0d5] border border-white/10 transition-colors"
                >
                  {isTasksFlipped ? "Show Stage Todos" : "Show Hook Log"}
                </button>
              </div>

              <div id="tasksFlipCard" className={`tasks-flip-card ${isTasksFlipped ? "flipped" : ""}`}>
                {!isTasksFlipped ? (
                  /* FRONT: Active-Only Todo Chain */
                  <div className="space-y-1.5">
                    {activitySteps.length > 0 ? (
                      activitySteps.map((step) => {
                        const statusLabel = step.status.replace("_", " ").toUpperCase();
                        const isCurrent = step.status === "in_progress";
                        return (
                          <div
                            key={step.id}
                            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${isCurrent ? "border-[#62c48d]/30 bg-[#62c48d]/10 text-[#62c48d]" : step.status === "completed" ? "border-white/10 bg-[#151517] text-[#dedede]" : "border-white/5 bg-transparent text-[#8e8e93]"}`}
                          >
                            <span className="font-medium">{step.label}</span>
                            <span className="font-mono-code text-[10px]">{statusLabel}</span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-lg border border-white/10 bg-[#151517] px-3 py-3 text-xs text-[#8e8e93]">
                        No activity steps have been emitted for this run.
                      </div>
                    )}
                  </div>
                ) : (
                  /* BACK: Hook Log */
                  <div
                    id="hookLogScroll"
                    className="space-y-1.5 p-3 rounded-lg border border-white/10 bg-[#121316] max-h-60 overflow-y-auto font-mono-code text-[10px]"
                  >
                    <div className="text-[#6e6e73] font-semibold mb-1">Hook Audit &amp; Dispatch Ledger</div>
                    {taskEvents.length > 0 ? (
                      taskEvents.map((evt) => (
                        <div key={evt.id} className="text-[#dedede]">
                          <span className="text-[#62c48d]">[{evt.timestamp}]</span> {evt.stage}: {evt.message}
                        </div>
                      ))
                    ) : serverAuditLogs.length > 0 ? (
                      serverAuditLogs.map((log: any) => (
                        <div key={log.id} className="text-[#dedede]">
                          <span className="text-[#62c48d]">[{new Date(log.timestamp).toLocaleTimeString()}]</span> {log.hookName}: {JSON.stringify(log.data || {})}
                        </div>
                      ))
                    ) : (
                      <div className="text-[#8e8e93]">No backend audit events have been recorded for this run.</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Deduplicated Event History */}
            {taskEvents.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6e6e73] mb-2">
                  Deduplicated Event Log ({taskEvents.length})
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {taskEvents.map((evt) => (
                    <div
                      key={evt.id}
                      className="p-2 rounded border border-white/5 bg-[#151517] text-[10px] font-mono-code text-[#a0a0a5]"
                    >
                      <div className="flex items-center justify-between text-[#6e6e73] mb-0.5">
                        <span>{evt.stage}</span>
                        <span>{evt.timestamp}</span>
                      </div>
                      <div className="text-[#ececec]">{evt.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : tab === "backends" ? (
          /* BACKENDS & PARTITIONS TAB */
          <div className="space-y-4">
            <div>
              <strong className="block text-xs font-semibold text-[#dedede]">
                DeepAgents Filesystem Backends
              </strong>
              <small className="block text-[8px] text-[#6e6e73]">
                Pluggable prefix routing &amp; sandbox isolation
              </small>
            </div>

            <div className="p-3 rounded-lg border border-white/10 bg-[#141414] space-y-2">
              <span className="block text-[8px] font-bold uppercase tracking-wider text-[#62c48d]">
                Sandbox Security Policy
              </span>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="p-2 rounded bg-black/40 border border-white/5">
                  <span className="text-[#8e8e93] block text-[8px]">Virtual Mode</span>
                  <span className="text-[#62c48d] font-semibold font-mono-code">ENFORCED</span>
                </div>
                <div className="p-2 rounded bg-black/40 border border-white/5">
                  <span className="text-[#8e8e93] block text-[8px]">Path Traversal (..)</span>
                  <span className="text-[#62c48d] font-semibold font-mono-code">BLOCKED</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#6e6e73]">
                Mounted Partitions ({CANONICAL_BACKEND_PARTITIONS.length})
              </span>
              {CANONICAL_BACKEND_PARTITIONS.map((partition) => (
                <div
                  key={partition.prefix}
                  className="p-2.5 rounded-lg border border-white/5 bg-[#151517] space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono-code text-xs text-[#79a8ea] font-semibold">
                      {partition.prefix}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-code bg-white/5 text-[#a0a0a5]">
                      {partition.type}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-[#dedede]">{partition.name}</div>
                  <div className="text-[10px] text-[#8e8e93] leading-relaxed">
                    {partition.description}
                  </div>
                  <div className="flex items-center gap-2 pt-1 text-[9px] font-mono-code text-[#6e6e73]">
                    <span>{partition.durable ? "● Durable" : "○ Ephemeral"}</span>
                    <span>·</span>
                    <span>virtual_mode=true</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : tab === "architecture" ? (
          /* ARCHITECTURE TAB */
          <div className="space-y-4">
            <div>
              <strong className="block text-xs font-semibold text-[#dedede]">
                OneShot Fleet Architecture
              </strong>
              <small className="block text-[9px] text-[#6e6e73]">
                Google ADK Workflow · DeepAgents SSE · Gemini 3.5 Flash · Cloud Run
              </small>
            </div>

            <div className="rounded-xl border border-white/10 overflow-hidden bg-[#0d0d11] p-1.5 shadow-xl">
              <img
                src="/demo/architecture-diagram.svg"
                alt="OneShot Enterprise Architecture"
                className="w-full h-auto rounded-lg"
              />
            </div>

            <div className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/5 space-y-1">
              <span className="text-xs font-semibold text-blue-300">Layer 1: Canonical Web UI</span>
              <p className="text-[11px] text-[#b0b0b8] leading-relaxed">
                Next.js 16 App Router with DeepAgents SSE reactive projections (<code>stream.messages</code>, <code>stream.subagents</code>, <code>stream.tool_calls</code>, <code>stream.values.todos</code>) and Action API v2 client.
              </p>
            </div>

            <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 space-y-1">
              <span className="text-xs font-semibold text-emerald-300">Layer 2: ADK Runtime &amp; Reasoner</span>
              <p className="text-[11px] text-[#b0b0b8] leading-relaxed">
                Google ADK transition state machine, Gate 1 &amp; Gate 2 human review, offline Python Reasoner with SHA-256 fixture proof, and SessionLedger memory bank.
              </p>
            </div>

            <div className="p-3 rounded-lg border border-purple-500/20 bg-purple-500/5 space-y-1">
              <span className="text-xs font-semibold text-purple-300">Layer 3: Google Cloud &amp; Models</span>
              <p className="text-[11px] text-[#b0b0b8] leading-relaxed">
                Gemini 3.5 Flash streaming with resilient gateway failover, Google Cloud Run serverless containerization, and OpenTelemetry telemetry.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
