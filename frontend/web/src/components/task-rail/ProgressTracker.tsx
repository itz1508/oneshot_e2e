/**
 * ProgressTracker.tsx — Task & Plan Progress Tracker
 *
 * Implements:
 * - Consumes: TasksCreated, PlanUpdated
 * - Execution visibility across stages and subtask hierarchy
 */

import React from "react";
import { TasksCreatedEvent, PlanUpdatedEvent, TodoItem } from "../../types/invariants";

export interface ProgressTrackerProps {
  tasksEvent?: TasksCreatedEvent | null;
  planEvent?: PlanUpdatedEvent | null;
  todos?: TodoItem[] | null;
}

export const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  tasksEvent,
  planEvent,
  todos,
}) => {
  // Support both LangChain DeepAgents stream.values.todos and TasksCreatedEvent
  const rawTasks = tasksEvent?.tasks || [];
  const normalizedTodos: Array<{
    task_id: string;
    title: string;
    stage: string;
    status: "pending" | "in_progress" | "completed" | "failed";
  }> = (todos && todos.length > 0)
    ? todos.map((t) => ({
        task_id: t.id,
        title: t.title,
        stage: t.stage || "execution",
        status: t.status,
      }))
    : rawTasks;
  const tasks = normalizedTodos;
  const planSteps = planEvent?.steps || [];

  return (
    <div
      className="p-4 rounded-xl bg-[#18181b] border border-[#27272a] shadow-sm space-y-4"
      role="region"
      aria-label="Progress Tracker"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-100">Progress Tracker</span>
        {planEvent && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
            Plan v{planEvent.version} ({planEvent.coreHash.slice(0, 8)})
          </span>
        )}
      </div>

      {/* Plan Steps (from PlanUpdated) */}
      {planSteps.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] font-medium text-zinc-400 block uppercase tracking-wider">
            Canonical Plan Steps
          </span>
          <div className="space-y-1.5">
            {planSteps.map((step, idx) => (
              <div
                key={`step-${idx}`}
                className="flex items-start space-x-2 text-xs p-2 rounded bg-zinc-900/60 border border-zinc-800/80"
              >
                <span className="w-4 h-4 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center text-[10px] font-mono flex-shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span className="text-zinc-300 leading-snug">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subtasks Ledger (from TasksCreated) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
          <span>Stage Subtasks</span>
          <span className="font-mono text-zinc-500">{tasks.length} subtasks</span>
        </div>

        {tasks.length === 0 ? (
          <p className="text-xs text-zinc-500 italic p-3 text-center bg-zinc-900/40 rounded border border-zinc-800/60">
            No subtasks spawned yet.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {tasks.map((task) => (
              <div
                key={task.task_id}
                className="flex items-center justify-between p-2 rounded bg-zinc-900/80 border border-zinc-800 text-xs"
              >
                <div className="flex items-center space-x-2 truncate">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      task.status === "completed"
                        ? "bg-emerald-400"
                        : task.status === "in_progress"
                        ? "bg-blue-400 animate-pulse"
                        : task.status === "failed"
                        ? "bg-red-400"
                        : "bg-zinc-600"
                    }`}
                  />
                  <span className="text-zinc-200 truncate font-medium">{task.title}</span>
                </div>

                <div className="flex items-center space-x-2 flex-shrink-0">
                  <span className="text-[10px] font-mono text-zinc-500 capitalize">
                    {task.stage}
                  </span>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold ${
                      task.status === "completed"
                        ? "bg-emerald-950 text-emerald-300"
                        : task.status === "in_progress"
                        ? "bg-blue-950 text-blue-300"
                        : task.status === "failed"
                        ? "bg-red-950 text-red-300"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {task.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
