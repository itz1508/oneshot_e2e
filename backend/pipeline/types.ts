/**
 * Per-stage BullMQ pipeline types.
 *
 * Design rule: job payloads are tiny (just runId + optional stage gate).
 * All canonical artifacts live in the durable RunRepository + FileArtifactStore
 * and are loaded by each stage worker.
 */

export type PipelineStage =
  | "researcher"
  | "planner"
  | "refactor"
  | "gap-analysis"
  | "evaluation"
  | "triple-validation"
  | "confirmation"
  | "hash"
  | "build";

export type GateAction = "auto" | "await-human";

export interface StageHandoff {
  next: PipelineStage;
  gate: GateAction;
}

export interface StageJobData {
  runId: string;
}

export interface StageProgress {
  stage: PipelineStage;
  percent: number;
  message: string;
}

export interface ConfirmPlanInput {
  runId: string;
  history?: import("./history.js").PipelineHistory;
}

export interface ConfirmPlanResult {
  runId: string;
  plannerJobId: string;
  status: "planner_queued" | "planner_already_queued";
}
