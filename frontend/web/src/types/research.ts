/**
 * Governed Research Flow Types
 *
 * Implements typed domain models for:
 * 1. Research task runs (start / check / update directive / cancel).
 * 2. Progressive Readiness Reports (score, passed invariants, failed checks, recommendations).
 * 3. Human Review Gate 1 (review_needed -> accepted / rejected).
 */

export type ResearchRunStatus =
  | "pending"
  | "running"
  | "review_needed"
  | "ready"
  | "cancelled";

export interface PlanTask {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
  dependencies: string[];
}

export interface ReadinessReport {
  score: number;
  total: number;
  passed: string[];
  failed: string[];
  recommendations: string[];
}

export interface ResearchRun {
  id: string;
  title: string;
  status: ResearchRunStatus;
  tasks: PlanTask[];
  directive?: string;
  readiness?: ReadinessReport;
  createdAt: string;
  checkedAt: string;
  finishedAt?: string | null;
}
