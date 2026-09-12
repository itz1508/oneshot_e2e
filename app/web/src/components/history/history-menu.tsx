"use client";

import styles from "./history.module.css";

export interface HistoryMenuProps {
  expanded: boolean;
  onClick: () => void;
}

export function HistoryMenu({ expanded, onClick }: HistoryMenuProps) {
  return (
    <button
      className={styles.ellipsis}
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label="Review earlier context"
      title="Review earlier context"
    >
      <span></span>
      <span></span>
      <span></span>
    </button>
  );
}
