import React, { useState } from "react";
import { Session, ProviderId, ProviderConfig } from "../types";
import { PROVIDER_DEFINITIONS } from "../lib/providers";

interface SidebarProps {
  sessions: Session[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onClearHistory?: () => void;
  onOpenProviderModal: (providerId: ProviderId) => void;
  providerConfigs: Record<ProviderId, ProviderConfig>;
  onCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onClearHistory,
  onOpenProviderModal,
  providerConfigs,
  onCollapse,
}) => {
  const groups: ("Today" | "Yesterday" | "Previous")[] = ["Today", "Yesterday", "Previous"];
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleSessions = normalizedSearch
    ? sessions.filter((session) => session.title.toLowerCase().includes(normalizedSearch))
    : sessions;

  return (
    <aside className="sidebar-shell">
      {/* Collapse button */}
      <button
        type="button"
        onClick={onCollapse}
        title="Collapse sidebar"
        aria-label="Collapse sidebar"
        className="absolute top-3 right-2.5 z-10 w-7 h-7 grid place-items-center rounded-lg bg-transparent text-[#77777d] hover:bg-white/5 hover:text-white transition-colors text-xs"
      >
        &lt;&lt;
      </button>

      {/* Top Brand */}
      <div className="flex items-center gap-2.5 h-11 px-3 mt-1">
        <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 grid place-items-center text-xs font-semibold">
          ⚡
        </div>
        <span className="font-semibold text-sm text-[#ececec]">OneShot</span>
      </div>

      {/* Actions: New Chat & Clear History & Search */}
      <div className="px-2 mt-2 space-y-1">
        <button
          id="sidebarNewChatBtn"
          type="button"
          onClick={onNewSession}
          className="w-full h-9 flex items-center gap-2.5 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-[#ececec] font-medium transition-colors cursor-pointer"
        >
          <span className="text-base leading-none text-[#62c48d]">＋</span>
          <span>New chat</span>
        </button>
        {onClearHistory && (
          <button
            id="sidebarClearHistoryBtn"
            type="button"
            onClick={onClearHistory}
            className="w-full h-7 flex items-center gap-2 px-2.5 rounded-lg text-xs text-[#8e8e93] hover:text-[#e5534b] hover:bg-[#e5534b]/10 transition-colors cursor-pointer"
          >
            <span className="text-xs">↺</span>
            <span>Restart &amp; Clear Chat</span>
          </button>
        )}
        <div className="px-2 mt-2 space-y-1">
          <label htmlFor="sidebarSearchInput" className="sr-only">Search chats</label>
          <div className="w-full h-8 flex items-center gap-2.5 px-2.5 rounded-lg text-sm text-[#8e8e93] bg-white/[0.03] border border-white/5 focus-within:border-white/20">
            <span aria-hidden="true" className="text-sm">⌕</span>
            <input
              id="sidebarSearchInput"
              name="search-chats"
              autoComplete="off"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search chats"
              className="min-w-0 flex-1 bg-transparent text-xs text-[#d0d0d5] outline-none placeholder:text-[#65656a]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear chat search"
                className="text-[#77777d] hover:text-white"
              >
                ×
              </button>
            )}
          </div>
      </div>
       </div>

      {/* Integrations Section */}
      <div className="px-2 mt-3 pt-2 border-t border-white/5">
        <div className="px-2.5 py-1 text-[11px] font-medium text-[#8e8e93]">Integrations</div>
        <div className="space-y-1 mt-0.5">
          {(["gemini", "openai", "nebius"] as ProviderId[]).map((pid) => {
            const def = PROVIDER_DEFINITIONS[pid];
            const cfg = providerConfigs[pid];
            const isConfigured = cfg?.configured && !!cfg?.key;

            return (
              <div
                key={pid}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: def.dotGradient }}
                  />
                  <div className="truncate">
                    <div className="font-medium text-[#dedede] truncate">{def.name}</div>
                    <div className="text-[10px] text-[#6e6e73]">
                      {isConfigured ? "Configured" : "Not configured"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenProviderModal(pid)}
                  title={`Configure ${def.name}`}
                  className={`provider-open-btn w-6 h-6 rounded-md grid place-items-center text-xs font-semibold transition-colors ${
                    isConfigured
                      ? "bg-[#62c48d]/20 text-[#62c48d] border border-[#62c48d]/40"
                      : "bg-white/5 text-[#9e9ea4] hover:bg-white/10 hover:text-white border border-white/10"
                  }`}
                >
                  {isConfigured ? "✓" : "＋"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sessions History List */}
      <div className="flex-1 overflow-y-auto px-2 mt-3 pt-2 border-t border-white/5 space-y-3">
        {normalizedSearch && visibleSessions.length === 0 ? (
          <div className="px-2 py-3 text-xs text-[#8e8e93]">No chats match “{searchQuery}”.</div>
        ) : null}
        {groups.map((group) => {
          const groupSessions = visibleSessions.filter((s) => s.dateGroup === group);
          if (groupSessions.length === 0) return null;

          return (
            <div key={group}>
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#65656a]">
                {group}
              </div>
              <div className="space-y-0.5 mt-0.5">
                {groupSessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => onSelectSession(session.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
                        isActive
                          ? "bg-white/10 text-white font-medium"
                          : "text-[#b0b0b5] hover:bg-white/5 hover:text-[#ececec]"
                      }`}
                    >
                      <span className="truncate pr-2" title={session.title}>{session.title}</span>
                      <span className="text-[10px] text-[#65656a] shrink-0 font-mono-code">
                        {session.timestamp}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Memory Index Status */}
      <div className="px-3 py-2 border-t border-white/5 flex items-center gap-2 text-xs text-[#8e8e93]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#6f9b76] shrink-0" />
        <div>
          <strong className="block text-[10px] font-semibold text-[#c7c7cc]">Memory index</strong>
          <small className="block text-[9px] text-[#65656a]">Always on · selective retrieval</small>
        </div>
      </div>

      {/* User Account Footer */}
      <div className="p-2 border-t border-white/5 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-[#303034] text-white font-bold grid place-items-center text-xs">
          U
        </div>
        <div className="text-xs font-medium text-[#d0d0d5]">User</div>
      </div>
    </aside>
  );
};
