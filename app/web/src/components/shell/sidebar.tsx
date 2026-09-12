"use client";

import type { ConversationListItem, IntegrationItem } from "../../lib/contracts";
import styles from "./shell.module.css";

export interface SidebarProps {
  sessions: ConversationListItem[];
  integrations: IntegrationItem[];
  currentId?: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onOpenIntegrations: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const that = new Date(d);
  that.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diffDays <= 0)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function groupLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Previous";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const that = new Date(d);
  that.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return "Previous";
}

function dotClass(id: string): string {
  const key = id.toLowerCase();
  if (key.includes("gemini")) return styles.dotGemini;
  if (key.includes("openai")) return styles.dotOpenai;
  if (key.includes("nebius")) return styles.dotNebius;
  return styles.dotGeneric;
}

export function Sidebar({
  sessions,
  integrations,
  currentId,
  onNewChat,
  onSelectSession,
  onOpenIntegrations,
}: SidebarProps) {
  const groups: { label: string; items: ConversationListItem[] }[] = [];
  for (const session of sessions) {
    const label = groupLabel(session.updated_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(session);
    } else {
      groups.push({ label, items: [session] });
    }
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHead}>
        <button className={styles.iconBtn} type="button" aria-label="Menu">
          ☰
        </button>
        <div className={styles.brand}>OneShot</div>
      </div>

      <button className={styles.navAction} type="button" onClick={onNewChat}>
        <span className={styles.navSymbol}>＋</span>
        <span>New chat</span>
      </button>

      <div className={styles.sectionTitle}>Integrations</div>
      <div className={styles.integrations}>
        {integrations.map((item) => (
          <div className={styles.integrationRow} key={item.id}>
            <span
              className={`${styles.providerDot} ${dotClass(item.id)}`}
            ></span>
            <span className={styles.integrationName}>{item.displayName}</span>
            <button
              className={styles.integrationAdd}
              type="button"
              aria-label={`Configure ${item.displayName}`}
              title={item.enabled ? "Enabled" : undefined}
              onClick={onOpenIntegrations}
            >
              {item.installed ? "⚙" : "＋"}
            </button>
          </div>
        ))}
      </div>

      <div className={styles.sectionTitle}>
        Sessions <span className={styles.sectionMeta}>{sessions.length}</span>
      </div>
      <div className={styles.history}>
        {groups.map((group) => (
          <div className={styles.historyGroup} key={group.label}>
            <div className={styles.historyLabel}>{group.label}</div>
            {group.items.map((s) => (
              <button
                key={s.conversation_id}
                type="button"
                className={
                  s.conversation_id === currentId
                    ? `${styles.historyItem} ${styles.historyItemActive}`
                    : styles.historyItem
                }
                onClick={() => onSelectSession(s.conversation_id)}
                title={s.title}
              >
                <span className={styles.historyName}>{s.title}</span>
                <span className={styles.historyTime}>
                  {formatTime(s.updated_at)}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className={styles.memoryStatus}>
        <span className={styles.memoryDot}></span>
        <div>
          <strong>Memory index</strong>
          <small>Always on · selective retrieval</small>
        </div>
      </div>

      <div className={styles.account}>
        <div className={styles.avatar}>U</div>
        <span>User</span>
      </div>
    </aside>
  );
}
