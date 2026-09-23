import React, { useEffect, useState, useMemo } from "react";
import { ActivityStep } from "../types";
import { StrandsStreamEvent } from "../lib/api";

interface EphemeralActivityProps {
  steps: ActivityStep[];
  toolEvents?: StrandsStreamEvent[];
  startTime?: number;
}

export const EphemeralActivity: React.FC<EphemeralActivityProps> = ({
  steps,
  toolEvents = [],
  startTime = Date.now(),
}) => {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  // Compute which steps have changed for screen reader announcements
  const stepStatusSummary = useMemo(() => {
    const inProgress = steps.find((s) => s.status === "in_progress");
    const completed = steps.filter((s) => s.status === "completed").length;
    if (inProgress) {
      return `Currently running: ${inProgress.label}. ${completed} of ${steps.length} steps completed.`;
    }
    return `${completed} of ${steps.length} steps completed.`;
  }, [steps]);

  return (
    <section
      className="w-full max-w-[780px] mx-auto my-4"
      aria-label="Agent Execution Activity"
      role="region"
      aria-live="polite"
      aria-atomic="false"
    >
      <div className="border border-white/10 rounded-xl bg-[#18181a] overflow-hidden shadow-lg">
        {/* Header */}
        <header className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-white/5 bg-white/[0.01]">
          <span
            className="activity-pulse shrink-0"
            aria-hidden="true"
          />
          <h2 className="font-medium text-xs text-[#ececec]">
            Strands Agent execution &amp; vended tool verification
          </h2>
          <span
            className="ml-auto font-mono-code text-[10px] text-[#65656a]"
            aria-label={`Elapsed time: ${elapsedSec} seconds`}
          >
            {elapsedSec}s
          </span>
        </header>

        {/* Steps checklist */}
        <div className="p-3 space-y-2">
          {/* Announcement for screen readers */}
          <div
            className="sr-only"
            role="status"
            aria-live="assertive"
            aria-atomic="true"
          >
            {stepStatusSummary}
          </div>

          <ul className="space-y-2" role="list">
            {steps.map((step) => {
              const isCompleted = step.status === "completed";
              const isInProgress = step.status === "in_progress";
              const statusIcon = isCompleted
                ? "✓"
                : isInProgress
                ? "●"
                : "·";
              const statusLabel = isCompleted
                ? "completed"
                : isInProgress
                ? "in progress"
                : "pending";

              return (
                <li
                  key={step.id}
                  className="flex items-center gap-2 text-xs transition-opacity duration-200"
                  role="listitem"
                >
                  <span
                    className={`w-4 text-center text-xs font-semibold flex-shrink-0 ${
                      isCompleted
                        ? "text-[#62c48d]"
                        : isInProgress
                        ? "text-[#79a8ea]"
                        : "text-[#555]"
                    }`}
                    aria-hidden="true"
                  >
                    {isInProgress ? (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#79a8ea] animate-pulse" />
                    ) : (
                      statusIcon
                    )}
                  </span>
                  <span
                    className={`${
                      isCompleted
                        ? "text-[#a0a0a5]"
                        : isInProgress
                        ? "text-[#ececec] font-medium"
                        : "text-[#555]"
                    }`}
                    aria-label={`${step.label}: ${statusLabel}`}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Vended Tool Invocations & Results (Strands SDK) */}
          {toolEvents.length > 0 && (
            <section
              className="mt-3 pt-2.5 border-t border-white/5 space-y-2"
              aria-label="Vended Tool Events"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[9px] font-mono-code uppercase tracking-wider text-[#6e6e73]">
                  Strands SDK Vended Tools
                </h3>
                <span
                  className="text-[9px] font-mono-code text-[#555]"
                  aria-label={`${toolEvents.length} event${
                    toolEvents.length > 1 ? "s" : ""
                  }`}
                >
                  {toolEvents.length} event{toolEvents.length > 1 ? "s" : ""}
                </span>
              </div>
              <ul className="space-y-2" role="list">
                {toolEvents.map((evt, idx) => {
                  if (evt.type === "tool_use" && evt.tool) {
                    return (
                      <li
                        key={idx}
                        className="p-2.5 rounded-lg bg-[#141416] border border-white/10 font-mono-code text-[11px]"
                        role="listitem"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className="inline-flex items-center gap-1.5 text-[#79a8ea] text-[10px] font-semibold"
                            role="status"
                            aria-label={`Tool use: ${evt.tool.name}`}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-[#79a8ea]"
                              aria-hidden="true"
                            />
                            vended_tool: {evt.tool.name}
                          </span>
                          <span className="text-[#65656a] text-[10px]">
                            {evt.tool.toolUseId}
                          </span>
                        </div>
                        {evt.tool.input && (
                          <pre className="mt-1.5 p-2 rounded bg-[#0d0d0e] text-[#a0a0a5] text-[10px] overflow-x-auto whitespace-pre-wrap leading-relaxed border border-white/5">
                            {JSON.stringify(evt.tool.input, null, 2)}
                          </pre>
                        )}
                      </li>
                    );
                  }
                  if (evt.type === "tool_result" && evt.result) {
                    const isSuccess = evt.result.status === "success";
                    return (
                      <li
                        key={idx}
                        className={`p-2.5 rounded-lg bg-[#141416] border text-[11px] font-mono-code ${
                          isSuccess
                            ? "border-[#62c48d]/30"
                            : "border-[#e5534b]/30"
                        }`}
                        role="listitem"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${
                              isSuccess
                                ? "text-[#62c48d]"
                                : "text-[#e5534b]"
                            }`}
                            role="status"
                            aria-label={`Tool result: ${evt.result.status}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isSuccess ? "bg-[#62c48d]" : "bg-[#e5534b]"
                              }`}
                              aria-hidden="true"
                            />
                            ToolResultBlock: {evt.result.status}
                          </span>
                          <span className="text-[#65656a] text-[10px]">
                            {evt.result.toolUseId}
                          </span>
                        </div>
                        <div className="mt-1.5 space-y-1.5">
                          {evt.result.content.map((c, ci) => (
                            <div key={ci}>
                              {c.type === "text" && c.text && (
                                <div className="p-1.5 rounded bg-[#0d0d0e] text-[#b0b0b5] text-[10px] border border-white/5">
                                  {c.text}
                                </div>
                              )}
                              {c.type === "json" &&
                                c.json !== undefined && (
                                  <pre className="p-2 rounded bg-[#0d0d0e] text-[#62c48d] text-[10px] overflow-x-auto whitespace-pre-wrap leading-relaxed border border-white/5">
                                    {JSON.stringify(c.json, null, 2)}
                                  </pre>
                                )}
                            </div>
                          ))}
                        </div>
                      </li>
                    );
                  }
                  return null;
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </section>
  );
};
