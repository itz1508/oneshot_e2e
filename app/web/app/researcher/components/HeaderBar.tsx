"use client";

import { Layers, Menu, PanelRightClose, PanelRightOpen, Plus, Settings } from "lucide-react";
import type { ProviderSettings, SessionMeta } from "../types";

export function HeaderBar({
  settings,
  agentName,
  agentTools,
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onClearAll,
  onOpenSettings,
  onOpenIntegrations,
  onToggleSidebar,
  sidebarVisible,
}: {
  settings: ProviderSettings;
  agentName: string;
  agentTools: string;
  sessions: SessionMeta[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onClearAll: () => void;
  onOpenSettings: () => void;
  onOpenIntegrations: () => void;
  onToggleSidebar: () => void;
  sidebarVisible: boolean;
}) {
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={onToggleSidebar} aria-label="Toggle sidebar">
        <Menu size={15} />
      </button>
      <div className="brand">
        <span className="brand-mark">OS</span>
        <span className="brand-title">{agentName}</span>
        <span className="brand-tag">{agentTools}</span>
      </div>
      <div className="top-context">
        <span className="text-muted" style={{ fontSize: 11 }}>
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="topbar-right">
        <button className="icon-btn" onClick={onNewChat} aria-label="New chat" title="New chat">
          <Plus size={15} />
        </button>
        <button className="icon-btn" onClick={onOpenSettings} aria-label="Settings" title="Settings">
          <Settings size={15} />
        </button>
        <button className="icon-btn" onClick={onOpenIntegrations} aria-label="Integrations" title="Integrations">
          <Layers size={15} />
        </button>
        <div className="connection-pill connected">connected</div>
      </div>
    </header>
  );
}