import React from "react";

interface HeaderBarProps {
  isSidebarCollapsed: boolean;
  onExpandSidebar: () => void;
  onOpenMobileSidebar: () => void;
  isDrawerOpen: boolean;
  onToggleDrawer: () => void;
  activeModelName?: string;
  onNewSession?: () => void;
  onClearHistory?: () => void;
  onOpenIntegration?: () => void;
  onOpenArchitecture?: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  isSidebarCollapsed,
  onExpandSidebar,
  onOpenMobileSidebar,
  isDrawerOpen,
  onToggleDrawer,
  activeModelName = "OneShot",
  onNewSession,
  onClearHistory,
  onOpenIntegration,
  onOpenArchitecture,
}) => {
  return (
    <header className="h-[54px] min-h-[54px] px-4 flex items-center justify-between border-b border-white/5 bg-[#0d0d0e]/95 backdrop-blur-md z-20">
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
        {isSidebarCollapsed && (
          <button
            type="button"
            onClick={onExpandSidebar}
            title="Open sidebar"
            aria-label="Open sidebar"
            className="hidden md:grid w-7 h-7 place-items-center rounded-lg bg-[#141416] border border-white/10 text-[#8e8e93] hover:text-white hover:bg-white/10 transition-colors text-xs font-mono-code"
          >
            &gt;&gt;
          </button>
        )}
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          title="Open navigation"
          aria-label="Open navigation"
          className="md:hidden w-7 h-7 grid place-items-center rounded-lg bg-[#141416] border border-white/10 text-[#8e8e93] hover:text-white hover:bg-white/10 transition-colors text-xs"
        >
          ☰
        </button>

        <button
          type="button"
          onClick={onOpenIntegration}
          aria-label="Open model integrations"
          aria-haspopup="dialog"
          className="flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
        >
          <span className="max-w-14 truncate font-semibold text-sm text-[#ececec] sm:max-w-24">{activeModelName}</span>
          <span aria-hidden="true" className="text-xs text-[#77777d]">▾</span>
        </button>

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

      <div className="flex shrink-0 items-center gap-0.5 text-xs sm:gap-3">
        <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full border border-white/10 text-[#9e9ea4] text-[11px] bg-white/[0.02]">
          Research
        </span>
        <span className="text-[#65656a] hidden sm:inline">Context-aware</span>

        <button
          id="openArchitectureBtn"
          type="button"
          onClick={onOpenArchitecture || (() => onToggleDrawer())}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium text-[#c7c7cc] hover:text-white transition-colors cursor-pointer"
          title="View System Architecture Diagram"
          aria-label="View System Architecture Diagram"
        >
          <span>🏛️</span>
          <span className="hidden sm:inline">Architecture</span>
        </button>

        <button
          id="toggleIntegrationBtn"
          type="button"
          onClick={onOpenIntegration}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium text-[#c7c7cc] hover:text-white transition-colors"
          title="Open integrations panel"
          aria-label="Open integrations panel"
        >
          <span>⚙</span>
          <span className="hidden sm:inline">Integrations</span>
        </button>

        <button
          id="toggleDrawerBtn"
          type="button"
          onClick={() => onToggleDrawer()}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            isDrawerOpen
              ? "bg-[#62c48d]/15 border-[#62c48d]/40 text-[#62c48d]"
              : "bg-white/5 border-white/10 text-[#c7c7cc] hover:bg-white/10 hover:text-white"
          }`}
        >
          <span className="hidden sm:inline">Context Drawer</span>
          <span className="sm:hidden">Context</span>
          <span className="text-[10px] opacity-75">{isDrawerOpen ? "◀" : "▶"}</span>
        </button>
      </div>
    </header>
  );
};
