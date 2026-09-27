import React from "react";
import type { ReadinessReport } from "../types";

export interface ReadinessCardProps {
  readiness: ReadinessReport;
  className?: string;
}

export const ReadinessCard: React.FC<ReadinessCardProps> = ({ readiness, className = "" }) => {
  const { score, total, passed = [], failed = [], recommendations = [] } = readiness;
  const percentage = total > 0 ? Math.round((Math.min(score, total) / total) * 100) : 0;
  const isHealthy = failed.length === 0 && score === total;

  return (
    <div
      className={`rounded-lg border border-white/10 bg-[#141416] p-3 text-xs space-y-3 ${className}`}
      role="region"
      aria-label="Governed Readiness Report"
    >
      {/* Header & Score Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold uppercase tracking-wider text-[#a0a0a5]">
            Readiness Assessment
          </span>
          <span className="font-mono font-medium text-[#ececec]">
            {score}/{total} ({percentage}%)
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full transition-all duration-300 ease-out ${
              isHealthy ? "bg-[#62c48d]" : percentage >= 50 ? "bg-[#f59e0b]" : "bg-[#e5534b]"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Passed Invariants */}
      {passed.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#62c48d]">
            Passed Checks ({passed.length})
          </span>
          <ul className="space-y-1">
            {passed.map((item, idx) => (
              <li key={`passed-${idx}`} className="flex items-start gap-1.5 text-[11px] text-[#b0b0b8]">
                <span className="text-[#62c48d] font-bold">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Failed Invariants */}
      {failed.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#e5534b]">
            Failed Invariants ({failed.length})
          </span>
          <ul className="space-y-1">
            {failed.map((item, idx) => (
              <li key={`failed-${idx}`} className="flex items-start gap-1.5 text-[11px] text-[#f87171]">
                <span className="text-[#e5534b] font-bold">✗</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="pt-2 border-t border-white/5 space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#f59e0b]">
            Recommendations ({recommendations.length})
          </span>
          <ul className="space-y-1">
            {recommendations.map((rec, idx) => (
              <li key={`rec-${idx}`} className="flex items-start gap-1.5 text-[11px] text-[#dedede]">
                <span className="text-[#f59e0b]">💡</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
