"use client";

import { useState } from "react";
import type { ConversationSnapshot } from "../../lib/contracts";
import { useRun } from "../../hooks/use-run";
import { useHistory } from "../../hooks/use-history";
import { MessageList } from "./message-list";
import { Composer } from "./composer";
import { HistoryMenu } from "../history/history-menu";
import { HistoryReview } from "../history/history-review";
import styles from "./chat.module.css";

export interface ChatViewProps {
  current: ConversationSnapshot | null;
  busy: boolean;
  onSend: (message: string) => Promise<ConversationSnapshot>;
  onToggleFixedIntent: (enabled: boolean) => void;
}

export function ChatView({
  current,
  busy,
  onSend,
  onToggleFixedIntent,
}: ChatViewProps) {
  const run = useRun(current?.conversation_id);
  const history = useHistory();
  const [autoRunDone, setAutoRunDone] = useState(false);
  const [draft, setDraft] = useState("");

  const handleSend = async (message: string) => {
    const snap = await onSend(message);
    if (snap?.intent?.ready_for_prompt && !autoRunDone) {
      setAutoRunDone(true);
      run.start(message, snap.conversation_id).catch(() => {
        // prompt may need more info; ignore
      });
    }
  };

  return (
    <div className={styles.chat}>
      <section className={styles.minibar}>
        {current && (
          <HistoryMenu expanded={history.open} onClick={history.toggle} />
        )}
      </section>
      <MessageList
        current={current}
        runView={run.view}
        busy={busy || run.busy}
        onConfirmResearch={run.confirmPlan}
        onConfirmBuild={run.confirmBuild}
      />
      <div className={styles.composerWrap}>
        <Composer
          draft={draft}
          setDraft={setDraft}
          onSend={handleSend}
          disabled={busy}
        />
      </div>
      {current && history.open && (
        <HistoryReview
          memory={current.memory}
          onToggleFixedIntent={onToggleFixedIntent}
          onClose={history.toggle}
          onPaste={setDraft}
        />
      )}
    </div>
  );
}
