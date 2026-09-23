import React from "react";

interface HeaderBarProps {
  isSidebarCollapsed: boolean;
  onExpandSidebar: () => void;
  isDrawerOpen: boolean;
  onToggleDrawer: () => void;
  activeModelName?: string;
  onNewSession?: () => void;
  onClearHistory?: () => void;
  onOpenIntegration?: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  isSidebarCollapsed,
  onExpandSidebar,
  isDrawerOpen,
  onToggleDrawer,
  activeModelName = "OneShot",
  onNewSession,
  onClearHistory,
  onOpenIntegration,
}) => {
  return (
    <header className="h-[54px] min-h-[54px] px-4 flex items-center justify-between border-b border-white/5 bg-[#0d0d0e]/95 backdrop-blur-md z-20">
      <div className="flex items-center gap-2.5">
        {isSidebarCollapsed && (
          <button
            type="button"
            onClick={onExpandSidebar}
            title="Open sidebar"
            aria-label="Open sidebar"
            className="w-7 h-7 grid place-items-center rounded-lg bg-[#141416] border border-white/10 text-[#8e8e93] hover:text-white hover:bg-white/10 transition-colors text-xs font-mono-code"
          >
            &gt;&gt;
          </button>
        )}

        <div className="flex items-center gap-1.5 cursor-pointer select-none">
          <span className="font-semibold text-sm text-[#ececec]">{activeModelName}</span>
          <span className="text-xs text-[#77777d]">▾</span>
        </div>

        {/* Start Session / New Chat Action */}
        <button
          id="newChatBtn"
          type="button"
          onClick={onNewSession}
          title="Start a new chat session"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium text-[#ececec] transition-colors cursor-pointer ml-1"
        >
          <span className="text-sm leading-none font-bold text-[#62c48d]">＋</span>
          <span className="hidden sm:inline">New Chat</span>
        </button>

        {/* Restart Chat / Clear History Action */}
        <button
          id="restartChatBtn"
          type="button"
          onClick={onClearHistory}
          title="Restart chat and clear history"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium text-[#8e8e93] hover:text-[#e5534b] hover:border-[#e5534b]/30 transition-colors cursor-pointer"
        >
          <span className="text-xs">↺</span>
          <span className="hidden sm:inline">Restart</span>
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <span className="px-2.5 py-1 rounded-full border border-white/10 text-[#9e9ea4] text-[11px] bg-white/[0.02]">
          Research
        </span>
        <span className="text-[#65656a] hidden sm:inline">Context-aware</span>

        <button
          id="toggleIntegrationBtn"
          type="button"
          onClick={onOpenIntegration}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium text-[#c7c7cc] hover:text-white transition-colors"
          title="Open integrations panel"
          aria-label="Open integrations panel"
        >
          <span>⚙</span>
          <span className="hidden sm:inline">Integrations</span>
        </button>

        <button
          id="toggleDrawerBtn"
          type="button"
          onClick={onToggleDrawer}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            isDrawerOpen
              ? "bg-[#62c48d]/15 border-[#62c48d]/40 text-[#62c48d]"
              : "bg-white/5 border-white/10 text-[#c7c7cc] hover:bg-white/10 hover:text-white"
          }`}
        >
          <span>Context Drawer</span>
          <span className="text-[10px] opacity-75">{isDrawerOpen ? "◀" : "▶"}</span>
        </button>
      </div>
    </header>
  );
};
