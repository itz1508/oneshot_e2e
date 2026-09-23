import React from "react";

interface PlanReviewCardProps {
  planData: { title: string; summary: string; steps: string[]; status: string } | null;
  isGate1Confirmed: boolean;
  isConfirmingGate: boolean;
  onSyncPlan: () => void;
  onConfirmGate1: () => void;
}

export const PlanReviewCard: React.FC<PlanReviewCardProps> = ({
  planData,
  isGate1Confirmed,
  isConfirmingGate,
  onSyncPlan,
  onConfirmGate1,
}) => (
  <div id="planReviewCard" className="p-3.5 my-3 rounded-xl border border-white/10 bg-[#141416] space-y-2">
    <div className="flex items-center justify-between">
      <div>
        <div className="text-xs font-semibold text-[#ececec]">
          {planData?.title || "Architecture & Execution Plan"}
        </div>
        <div className="text-[9px] text-[#8e8e93]">
          Gate 1 Human Review Invariant — Verified against core schema
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          id="syncPlanBtn"
          type="button"
          onClick={onSyncPlan}
          title="Reload active plan state from system"
          className="text-[10px] text-[#8e8e93] hover:text-white px-2 py-0.5 rounded border border-white/10 bg-white/5 transition-colors cursor-pointer"
        >
          🔄 Sync System
        </button>
        <span
          id="gate1Badge"
          className={`px-2 py-0.5 rounded-full text-[9px] font-mono-code font-bold ${
            isGate1Confirmed
              ? "bg-[#2ea043]/15 text-[#2ea043] border border-[#2ea043]/30"
              : "bg-[#79a8ea]/15 text-[#79a8ea] border border-[#79a8ea]/30"
          }`}
        >
          {isGate1Confirmed ? "CONFIRMED" : "PENDING_APPROVAL"}
        </span>
      </div>
    </div>
    <p className="text-[11px] text-[#c0c0c5] leading-relaxed">
      {planData?.summary || "5 atomic execution steps validated. Dependencies resolved within DeepAgents sandbox boundaries."}
    </p>
    <div className="flex items-center gap-2 pt-1">
      <button
        id="confirmPlanBtn"
        type="button"
        onClick={onConfirmGate1}
        disabled={isGate1Confirmed || isConfirmingGate}
        className="px-3 py-1.5 rounded-lg bg-[#3f6ba8] hover:bg-[#4d7fc4] disabled:opacity-50 text-white text-xs font-medium transition-colors cursor-pointer"
      >
        {isConfirmingGate ? "Verifying Core Hash..." : isGate1Confirmed ? "✓ Gate 1 Approved" : "Confirm & Proceed to Planner"}
      </button>
    </div>
  </div>
);
