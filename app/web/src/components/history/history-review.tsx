"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationMemory, MemoryRecord } from "../../lib/contracts";
import { HistoryRecord } from "./history-record";
import { FixedIntentSummaryView } from "./fixed-intent-summary";
import { ContentDrawer } from "./content-drawer";
import styles from "./history.module.css";

export interface HistoryReviewProps {
  memory: ConversationMemory;
  onToggleFixedIntent: (enabled: boolean) => void;
  onClose: () => void;
  onPaste: (text: string) => void;
}

interface DrawerItem {
  title: string;
  meta: string;
  kind: string;
  text: string;
}

export function HistoryReview({
  memory,
  onToggleFixedIntent,
  onClose,
  onPaste,
}: HistoryReviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [drawer, setDrawer] = useState<DrawerItem | null>(null);

  useEffect(() => {
    function handle(e: MouseEvent | KeyboardEvent) {
      if (e instanceof KeyboardEvent && e.key === "Escape") {
        onClose();
        return;
      }
      if (
        e instanceof MouseEvent &&
        ref.current &&
        !ref.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", handle);
    };
  }, [onClose]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const bySection = new Map<string, MemoryRecord[]>();
    for (const record of memory.records) {
      const existing = bySection.get(record.section_id);
      if (existing) {
        existing.push(record);
      } else {
        bySection.set(record.section_id, [record]);
        order.push(record.section_id);
      }
    }
    return order.map((sectionId, index) => ({
      sectionId,
      label: `Section ${index + 1}`,
      records: bySection.get(sectionId) ?? [],
    }));
  }, [memory.records]);

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  return (
    <>
      <div className={styles.review} ref={ref}>
        <div className={styles.reviewHead}>
          <div className={styles.reviewHeading}>
            <strong>History</strong>
            <small>Earlier context from this conversation</small>
          </div>
          <label className={styles.fixedIntentControl}>
            <span className={styles.fixedIntentLabel}>Fixed intent summary</span>
            <input
              type="checkbox"
              checked={memory.fixed_intent_enabled}
              onChange={(e) => onToggleFixedIntent(e.target.checked)}
              aria-label="Toggle fixed intent summary"
            />
            <span className={styles.fixedIntentSwitch} aria-hidden="true">
              <span className={styles.fixedIntentKnob}></span>
              <span className={styles.fixedIntentOff}>Off</span>
              <span className={styles.fixedIntentOn}>On</span>
            </span>
          </label>
        </div>
        <div className={styles.reviewBody}>
          {memory.fixed_intent_enabled ? (
            <>
              <div className={styles.reviewLabel}>Fixed intent summaries</div>
              {memory.summaries.map((s, i) => (
                <FixedIntentSummaryView
                  key={s.summary_id}
                  summary={s}
                  index={i}
                  onCopy={handleCopy}
                  onPaste={onPaste}
                  onOpen={(item) => setDrawer(item)}
                />
              ))}
            </>
          ) : (
            <>
              <div className={styles.reviewLabel}>Earlier fragments</div>
              {groups.map((group) => (
                <div className={styles.rawGroup} key={group.sectionId}>
                  <div className={styles.groupHead}>
                    <span>{group.label}</span>
                    <span>
                      {group.records.length}{" "}
                      {group.records.length === 1 ? "fragment" : "fragments"}
                    </span>
                  </div>
                  {group.records.map((r) => (
                    <HistoryRecord
                      key={r.record_id}
                      record={r}
                      onCopy={handleCopy}
                      onPaste={onPaste}
                      onOpen={(item) => setDrawer(item)}
                    />
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      {drawer && (
        <ContentDrawer
          title={drawer.title}
          meta={drawer.meta}
          kind={drawer.kind}
          text={drawer.text}
          onClose={() => setDrawer(null)}
          onCopy={handleCopy}
          onPaste={onPaste}
        />
      )}
    </>
  );
}
