"use client";

import type { IntegrationItem } from "../../lib/contracts";
import styles from "./integration.module.css";

export interface IntegrationListProps {
  integrations: IntegrationItem[];
  selected: string | null;
  onSelect: (id: string) => void;
}

function dotClass(id: string): string {
  const key = id.toLowerCase();
  if (key.includes("gemini")) return styles.dotGemini;
  if (key.includes("openai")) return styles.dotOpenai;
  if (key.includes("nebius")) return styles.dotNebius;
  return styles.dotGeneric;
}

function statusLabel(item: IntegrationItem): string {
  if (item.enabled) return "Enabled";
  if (item.last_test_status === "reachable") return "Verified";
  if (item.configured) return "Configured";
  if (item.installed) return "Installed";
  return "Not installed";
}

export function IntegrationList({
  integrations,
  selected,
  onSelect,
}: IntegrationListProps) {
  return (
    <div className={styles.providerTabs}>
      {integrations.map((item) => (
        <button
          key={item.id}
          type="button"
          className={
            item.id === selected
              ? styles.providerTabSelected
              : styles.providerTab
          }
          onClick={() => onSelect(item.id)}
        >
          <span
            className={`${styles.providerDot} ${dotClass(item.id)}`}
          ></span>
          <strong>{item.displayName}</strong>
          <small>{statusLabel(item)}</small>
        </button>
      ))}
    </div>
  );
}
