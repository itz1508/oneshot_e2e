"use client";

import { useEffect } from "react";
import styles from "./history.module.css";

export interface ContentDrawerProps {
  title: string;
  meta: string;
  kind: string;
  text: string;
  onClose: () => void;
  onCopy: (text: string) => void;
  onPaste: (text: string) => void;
}

export function ContentDrawer({
  title,
  meta,
  kind,
  text,
  onClose,
  onCopy,
  onPaste,
}: ContentDrawerProps) {
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose]);

  return (
    <>
      <div className={styles.drawerScrim} onClick={onClose}></div>
      <aside className={styles.drawer}>
        <div className={styles.drawerHead}>
          <div className={styles.drawerHeading}>
            <strong>{title}</strong>
            <small>{meta}</small>
          </div>
          <button
            className={styles.drawerClose}
            type="button"
            onClick={onClose}
            aria-label="Close content drawer"
          >
            ×
          </button>
        </div>
        <div className={styles.drawerBody}>
          <div className={styles.drawerCopy}>
            <div className={styles.drawerKicker}>{kind}</div>
            <p className={styles.drawerText}>{text}</p>
            <div className={styles.drawerActions}>
              <button
                className={styles.contentAction}
                type="button"
                onClick={() => onCopy(text)}
              >
                Copy
              </button>
              <button
                className={styles.contentAction}
                type="button"
                onClick={() => onPaste(text)}
              >
                Paste
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}