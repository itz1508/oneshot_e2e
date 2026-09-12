"use client";

import type { ConversationSnapshot, RunView } from "../../lib/contracts";
import { Message } from "./message";
import { ReviewGate } from "./review-gate";
import { ActivityIndicator } from "./activity-indicator";
import styles from "./chat.module.css";

export interface MessageListProps {
  current: ConversationSnapshot | null;
  runView: RunView | null;
  busy: boolean;
  onConfirmResearch: (action: "approve" | "cancel") => void;
  onConfirmBuild: (action: "approve" | "return") => void;
}

export function MessageList({
  current,
  runView,
  busy,
  onConfirmResearch,
  onConfirmBuild,
}: MessageListProps) {
  const researchPending = runView?.review?.status === "pending";
  const buildPending = !researchPending && runView?.buildReview?.status === "pending";
  const done = runView?.snapshot?.pipeline_status === "Done";

  return (
    <section className={styles.conversation}>
      <div className={styles.thread}>
        {!current && (
          <div className={styles.empty}>
            What do you want to work on? Start a new conversation.
          </div>
        )}
        {current?.turns.map((turn) => (
          <Message key={turn.turn_id} turn={turn} />
        ))}
        {busy && !researchPending && !buildPending && (
          <ActivityIndicator phase={runView?.snapshot?.current_processor} />
        )}
        {researchPending && (
          <ReviewGate
            kind="research"
            review={runView!.review}
            busy={busy}
            onApprove={() => onConfirmResearch("approve")}
          />
        )}
        {buildPending && (
          <ReviewGate
            kind="build"
            buildReview={runView!.buildReview}
            busy={busy}
            onApprove={() => onConfirmBuild("approve")}
            onReturn={() => onConfirmBuild("return")}
          />
        )}
        {done && runView!.snapshot && (
          <div className={styles.gate}>
            <div className={styles.gateTitle}>
              Run finished — {runView!.snapshot.test_result ?? runView!.snapshot.result ?? "Done"}
            </div>
            {runView!.snapshot.hash_proof && (
              <div className={styles.gateValue}>
                {`hash ${runView!.snapshot.hash_proof.created_hash.slice(0, 16)}… · recomputed match: ${String(runView!.snapshot.hash_proof.equal)}`}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
