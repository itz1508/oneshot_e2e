/**
 * ActiveTask.tsx — Execution Visibility for the Current Job
 *
 * Implements:
 * - Invariant 2: Job owns execution.
 * - Invariant 17: Job Title != job_id.
 */

import React from "react";
import { JobEntity, ToolCapabilityExecution } from "../../types/invariants";

export interface ActiveTaskProps {
  job: JobEntity;
  activeCapabilities?: ToolCapabilityExecution[];
  onAbortJob?: (job_id: string) => void;
}

export const ActiveTask: React.FC<ActiveTaskProps> = ({
  job,
  activeCapabilities = [],
  onAbortJob,
}) => {
  const { job_id, jobTitle, execution } = job;
  const isRunning = execution.status === "running";

  return (
    <div
      className="p-4 rounded-xl bg-[#18181b] border border-[#27272a] shadow-sm space-y-3"
      role="region"
      aria-label={`Active Job: ${jobTitle}`}
      data-job-id={job_id}
    >
      {/* Header: Invariant 17: Job Title != job_id */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            Active Job Execution
          </span>
          <h4 className="text-sm font-semibold text-zinc-100 mt-0.5">{jobTitle}</h4>
          <span className="text-[11px] font-mono text-zinc-400 block mt-0.5">
            job_id: <span className="text-zinc-300">{job_id}</span>
          </span>
        </div>

        <span
          className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
            execution.status === "running"
              ? "bg-blue-950 text-blue-400 border border-blue-800/40 animate-pulse"
              : execution.status === "completed"
              ? "bg-emerald-950 text-emerald-400 border border-emerald-800/40"
              : execution.status === "failed"
              ? "bg-red-950 text-red-400 border border-red-800/40"
              : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {execution.status}
        </span>
      </div>

      {/* Progress & Current Step: Invariant 2: Job owns execution */}
      <div className="space-y-1.5 pt-1 border-t border-zinc-800/80">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>Current Step: <strong className="text-zinc-200">{execution.currentStep}</strong></span>
          <span className="font-mono">{execution.progress}%</span>
        </div>

        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, execution.progress))}%` }}
          />
        </div>
      </div>

      {/* Active Capabilities Executing via useTool (Invariant 4 & 23) */}
      {activeCapabilities.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-zinc-800/60">
          <span className="text-[11px] font-medium text-zinc-400 block">
            Capabilities in Flight (useTool):
          </span>
          {activeCapabilities.map((cap) => (
            <div
              key={cap.callId}
              className="flex items-center justify-between p-2 rounded bg-zinc-900 border border-zinc-800 text-xs"
            >
              <div className="flex items-center space-x-2 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                <span className="font-mono text-zinc-200 truncate">{cap.toolName}</span>
              </div>
              <span className="font-mono text-[10px] text-zinc-500">
                {Math.round((Date.now() - cap.startTime) / 100) / 10}s
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Action footer */}
      {isRunning && onAbortJob && (
        <div className="pt-2 flex justify-end">
          <button
            onClick={() => onAbortJob(job_id)}
            className="px-2.5 py-1 rounded bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/40 text-[11px] font-medium transition-colors"
          >
            Cancel Execution
          </button>
        </div>
      )}
    </div>
  );
};
