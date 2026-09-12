export type IntentStatementKind =
  | "goal"
  | "outcome"
  | "requirement"
  | "constraint"
  | "context";

export interface IntentStatement {
  statement_id: string;
  kind: IntentStatementKind;
  value: string;
  source_turn_ids: string[];
  revision: number;
}

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

export interface ConversationTurn {
  turn_id: string;
  turn_number: number;
  user_message: string;
  created_at: string;
}

export interface MemoryRecord {
  record_id: string;
  section_id: string;
  turn_id: string;
  type_ids: IntentStatementKind[];
  record_kind: "fragment";
  text: string;
  created_at: string;
}

export interface FixedIntentSummary {
  summary_id: string;
  section_id: string;
  type_ids: IntentStatementKind[];
  source_record_ids: string[];
  source_digest: string;
  body: string;
  created_at: string;
}

export interface ConversationMemory {
  fixed_intent_enabled: boolean;
  sections: MemorySection[];
  records: MemoryRecord[];
  summaries: FixedIntentSummary[];
}

export interface MemorySection {
  section_id: string;
  closed: boolean;
  record_ids: string[];
  created_at: string;
}

export interface ConversationSnapshot {
  conversation_id: string;
  session_id: string;
  turns: ConversationTurn[];
  intent: IntentState;
  memory: ConversationMemory;
  created_at: string;
  updated_at: string;
}

export interface ConversationListItem {
  conversation_id: string;
  session_id: string;
  title: string;
  updated_at: string;
}

export interface Prompt {
  prompt_id: string;
  intent: string;
  requested_outcome: string;
  context: { context_id: string; statement: string }[];
  research_direction: string[];
}

export interface HelpRequest {
  request_id: string;
  reason: string;
  question: string;
  required_information: string[];
}

export interface PromptCreationPassed {
  result: "Passed";
  prompt: Prompt;
  intent: IntentState;
}

export interface PromptCreationNeedsHelp {
  result: "Root Cause";
  help_request: HelpRequest;
  intent: IntentState;
}

export type PromptCreationResult = PromptCreationPassed | PromptCreationNeedsHelp;

export interface BackendRunSnapshot {
  run_id: string;
  pipeline_status: string;
  current_processor?: string;
  test_result?: string;
  result?: string;
  artifacts?: Record<string, string>;
  hash_proof?: {
    created_hash: string;
    recomputed_hash: string;
    equal: boolean;
  };
}

/** Mirrors backend PlanReview (GET /api/runs/:id/review). */
export interface PlanReviewEdits {
  objective: string;
  requirements: { id: string; statement: string }[];
  steps: { id: string; description: string }[];
  notes: string[];
}

export interface PlanReviewDraft {
  run_id: string;
  revision: number;
  status: "pending" | "approved" | "cancelled";
  created_at: string;
  confirmed_at?: string;
  edits: PlanReviewEdits;
}

/** Mirrors backend BuildReview (GET /api/runs/:id/build-review). */
export interface BuildReviewGate {
  run_id: string;
  hash: string;
  plan_id: string;
  revision: number;
  status: "pending" | "approved";
  validation: { schema: string; fixture: string; goal: string };
  steps: { step_id: string; description: string; responsibility: string }[];
  created_at: string;
}

export interface RunView {
  runId: string;
  snapshot?: BackendRunSnapshot;
  review?: PlanReviewDraft;
  buildReview?: BuildReviewGate;
}

export type IntegrationTestStatus =
  | "testing"
  | "reachable"
  | "auth_failed"
  | "unreachable"
  | "package_missing"
  | "invalid_config";

export interface IntegrationItem {
  id: string;
  displayName: string;
  installed: boolean;
  configured: boolean;
  enabled: boolean;
  last_test_status: IntegrationTestStatus | null;
  last_test_at: string | null;
  capabilities: string[];
}

export interface IntegrationTestResult {
  id: string;
  ok: boolean;
  status: IntegrationTestStatus;
  last_test_at: string;
  error?: string;
}

export interface PipelineEvent {
  scope: "SUPPORT" | "CORE";
  stage?: string;
  status?: string;
  message?: string;
  test_result?: string;
  issue_type?: string;
  issue?: unknown;
  [key: string]: unknown;
}

export interface IntegrationFormValues {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

export interface ServerSentEvent {
  run_id: string;
  source: string;
  event: string;
  payload: PipelineEvent;
}
