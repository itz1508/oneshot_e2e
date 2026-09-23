import React from "react";

interface ResearchBannerProps {
  systemStatusText: string;
  onRefreshStatus: () => void;
  onOpenResearcher: () => void;
}

export const ResearchBanner: React.FC<ResearchBannerProps> = ({
  systemStatusText,
  onRefreshStatus,
  onOpenResearcher,
}) => (
  <div
    id="researchBanner"
    className="flex items-center justify-between p-3 mb-3 rounded-xl border border-white/10 bg-[#141416]/80 backdrop-blur-sm"
  >
    <div className="flex items-center gap-2.5">
      <span className="text-sm text-[#62c48d]">⚡</span>
      <div>
        <div className="text-xs font-semibold text-[#e0e0e4]">Research Mode Active</div>
        <div className="text-[10px] text-[#8e8e93]">
          In-chat research runs in stream. Standalone user search available in drawer.
        </div>
      </div>
    </div>
    <div className="flex items-center gap-2">
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
    </div>
  </div>
);
