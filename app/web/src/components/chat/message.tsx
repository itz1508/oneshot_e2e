"use client";

import type { ConversationTurn } from "../../lib/contracts";
import styles from "./chat.module.css";

export interface MessageProps {
  turn: ConversationTurn;
}

export function Message({ turn }: MessageProps) {
  return (
    <div className={styles.userMessage}>
      <div className={styles.userBubble}>{turn.user_message}</div>
    </div>
  );
}
