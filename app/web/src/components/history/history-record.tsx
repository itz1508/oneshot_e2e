"use client";

import type { MemoryRecord } from "../../lib/contracts";
import { deriveRecordTitle } from "../../lib/projections";
import styles from "./history.module.css";

export interface DrawerItem {
  title: string;
  meta: string;
  kind: string;
  text: string;
}

export interface HistoryRecordProps {
  record: MemoryRecord;
  onCopy: (text: string) => void;
  onPaste: (text: string) => void;
  onOpen: (item: DrawerItem) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function HistoryRecord({
  record,
  onCopy,
  onPaste,
  onOpen,
}: HistoryRecordProps) {
  const title = deriveRecordTitle(record);
  const fullText = `${title}\n${record.text}`;
  const meta = formatTime(record.created_at);

  const open = () =>
    onOpen({ title, meta, kind: "Earlier fragment", text: record.text });

  return (
    <button className={styles.fragment} type="button" onClick={open}>
      <strong>{title}</strong>
      <small>{record.text}</small>
      <time>{meta}</time>
      <span
        className={styles.contentActions}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className={styles.contentAction}
          role="button"
          tabIndex={0}
          onClick={() => onCopy(fullText)}
          onKeyDown={(e) => e.key === "Enter" && onCopy(fullText)}
        >
          Copy
        </span>
        <span
          className={styles.contentAction}
          role="button"
          tabIndex={0}
          onClick={() => onPaste(record.text)}
          onKeyDown={(e) => e.key === "Enter" && onPaste(record.text)}
        >
          Paste
        </span>
        <span
          className={styles.contentAction}
          role="button"
          tabIndex={0}
          onClick={open}
          onKeyDown={(e) => e.key === "Enter" && open()}
        >
          Open
        </span>
      </span>
    </button>
  );
}