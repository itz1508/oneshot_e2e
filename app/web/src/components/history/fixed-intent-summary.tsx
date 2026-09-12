"use client";

import type { FixedIntentSummary } from "../../lib/contracts";
import { deriveSummaryTitle } from "../../lib/projections";
import type { DrawerItem } from "./history-record";
import styles from "./history.module.css";

export interface FixedIntentSummaryProps {
  summary: FixedIntentSummary;
  index: number;
  onCopy: (text: string) => void;
  onPaste: (text: string) => void;
  onOpen: (item: DrawerItem) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function FixedIntentSummaryView({
  summary,
  index,
  onCopy,
  onPaste,
  onOpen,
}: FixedIntentSummaryProps) {
  const title = deriveSummaryTitle(summary, index);
  const meta = formatTime(summary.created_at);

  return (
    <section className={styles.summarySection}>
      <div className={styles.summaryHead}>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <p>{summary.body}</p>
      <div className={styles.contentActions}>
        <button
          className={styles.contentAction}
          type="button"
          onClick={() => onCopy(summary.body)}
        >
          Copy
        </button>
        <button
          className={styles.contentAction}
          type="button"
          onClick={() => onPaste(summary.body)}
        >
          Paste
        </button>
        <button
          className={styles.contentAction}
          type="button"
          onClick={() =>
            onOpen({
              title,
              meta,
              kind: "Fixed intent summary",
              text: summary.body,
            })
          }
        >
          Open
        </button>
      </div>
    </section>
  );
}
