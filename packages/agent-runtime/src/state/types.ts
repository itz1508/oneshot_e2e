/**
 * OneShot Agent Runtime — Strands Agent State Architecture Types
 *
 * Implements the 3-tier state model per Strands Agents SDK documentation:
 * https://strandsagents.com/docs/user-guide/sdk/agents/state/
 *
 * 1. Conversation History: Messages sent to LLM during inference, managed by SlidingWindowConversationManager.
 * 2. Agent State (appState): Durable key-value storage living outside the conversation context.
 * 3. Invocation State: Ephemeral per-request contextual data shared across tools and hooks.
 */

import type { WorkflowStage } from "../workflow/types.ts";

/**
 * Durable Agent State (appState) schema for OneShot.
 * Lives outside the LLM conversation context and persists across requests.
 * MUST be strictly JSON serializable.
 */
export interface OneShotAppStateData {
  workflowStage: WorkflowStage;
  gate1Status: "pending" | "confirmed" | "rejected";
  gate2Status: "pending" | "confirmed" | "rejected";
  confirmedPackageCore: string | null;
  restorePoint: string;
  userPreferences: Record<string, unknown>;
  activeSubtaskIds: string[];
  metadata: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Ephemeral Invocation State schema for OneShot.
 * Passed per invocation, shared by reference across all hooks and tools,
 * not included in model prompt context, and returned on AgentResult.invocationState.
 */
export interface OneShotInvocationStateData {
  requestId: string;
  userId: string;
  runId: string;
  stageContext?: string;
  toolCallCount?: number;
  auditEvents?: Array<{
    timestamp: string;
    action: string;
    details?: unknown;
  }>;
  [key: string]: unknown;
}

/**
 * Options for configuring conversation management in Strands.
 */
export interface ConversationManagerOptions {
  windowSize?: number;
  recordDirectToolCall?: boolean;
}
