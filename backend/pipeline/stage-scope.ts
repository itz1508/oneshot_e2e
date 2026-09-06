import type {
  PipelineStage,
} from "./stage-outcome.js";

const ITERATIVE_STAGES =
  new Set<PipelineStage>([
    "refactor",
    "gap-analysis",
    "evaluation",
    "triple-validation",
  ]);

export function isIterativeStage(
  stage: PipelineStage,
): boolean {
  return ITERATIVE_STAGES.has(
    stage,
  );
}

export function stageIteration(
  stage: PipelineStage,
  iteration: number,
): number {
  return isIterativeStage(stage)
    ? iteration
    : 0;
}