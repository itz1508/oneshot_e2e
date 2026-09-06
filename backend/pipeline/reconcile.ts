import type {
  PipelineCheckpoints,
  StageIdentity,
} from "./checkpoints.js";

import {
  applyTransition,
  type TransitionServices,
} from "./apply-transition.js";

import {
  resolveTransition,
} from "../workflow/canonical-transition.js";

import type {
  PipelineStage,
} from "./stage-outcome.js";

export interface ReconcileInput {
  runId: string;
  stage: PipelineStage;
  iteration: number;
}

export interface ReconcileResult {
  recovered: boolean;
  reason: string;
}

/**
 * Recover one stage after a crash:
 *
 *   not executed            → nothing to recover
 *   transition committed    → nothing to recover
 *   executed + pending/none → resolve the outcome and re-drive the
 *                             transition (deterministic job IDs keep the
 *                             destination idempotent)
 */
export async function reconcileStage(
  input: ReconcileInput,
  checkpoints: PipelineCheckpoints,
  services: TransitionServices,
): Promise<ReconcileResult> {
  const identity: StageIdentity = {
    runId:
      input.runId,

    stage:
      input.stage,

    iteration:
      input.iteration,
  };

  const executed =
    await checkpoints.isExecuted(
      identity,
    );

  if (!executed) {
    return {
      recovered: false,
      reason:
        "Stage has not completed execution.",
    };
  }

  const transitionState =
    await checkpoints
      .getTransitionState(
        identity,
      );

  if (
    transitionState ===
    "committed"
  ) {
    return {
      recovered: false,
      reason:
        "Transition is already committed.",
    };
  }

  const outcome =
    await checkpoints.loadOutcome(
      identity,
    );

  if (!outcome) {
    throw new Error(
      `Executed stage ${input.stage} has no persisted outcome.`,
    );
  }

  const transition =
    resolveTransition(
      input.stage,
      outcome,
      input.iteration,
    );

  await applyTransition(
    identity,
    transition,
    services,
  );

  return {
    recovered: true,
    reason:
      "Uncommitted transition recovered.",
  };
}