import type { Prompt, RootCause } from "../contracts/schema/types.js";

/** A single classified statement extracted from user input. */
export interface IntentStatement {
  statement_id: string;
  kind: "goal" | "outcome" | "requirement" | "constraint" | "context";
  value: string;
  source_turn_ids: string[];
  revision: number;
}

/** Accumulated intent state across conversation turns. */
export interface IntentState {
  intent_id: string;
  revision: number;
  conversation_id: string;
  source_turn_ids: string[];
  goal?: string;
  requested_outcome?: string;
  requirements: string[];
  constraints: string[];
  context: string[];
  statements: IntentStatement[];
  missing_required_information: string[];
  ready_for_prompt: boolean;
}

/** A single user message in a conversation. */
export interface ConversationTurn {
  turn_id: string;
  turn_number: number;
  user_message: string;
  created_at: string;
}

/** Full persisted conversation snapshot. */
export interface ConversationSnapshot {
  conversation_id: string;
  session_id: string;
  turns: ConversationTurn[];
  intent: IntentState;
  created_at: string;
  updated_at: string;
}

/**
 * Targeted help request — support metadata outside confirmed_package.core.
 * Emitted when required user-owned information is missing and Prompt(id) cannot
 * yet be formed.  No random retry / fix loop — the system asks the smallest
 * targeted question and re-enters through Intent/Prompt revision.
 */
export interface HelpRequest {
  request_id: string;
  reason: string;
  question: string;
  required_information: string[];
  source_processor: string;
  intent_id?: string;
  conversation_id?: string;
  prompt_revision_required: boolean;
}

/** Prompt was successfully created from sufficient intent information. */
export interface PromptCreation {
  result: "PASSED";
  prompt: Prompt;
  intent: IntentState;
}

/** Prompt cannot be created — missing user-owned information. */
export interface PromptNeedsHelp {
  result: "ROOT_CAUSE";
  root_cause: RootCause;
  help_request: HelpRequest;
  intent: IntentState;
}

/** Discriminated union: either the prompt was created or help is needed. */
export type PromptCreationResult = PromptCreation | PromptNeedsHelp;
