/**
 * TaskRail.tsx — Task Management Rail Orchestrator
 *
 * Implements:
 * - Invariant 7: Task Rail owns execution visibility.
 * - Orchestrates: ActiveTask, ProgressTracker, ValidationPanel.
 * - Consumes: TasksCreated, PlanUpdated, ValidationConfirmed.
 */

import React, { useState } from "react";
import { ActiveTask } from "./ActiveTask";
import { ProgressTracker } from "./ProgressTracker";
import { ValidationPanel } from "./ValidationPanel";
import {
  JobEntity,
  TasksCreatedEvent,
  PlanUpdatedEvent,
  ValidationConfirmedEvent,
  ToolCapabilityExecution,
  ValidationRecord,
} from "../../types/invariants";

export interface TaskRailProps {
  job?: JobEntity | null;
  tasksEvent?: TasksCreatedEvent | null;
  planEvent?: PlanUpdatedEvent | null;
  validationEvent?: ValidationConfirmedEvent | null;
  validations?: ValidationRecord[];
  activeCapabilities?: ToolCapabilityExecution[];
  onConfirmPromotion?: () => void;
  isConfirmingPromotion?: boolean;
  onAbortJob?: (job_id: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const TaskRail: React.FC<TaskRailProps> = ({
  job,
  tasksEvent,
  planEvent,
  validationEvent,
  validations = [],
  activeCapabilities = [],
  onConfirmPromotion,
  isConfirmingPromotion = false,
  onAbortJob,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [activeTab, setActiveTab] = useState<"all" | "active" | "progress" | "validation">("all");

  const defaultJob: JobEntity = job || {
    job_id: "job_init_001",
    jobTitle: "OneShot Canonical Execution",
    session_id: "session_default",
    execution: {
      job_id: "job_init_001",
      currentStep: "Research & Fact Synthesis",
      stage: "research",
      progress: 45,
      activeCapabilities,
      status: "running",
    },
  };

  if (isCollapsed) {
    return (
      <div className="w-12 h-full bg-[#141416] border-l border-[#27272a] flex flex-col items-center py-4 space-y-4">
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
          title="Expand Task Rail"
        >
          ◀
        </button>
        <span
          className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          Task Management Rail
        </span>
      </div>
    );
  }

  return (
    <aside
      className="w-[360px] h-full bg-[#111113] border-l border-[#27272a] flex flex-col overflow-hidden text-zinc-300"
      role="complementary"
      aria-label="Task Management Rail"
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272a] bg-[#141416]">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">
            Execution Visibility Rail
          </span>
        </div>

        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs"
            title="Collapse Task Rail"
          >
            ▶
          </button>
        )}
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center px-4 py-2 border-b border-[#27272a]/80 bg-[#18181b]/60 space-x-1 text-xs">
        {(["all", "active", "progress", "validation"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-2 py-1 rounded text-[11px] font-medium capitalize transition-colors ${
              activeTab === tab
                ? "bg-zinc-800 text-zinc-100 font-semibold"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Scrollable Rail Content: Invariant 7: Task Rail owns execution visibility */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {(activeTab === "all" || activeTab === "active") && (
          <ActiveTask
            job={defaultJob}
            activeCapabilities={activeCapabilities}
            onAbortJob={onAbortJob}
          />
        )}

        {(activeTab === "all" || activeTab === "progress") && (
          <ProgressTracker
            tasksEvent={tasksEvent}
            planEvent={planEvent}
          />
        )}

        {(activeTab === "all" || activeTab === "validation") && (
          <ValidationPanel
            validationEvent={validationEvent}
            validations={validations}
            onConfirmPromotion={onConfirmPromotion}
            isConfirming={isConfirmingPromotion}
          />
        )}
      </div>
    </aside>
  );
};
