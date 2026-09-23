import React, { useEffect, useState } from "react";
import { EarlierContextItem, ActivityStep } from "../types";
import { CANONICAL_BACKEND_PARTITIONS } from "../lib/api";

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
  activeTab?: "context" | "task" | "backends";
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
  const [tab, setTab] = useState<"context" | "task" | "backends">(activeTab);
  const [isTasksFlipped, setIsTasksFlipped] = useState(false);
  const [stages, setStages] = useState<any[]>([]);
  const [activeSkills, setActiveSkills] = useState<any[]>([]);
  const [serverAuditLogs, setServerAuditLogs] = useState<any[]>([]);

  const fetchAuditLogs = () => {
    fetch("/api/session/audit-logs")
      .then((res) => res.json())
      .then((data) => {
        if (data.logs) setServerAuditLogs(data.logs);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (isOpen) {
      fetch("/api/pipeline/stages")
        .then((res) => res.json())
        .then((data) => {
          if (data.stages) setStages(data.stages);
        })
        .catch(() => {});

      fetch("/api/todos/active")
        .then((res) => res.json())
        .then((data) => {
          if (data.skills) setActiveSkills(data.skills);
        })
        .catch(() => {});

      fetchAuditLogs();
    }
  }, [isOpen]);

  useEffect(() => {
    if (activeTab) setTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div
      id="contextDrawer"
      className={`context-review-drawer ${isOpen ? "open" : ""}`}
      aria-hidden={!isOpen}
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
                  <span className="px-1.5 py-0.5 text-[9px] font-mono-code rounded bg-[#62c48d]/15 text-[#62c48d] border border-[#62c48d]/30">
                    APPROVED
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-black/30 border border-white/5">
                  <div>
                    <span className="font-semibold text-[#dedede]">Gate 2: Build Ready</span>
                    <span className="block text-[9px] text-[#8e8e93]">Bound to confirmed_package.core hash</span>
                  </div>
                  <span className="px-1.5 py-0.5 text-[9px] font-mono-code rounded bg-[#62c48d]/15 text-[#62c48d] border border-[#62c48d]/30">
                    VERIFIED
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
                    {activeSkills.length > 0 ? (
                      activeSkills.map((sk: any, idx: number) => {
                        const isCurrent = sk.state === "active" || (idx === 0 && !activeSkills.some((s: any) => s.state === "active"));
                        return (
                          <div
                            key={sk.id || sk.name}
                            className={`todo-skill p-2.5 rounded-lg border text-xs transition-colors ${
                              isCurrent
                                ? "active bg-[#62c48d]/10 border-[#62c48d]/30 text-[#62c48d]"
                                : "bg-transparent border-transparent text-[#6e6e73]"
                            }`}
                          >
                            <div className="flex items-center justify-between font-medium">
                              <span>{sk.name}</span>
                              <span className="font-mono-code text-[10px]">
                                {isCurrent ? "ACTIVE" : sk.state?.toUpperCase() || "—"}
                              </span>
                            </div>
                            {sk.todos && sk.todos.length > 0 && (
                              <div className="mt-1.5 pl-2 space-y-1 border-l border-white/10 text-[10px]">
                                {sk.todos.map((td: any) => (
                                  <div key={td.id || td.text} className="flex items-center gap-1.5 text-[#a0a0a5]">
                                    <span className="font-mono-code text-[9px] text-[#6e6e73]">
                                      {td.state === "done" ? "✓" : td.state === "active" ? "▶" : "○"}
                                    </span>
                                    <span>{td.text}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      CANONICAL_TASK_GROUPS.map((group, idx) => {
                        const isCurrent = idx === 0;
                        return (
                          <div
                            key={group}
                            className={`todo-skill flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors ${
                              isCurrent
                                ? "active bg-[#62c48d]/10 border-[#62c48d]/30 text-[#62c48d]"
                                : "bg-transparent border-transparent text-[#6e6e73]"
                            }`}
                          >
                            <span className="font-medium">{group}</span>
                            <span className="font-mono-code text-[10px]">
                              {isCurrent ? "ACTIVE" : "—"}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : (
                  /* BACK: Hook Log */
                  <div
                    id="hookLogScroll"
                    className="space-y-1.5 p-3 rounded-lg border border-white/10 bg-[#121316] max-h-60 overflow-y-auto font-mono-code text-[10px]"
                  >
                    <div className="text-[#6e6e73] font-semibold mb-1">Hook Audit &amp; Dispatch Ledger</div>
                    {serverAuditLogs.length > 0 ? (
                      serverAuditLogs.map((log: any) => (
                        <div key={log.id} className="text-[#dedede]">
                          <span className="text-[#62c48d]">[{new Date(log.timestamp).toLocaleTimeString()}]</span> {log.hookName}: {JSON.stringify(log.data || {})}
                        </div>
                      ))
                    ) : taskEvents.length > 0 ? (
                      taskEvents.map((evt) => (
                        <div key={evt.id} className="text-[#dedede]">
                          <span className="text-[#62c48d]">[{evt.timestamp}]</span> {evt.stage}: {evt.message}
                        </div>
                      ))
                    ) : (
                      <>
                        <div className="text-[#62c48d]">[00:01] onPreCall: initialized researcher context</div>
                        <div className="text-[#79a8ea]">[00:02] onToolInvoke: verified partition /workspace/</div>
                        <div className="text-[#dedede]">[00:03] onGateAudit: Gate 1 invariant passed</div>
                        <div className="text-[#a0a0a5]">[00:04] onPostCall: snapshot committed to git storage</div>
                      </>
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
        ) : (
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
        )}
      </div>
    </div>
  );
};
