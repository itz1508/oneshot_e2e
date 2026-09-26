import React from "react";

interface ResearchBannerProps {
  /**
   * Real research workflow state reported by the backend, or null when no research
   * run exists. This component must never claim a mode is active on its own.
   */
  researchRun: {
    runId: string;
    phase: string;
    stopped: boolean;
  } | null;
  /** Per-message choice for the NEXT message. Opening the drawer never starts a run. */
  useResearchForNextMessage: boolean;
  onToggleUseResearch: (next: boolean) => void;
  onOpenResearcher: () => void;
  onOpenDesignPlanning: () => void;
  systemStatusText: string;
  onRefreshStatus: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  RECONCILING: "Reconciling",
  RESEARCHING: "Researching",
  DRAFTING: "Drafting",
  BASELINE_VALIDATING: "Validating baseline",
  REVIEW: "Review",
  READY_FOR_PLANNING: "Ready for planning",
};

export const ResearchBanner: React.FC<ResearchBannerProps> = ({
  researchRun,
  useResearchForNextMessage,
  onToggleUseResearch,
  onOpenResearcher,
  onOpenDesignPlanning,
  systemStatusText,
  onRefreshStatus,
}) => {
  const hasRun = researchRun !== null;
  const phaseLabel = hasRun ? PHASE_LABELS[researchRun.phase] ?? researchRun.phase : null;

  return (
    <div
      id="researchBanner"
      className="flex items-center justify-between gap-3 p-3 mb-3 rounded-xl border border-white/10 bg-[#141416]/80 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-sm text-[#62c48d]">⚡</span>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[#e0e0e4]">
            {hasRun ? (
              <>
                Research run: <span id="researchPhaseLabel">{phaseLabel}</span>
                {researchRun.stopped && (
                  <span className="ml-1.5 font-normal text-[#8e8e93]">(stopped at handoff)</span>
                )}
              </>
            ) : (
              "Research not running"
            )}
          </div>
          <div className="text-[10px] text-[#8e8e93]">
            {hasRun
              ? "Research stops at the planning handoff and never starts planning itself."
              : "Configure research in the drawer, or choose it for a single message."}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <label className="flex items-center gap-1.5 text-[11px] text-[#a0a0a5] cursor-pointer select-none">
          <input
            id="useResearchToggle"
            type="checkbox"
            checked={useResearchForNextMessage}
            onChange={(e) => onToggleUseResearch(e.target.checked)}
            className="accent-[#62c48d] cursor-pointer"
          />
          Use research for this message
        </label>
        <button
          id="refreshResearchBtn"
          type="button"
          onClick={onRefreshStatus}
          title="Check live system status"
          className="px-2 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[11px] text-[#a0a0a5] hover:text-white transition-colors cursor-pointer"
        >
          📡 {systemStatusText}
        </button>
        <button
          id="researcherBtn"
          type="button"
          onClick={onOpenResearcher}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium text-[#ececec] transition-colors cursor-pointer"
        >
          <span>🔍</span> Researcher
        </button>
        <button
          id="designPlanningBtn"
          type="button"
          onClick={onOpenDesignPlanning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium text-[#ececec] transition-colors cursor-pointer"
        >
          <span>🧭</span> Design_Planning
        </button>
      </div>
    </div>
  );
};
