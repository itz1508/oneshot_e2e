/**
 * Research Drawer & Correction Cycle domain types.
 *
 * Provides governed projection contracts for the chat Research Drawer
 * and authoritative entities for revision-bound correction cycles.
 */

export type ResearchDrawerStatus =
  | "Off"
  | "Reconciling"
  | "Researching"
  | "Drafting"
  | "Validating"
  | "Needs Review"
  | "Ready";

export interface ResearchDrawerSummary {
  current_understanding: string;
  goal: string;
  key_requirements: string[];
  important_decisions: string[];
}

export interface ResearchDrawerFact {
  id: string;
  statement: string;
  provenance: string;
}

export interface ResearchDrawerResearch {
  facts: ResearchDrawerFact[];
  sources: string[];
  unresolved_questions: string[];
}

export interface ResearchDrawerBuildReadiness {
  baseline: string;
  fixture_id?: string;
  validation_status: "PASSED" | "FAILED" | "PENDING" | "NOT_STARTED";
  lock_status: "LOCKED" | "UNLOCKED" | "SUPERSEDED";
  open_blockers: string[];
}

export interface ResearchDrawerReview {
  status: "pending" | "approved" | "correction_requested" | "none";
  revision: number;
  active_correction?: {
    id: string;
    feedback: string;
    status: string;
  };
  allowed_actions: ("agree" | "request_correction")[];
}

export interface ResearchDrawerHandoff {
  research_bundle_status: string;
  ready_for_planner: boolean;
}

export interface ResearchDrawerProjection {
  conversation_id: string;
  research_revision: number;
  conversation_revision: number;
  status: ResearchDrawerStatus;
  summary: ResearchDrawerSummary;
  research: ResearchDrawerResearch;
  build_readiness: ResearchDrawerBuildReadiness;
  review: ResearchDrawerReview;
  handoff: ResearchDrawerHandoff;
  run_id?: string;
  updated_at: string;
}

export type CorrectionRequestStatus =
  | "RECEIVED"
  | "ACCEPTED"
  | "ANALYZING"
  | "PLANNED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "REJECTED"
  | "SUPERSEDED";

export interface CorrectionTarget {
  artifact_type: string;
  artifact_id: string;
}

export interface CorrectionRequest {
  correction_id: string;
  conversation_id: string;
  research_revision: number;
  conversation_revision: number;
  requested_by: string;
  feedback: string;
  targets: CorrectionTarget[];
  status: CorrectionRequestStatus;
  idempotency_key?: string;
  impact_analysis_id?: string;
  created_at: string;
  completed_at?: string;
  operation_id: string;
}

export interface ImpactAnalysis {
  impact_analysis_id: string;
  correction_id: string;
  research_revision: number;
  status: "COMPLETED" | "SUPERSEDED" | "FAILED";
  affected_artifacts: string[];
  affected_dependencies: string[];
  research_required: boolean;
  validation_required: string[];
  work_item_ids: string[];
  reasoning_summary: {
    reason: string;
    research_required: boolean;
    affected_artifacts: string[];
  };
  created_at: string;
}

export type ResearchWorkItemType =
  | "REBUILD_FIXTURE"
  | "REBUILD_TRACEABILITY"
  | "RECONCILE_FACTS"
  | "BASELINE_VALIDATE"
  | "ASSEMBLE_CANDIDATE";

export type ResearchWorkItemStatus =
  | "READY"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "BLOCKED";

export interface ResearchWorkItem {
  work_item_id: string;
  correction_id: string;
  correction_cycle_id: string;
  parent_research_revision: number;
  type: ResearchWorkItemType;
  status: ResearchWorkItemStatus;
  dependencies: string[];
  inputs: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  created_at: string;
  completed_at?: string;
}

export interface CorrectionCycle {
  correction_cycle_id: string;
  conversation_id: string;
  parent_research_revision: number;
  correction_request: CorrectionRequest;
  impact_analysis: ImpactAnalysis;
  work_items: ResearchWorkItem[];
  status: "ACTIVE" | "RESOLVED" | "SUPERSEDED" | "FAILED";
  candidate_revision?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCorrectionCommand {
  expected_conversation_revision: number;
  expected_research_revision: number;
  feedback: string;
  targets?: CorrectionTarget[];
  idempotency_key?: string;
  requested_by?: string;
}

export interface AgreeReviewCommand {
  expected_conversation_revision: number;
  expected_research_revision: number;
  notes?: string[];
}
