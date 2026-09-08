/**
 * Per-stage BullMQ pipeline types.
 *
 * Design rule: job payloads are tiny (just runId + optional stage gate).
 * All canonical artifacts live in the durable RunRepository + FileArtifactStore
 * and are loaded by each stage worker.
 */

/**
 * Single source of truth for the queued stage list lives in
 * stage-outcome.ts (it is part of the durable checkpoint key space).
 */
import type { PipelineStage } from "./stage-outcome.js";
import type { PlanReviewEdits } from "../runtime/plan-review.js";

export type { PipelineStage };
export type { PlanReviewEdits };

export type GateAction = "auto" | "await-human";

export interface StageHandoff {
  next: PipelineStage;
  gate: GateAction;
}

export interface StageJobData {
  version: 2;
  runId: string;
  stage: PipelineStage;
  /**
   * Refinement iteration for iterative stages (refactor, gap-analysis,
   * evaluation, triple-validation). Run-level stages always execute at
   * iteration 0 regardless of what the job carries (see stage-scope.ts).
   */
  iteration: number;
}

export interface StageProgress {
  runId?: string;
  stage: PipelineStage;
  iteration?: number;
  percent: number;
  message: string;
}

export interface ConfirmPlanInput {
  runId: string;
  history?: import("./history.js").PipelineHistory;
  /** Optional user edits to the research baseline, validated and persisted before Planner runs. */
  edits?: PlanReviewEdits;
  /** Required when edits are supplied so the edited bundle can be loaded and saved. */
  store?: import("../runtime/artifact-store.js").ArtifactStore;
  /** Required when edits are supplied so artifact paths are recorded in the run snapshot. */
  runs?: import("../runtime/run-repository.js").RunRepository;
}

export type ConfirmPlanResult =
  | {
      status: "confirmed";
      plannerQueued: true;
    }
  | {
      status: "already_confirmed";
      plannerQueued: false;
    };
