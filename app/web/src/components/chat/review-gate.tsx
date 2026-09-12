"use client";

import { useState } from "react";
import type { BuildReviewGate, PlanReviewDraft } from "../../lib/contracts";
import styles from "./chat.module.css";

export interface ReviewGateProps {
  kind: "research" | "build";
  review?: PlanReviewDraft;
  buildReview?: BuildReviewGate;
  busy: boolean;
  onApprove: () => void;
  onReturn?: () => void;
}

export function ReviewGate({
  kind,
  review,
  buildReview,
  busy,
  onApprove,
  onReturn,
}: ReviewGateProps) {
  const [open, setOpen] = useState(false);
  const label = kind === "research" ? "Research Review" : "Build Review";
  const confirmLabel = kind === "research" ? "Continue" : "Confirm";

  return (
    <div className={styles.gate}>
      <div className={styles.gateTitle}>{label} — pending your decision</div>
      <div className={styles.gateActions}>
        <button
          className={styles.gateButton}
          type="button"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide details" : "Review"}
        </button>
        <button
          className={styles.gatePrimary}
          type="button"
          onClick={onApprove}
          disabled={busy}
        >
          {confirmLabel}
        </button>
        {kind === "build" && onReturn && (
          <button
            className={styles.gateButton}
            type="button"
            onClick={onReturn}
            disabled={busy}
          >
            Return
          </button>
        )}
      </div>

      {open && kind === "research" && review && (
        <>
          <div className={styles.gateField}>
            <div className={styles.gateLabel}>Objective</div>
            <div className={styles.gateValue}>{review.edits.objective}</div>
          </div>
          <div className={styles.gateField}>
            <div className={styles.gateLabel}>Requirements</div>
            <div className={styles.gateValue}>
              {review.edits.requirements.map((r) => r.statement).join("\n")}
            </div>
          </div>
          <div className={styles.gateField}>
            <div className={styles.gateLabel}>Steps</div>
            <div className={styles.gateValue}>
              {review.edits.steps.map((s) => s.description).join("\n")}
            </div>
          </div>
          <div className={styles.gateField}>
            <div className={styles.gateLabel}>Notes</div>
            <div className={styles.gateValue}>
              {review.edits.notes.length > 0
                ? review.edits.notes.join("\n")
                : "—"}
            </div>
          </div>
          <div className={styles.gateField}>
            <div className={styles.gateLabel}>Revision</div>
            <div className={styles.gateValue}>{review.revision}</div>
          </div>
        </>
      )}

      {open && kind === "build" && buildReview && (
        <>
          <div className={styles.gateField}>
            <div className={styles.gateLabel}>Hash</div>
            <div className={styles.gateValue}>{buildReview.hash}</div>
          </div>
          <div className={styles.gateField}>
            <div className={styles.gateLabel}>Validation</div>
            <div className={styles.gateValue}>
              {`schema: ${buildReview.validation.schema}\nfixture: ${buildReview.validation.fixture}\ngoal: ${buildReview.validation.goal}`}
            </div>
          </div>
          <div className={styles.gateField}>
            <div className={styles.gateLabel}>Steps</div>
            <div className={styles.gateValue}>
              {buildReview.steps
                .map((s) => `${s.description} (${s.responsibility})`)
                .join("\n")}
            </div>
          </div>
          <div className={styles.gateField}>
            <div className={styles.gateLabel}>Revision</div>
            <div className={styles.gateValue}>{buildReview.revision}</div>
          </div>
        </>
      )}
    </div>
  );
}
