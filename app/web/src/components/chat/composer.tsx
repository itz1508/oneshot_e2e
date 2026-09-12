"use client";

import { useRef, type KeyboardEvent } from "react";
import styles from "./chat.module.css";

export interface ComposerProps {
  draft: string;
  setDraft: (value: string) => void;
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function Composer({ draft, setDraft, onSend, disabled }: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const value = draft.trim();
    if (!value || disabled) return;
    onSend(value);
    setDraft("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (!pasted) return;
    e.preventDefault();
    setDraft(draft + pasted);
  };

  return (
    <div className={styles.composer}>
      <textarea
        ref={ref}
        className={styles.textarea}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder="Message..."
        aria-label="Message"
        rows={1}
        disabled={disabled}
      />
      <div className={styles.composerActions}>
        <button
          className={styles.sendBtn}
          type="button"
          onClick={submit}
          disabled={disabled}
          aria-label="Send"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
