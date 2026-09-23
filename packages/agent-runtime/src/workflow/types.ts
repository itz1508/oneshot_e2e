/**
 * OneShot Canonical Workflow Engine Types
 *
 * Defines the sequential workflow phases, gate invariants, and stage state.
 */

export type WorkflowStage =
  | "research"
  | "planning"
  | "gap_analysis"
  | "evaluation"
  | "builder";

export type GateStatus = "PENDING_APPROVAL" | "CONFIRMED" | "REJECTED";

export interface HumanGateState {
  gateId: "gate_1_research_review" | "gate_2_build_ready";
  name: string;
  status: GateStatus;
  confirmedAt?: string;
  confirmedBy?: string;
  packageHash?: string;
}

export interface NodeInvocation {
  id: string;
  nodeId?: string;
  scope?: string;
  timestamp?: number;
  parentNodeId?: string;
  metadata?: Record<string, unknown>;
}

export interface StageTodo extends NodeInvocation {
  id: string;
  text: string;
  state: "wait" | "active" | "done" | "fail";
}

export interface Step extends NodeInvocation {
  stage: WorkflowStage;
  name: string;
  status: "waiting" | "active" | "completed" | "failed";
  todos?: StageTodo[];
  result?: unknown;
  error?: string;
}

export interface WorkflowStageInfo {
  stage: WorkflowStage;
  name: string;
  status: "waiting" | "active" | "completed" | "failed";
  todos: StageTodo[];
}

export interface WorkflowTransitionResult {
  success: boolean;
  fromStage: WorkflowStage;
  toStage: WorkflowStage;
  error?: string;
  gateRequired?: HumanGateState;
}

/**
 * Single Canonical Workflow Event Envelope
 */
export interface BaseWorkflowEvent<TType extends string = string, TPayload = unknown> {
  id: string;
  type: TType;
  timestamp: number;
  producerId: string;
  publishAs?: string;
  sessionId?: string;
  payload: TPayload;
}
