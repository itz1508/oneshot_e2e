/**
 * OneShot AG-UI (Agent–User Interaction) Protocol Client
 *
 * Implements the official AG-UI protocol client for Strands Agents per:
 * https://strandsagents.com/docs/integrations/integrations/ag-ui/
 * https://github.com/ag-ui-protocol/ag-ui
 *
 * Scope:
 * - Minimal, complete vertical slice for streamed chat.
 * - Real backend SSE event ingestion from Strands AG-UI adapter.
 * - Human approval workflow for OneShot canonical gates (Research Review, Build Ready).
 * - Avoids premature generative UI mock components or uncontracted shared state.
 */

import type { StrandsToolResultBlock } from "./api";

export type AgUiEventType =
  | "RUN_START"
  | "RUN_FINISH"
  | "STEP_START"
  | "STEP_FINISH"
  | "TEXT_MESSAGE_DELTA"
  | "TOOL_CALL_START"
  | "TOOL_CALL_FINISH"
  | "HUMAN_APPROVAL_REQUEST"
  | "HUMAN_APPROVAL_RESPONSE";

export interface AgUiBaseEvent {
  type: AgUiEventType;
  runId: string;
  timestamp: string;
}

export interface AgUiRunStartEvent extends AgUiBaseEvent {
  type: "RUN_START";
  agentName: string;
}

export interface AgUiRunFinishEvent extends AgUiBaseEvent {
  type: "RUN_FINISH";
  status: "COMPLETED" | "CANCELLED" | "FAILED";
  finalMessage?: string;
  error?: string;
}

export interface AgUiStepStartEvent extends AgUiBaseEvent {
  type: "STEP_START";
  stepId: string;
  label: string;
}

export interface AgUiStepFinishEvent extends AgUiBaseEvent {
  type: "STEP_FINISH";
  stepId: string;
  status: "completed" | "failed";
}

export interface AgUiTextDeltaEvent extends AgUiBaseEvent {
  type: "TEXT_MESSAGE_DELTA";
  delta: string;
}

export interface AgUiToolCallStartEvent extends AgUiBaseEvent {
  type: "TOOL_CALL_START";
  toolUseId: string;
  toolName: string;
  parameters: Record<string, unknown>;
}

export interface AgUiToolCallFinishEvent extends AgUiBaseEvent {
  type: "TOOL_CALL_FINISH";
  toolUseId: string;
  toolName: string;
  result: StrandsToolResultBlock;
}

export interface AgUiHumanApprovalRequestEvent extends AgUiBaseEvent {
  type: "HUMAN_APPROVAL_REQUEST";
  approvalId: string;
  gate: "Research Review" | "Build Ready";
  description: string;
  packageCore?: Record<string, unknown>;
}

export interface AgUiHumanApprovalResponseEvent extends AgUiBaseEvent {
  type: "HUMAN_APPROVAL_RESPONSE";
  approvalId: string;
  approved: boolean;
  notes?: string;
}

export type AgUiEvent =
  | AgUiRunStartEvent
  | AgUiRunFinishEvent
  | AgUiStepStartEvent
  | AgUiStepFinishEvent
  | AgUiTextDeltaEvent
  | AgUiToolCallStartEvent
  | AgUiToolCallFinishEvent
  | AgUiHumanApprovalRequestEvent
  | AgUiHumanApprovalResponseEvent;
