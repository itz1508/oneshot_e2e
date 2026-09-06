import type { PipelineIssue, PipelineStage, StageOutcome } from "../pipeline/stage-outcome.js";

export interface FinalizationIntent {
  test_result: "Failed";
  issue: PipelineIssue;
}

export type PipelineTransition =
  | { type: "next"; stage: PipelineStage; iteration: number; finalization?: FinalizationIntent }
  | { type: "wait-human" }
  | { type: "done"; test_result: "Passed" | "Failed"; issue?: PipelineIssue };

export const MAX_REFINEMENT_ITERATIONS = 3;

function failedFinalization(outcome: Extract<StageOutcome, { kind: "terminal" | "refine" }>): PipelineTransition {
  return {
    type: "next",
    stage: "finalize",
    iteration: 0,
    finalization: { test_result: "Failed", issue: outcome.issue },
  };
}

export function resolveTripleValidationTransition(outcome: StageOutcome, iteration: number): PipelineTransition {
  if (outcome.kind === "terminal") return failedFinalization(outcome);
  if (outcome.kind === "refine") {
    if (iteration >= MAX_REFINEMENT_ITERATIONS) return failedFinalization(outcome);
    return { type: "next", stage: "gap-analysis", iteration: iteration + 1 };
  }
  return { type: "next", stage: "confirmation", iteration: 0 };
}

export function resolveTransition(stage: PipelineStage, outcome: StageOutcome, iteration: number): PipelineTransition {
  if (outcome.kind === "terminal" && stage !== "finalize") return failedFinalization(outcome);

  switch (stage) {
    case "researcher": return { type: "wait-human" };
    case "planner": return { type: "next", stage: "refactor", iteration: 0 };
    case "refactor": return { type: "next", stage: "gap-analysis", iteration };
    case "gap-analysis": return outcome.kind === "refine"
      ? { type: "next", stage: "gap-analysis", iteration: iteration + 1 }
      : { type: "next", stage: "evaluation", iteration };
    case "evaluation": return outcome.kind === "refine"
      ? { type: "next", stage: "gap-analysis", iteration: iteration + 1 }
      : { type: "next", stage: "triple-validation", iteration };
    case "triple-validation": return resolveTripleValidationTransition(outcome, iteration);
    case "confirmation": return { type: "next", stage: "hash", iteration: 0 };
    case "hash": return { type: "next", stage: "build", iteration: 0 };
    case "build": return { type: "next", stage: "finalize", iteration: 0 };
    case "finalize": return outcome.kind === "terminal"
      ? { type: "done", test_result: "Failed", issue: outcome.issue }
      : { type: "done", test_result: "Passed" };
    default: return assertNever(stage);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unknown pipeline stage: ${JSON.stringify(value)}`);
}
