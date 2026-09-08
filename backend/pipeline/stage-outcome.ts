import type { IssueType, RootCause } from "../contracts/schema/types.js";

export type PipelineStage =
  | "researcher"
  | "planner"
  | "refactor"
  | "gap-analysis"
  | "evaluation"
  | "triple-validation"
  | "confirmation"
  | "hash"
  | "build"
  | "finalize";

export interface PipelineIssue {
  issue_type: IssueType;
  evidence: RootCause;
}

export type StageOutcome<T = unknown> =
  | { kind: "advance"; value: T }
  | {
      kind: "refine";
      value: T;
      issue: PipelineIssue;
      validation_feedback: string;
    }
  | { kind: "terminal"; value: T; issue: PipelineIssue };

export function advance<T>(value: T): StageOutcome<T> {
  return { kind: "advance", value };
}

export function refine<T>(
  value: T,
  issue: PipelineIssue,
  validationFeedback: string,
): StageOutcome<T> {
  return {
    kind: "refine",
    value,
    issue,
    validation_feedback: validationFeedback,
  };
}

export function terminal<T>(value: T, issue: PipelineIssue): StageOutcome<T> {
  return { kind: "terminal", value, issue };
}

export function isStageOutcome(value: unknown): value is StageOutcome {
  if (typeof value !== "object" || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "advance" || kind === "refine" || kind === "terminal";
}
