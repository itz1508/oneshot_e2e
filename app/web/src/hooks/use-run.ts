"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BackendRunSnapshot,
  BuildReviewGate,
  PlanReviewDraft,
  RunView,
} from "../lib/contracts";
import { optional, request } from "../lib/http-client";

/**
 * Run/gate wiring against the real backend surface:
 * - POST /api/conversations/:id/run with review_plan: true starts the run
 *   with both human gates enabled (202 { run_id }).
 * - Gate state is projected from GET /api/runs/:id (+ /review, /build-review).
 * - Decisions go to POST /api/runs/:id/review and /build-review.
 * Nothing is fabricated client-side: pending gates come only from the backend.
 */
export function useRun(conversationId?: string) {
  const [view, setView] = useState<RunView | null>(null);
  const [busy, setBusy] = useState(false);
  const idRef = useRef(conversationId);
  idRef.current = conversationId;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refresh = useCallback(async (runId: string) => {
    const [snapshot, review, buildReview] = await Promise.all([
      optional<BackendRunSnapshot>(`/api/runs/${runId}`),
      optional<PlanReviewDraft>(`/api/runs/${runId}/review`),
      optional<BuildReviewGate>(`/api/runs/${runId}/build-review`),
    ]);
    const next: RunView = { runId, snapshot, review, buildReview };
    setView(next);
    return next;
  }, []);

  const beginPolling = useCallback(
    (runId: string) => {
      stopPolling();
      pollRef.current = setInterval(() => {
        void refresh(runId)
          .then((v) => {
            if (v.snapshot?.pipeline_status === "Done") stopPolling();
          })
          .catch(() => {
            /* transient error; keep polling */
          });
      }, 1500);
    },
    [refresh, stopPolling],
  );

  useEffect(() => {
    if (!conversationId) {
      setView(null);
      return;
    }
    const stored =
      typeof window !== "undefined"
        ? localStorage.getItem(`oneshot.run.${conversationId}`)
        : null;
    if (stored) {
      void refresh(stored).then((v) => {
        if (v.snapshot?.pipeline_status !== "Done") {
          beginPolling(stored);
        }
      });
    }
    return stopPolling;
  }, [conversationId, refresh, beginPolling, stopPolling]);

  const start = useCallback(
    async (message: string, targetConversationId?: string) => {
      const id = targetConversationId || idRef.current;
      if (!id) return null;
      setBusy(true);
      try {
        const started = await request<{ run_id: string }>(
          `/api/conversations/${id}/run`,
          {
            method: "POST",
            body: JSON.stringify({ message, review_plan: true }),
          },
        );
        if (typeof window !== "undefined") {
          localStorage.setItem(`oneshot.run.${id}`, started.run_id);
          localStorage.setItem("oneshot.currentRunId", started.run_id);
        }
        await refresh(started.run_id);
        beginPolling(started.run_id);
        return started.run_id;
      } finally {
        setBusy(false);
      }
    },
    [beginPolling, refresh],
  );

  const confirmPlan = useCallback(
    async (action: "approve" | "cancel") => {
      const review = view?.review;
      if (!view || !review || review.status !== "pending") return;
      setBusy(true);
      try {
        await request(`/api/runs/${view.runId}/review`, {
          method: "POST",
          body: JSON.stringify(
            action === "approve"
              ? {
                  action,
                  revision: review.revision,
                  edits: review.edits,
                }
              : { action, revision: review.revision },
          ),
        });
        await refresh(view.runId);
      } finally {
        setBusy(false);
      }
    },
    [view, refresh],
  );

  const confirmBuild = useCallback(
    async (action: "approve" | "return") => {
      const gate = view?.buildReview;
      if (!view || !gate) return;
      setBusy(true);
      try {
        await request(`/api/runs/${view.runId}/build-review`, {
          method: "POST",
          body: JSON.stringify({ action, hash: gate.hash }),
        });
        await refresh(view.runId);
      } finally {
        setBusy(false);
      }
    },
    [view, refresh],
  );

  const clear = useCallback(() => {
    stopPolling();
    setView(null);
  }, [stopPolling]);

  return { view, busy, start, confirmPlan, confirmBuild, clear };
}
