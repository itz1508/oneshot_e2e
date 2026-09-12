"use client";

import styles from "./chat.module.css";

export function ActivityIndicator({ phase }: { phase?: string }) {
  return (
    <div className={styles.ephemeral}>
      <span className={styles.pulse}></span>
      <span>{phase ? `${phase}…` : "OneShot is thinking…"}</span>
    </div>
  );
}
