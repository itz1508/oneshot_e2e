/**
 * Phase 5 — Failure recovery domain: taxonomy, root-cause artifact, recovery
 * research contract, state machine, and retry policy.
 *
 * Boundaries enforced by this module (see tests/ts/recovery.test.ts):
 *  - The user-facing root-cause result NEVER carries API keys, raw stack
 *    dumps, internal prompts, full provider responses, or terminal logs.
 *  - Research escalation is optional and bounded; Tavily is never required.
 *  - Only verified workflow success (Builder -> Sandbox -> Validation ->
 *    Hash Verification) may transition a run to PASSED/DONE.
 */
import type { RootCause } from "../contracts/schema/types.js";

// ---------------------------------------------------------------------------
// Failure taxonomy (normalized categories)
// ---------------------------------------------------------------------------

export type FailureCategory =
  | "PROVIDER_CONFIGURATION_FAILURE"
  | "PROVIDER_AUTH_FAILURE"
  | "PROVIDER_MODEL_FAILURE"
  | "PROVIDER_NETWORK_FAILURE"
  | "WORKFLOW_INTERNAL_FAILURE"
  | "SANDBOX_EXECUTION_FAILURE"
  | "BUILD_FAILURE"
  | "VALIDATION_FAILURE"
  | "RESEARCH_EVIDENCE_INSUFFICIENT";

/** The workflow stage that produced the failure. */
export type RecoveryStage =
  | "ProviderBinding"
  | "Researcher"
  | "Planner"
  | "GapAnalysis"
  | "Evaluation"
  | "SchemaValidation"
  | "FixtureValidation"
  | "GoalValidation"
  | "TripleValidation"
  | "Builder"
  | "Sandbox"
  | "Validation"
  | "HashVerification"
  | "Workflow";

/** Recovery state machine states (explicit transitions only). */
export type RecoveryState =
  | "RUNNING"
  | "FAILURE_DETECTED"
  | "ROOT_CAUSE_ANALYSIS"
  | "RESEARCH_ESCALATION"
  | "RECOMMENDATION_READY"
  | "RETRYING"
  | "ROOT_CAUSE"
  | "DONE";

/** Recovery-status strings surfaced to the user. */
export type RecoveryStatus =
  | "READY_TO_RETRY"
  | "NEEDS_CONFIGURATION_CHANGE"
  | "ADDITIONAL_RESEARCH_PERFORMED"
  | "MANUAL_REVIEW_REQUIRED";

/** Statuses a completed recovery cycle may hand back to the retry gate. */
export const RECOVERY_TERMINAL_STATES: readonly RecoveryState[] = [
  "RECOMMENDATION_READY",
  "ROOT_CAUSE",
] as const;

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/** Bounded, sanitized evidence item (never raw dumps; never secrets). */
export interface FailureEvidence {
  evidence_id: string;
  source: string;
  statement: string;
  provenance: string;
}

// ---------------------------------------------------------------------------
// Root-cause artifact (one canonical normalized result)
// ---------------------------------------------------------------------------

/** Sanitized, user-facing root-cause result. No secrets, no raw dumps. */
export interface RootCauseResult {
  category: FailureCategory;
  stage: string;
  summary: string;
  rootCause: string;
  evidenceIds: string[];
  recommendation: string;
  retryable: boolean;
  confidence?: number;
  needsResearch?: boolean;
}

/** User-facing failure report (the ONLY shape the main workspace shows). */
export interface RecoveryReport {
  run_id: string;
  status: RecoveryStatus;
  what_failed: string;
  why: string;
  recommended_fix: string;
  retry: {
    allowed: boolean;
    attempts: number;
    max_attempts: number;
    policy_reason: string;
  };
  research: { escalated: boolean };
  state: RecoveryState;
}

/** Durable per-run recovery record (persisted in RunRepository). */
export interface RecoverySnapshot {
  run_id: string;
  state: RecoveryState;
  failure_category: FailureCategory;
  failed_stage: string;
  result: RootCauseResult;
  evidence: FailureEvidence[];
  retry: {
    allowed: boolean;
    attempts: number;
    max_attempts: number;
    policy_reason: string;
  };
  research_escalations: RecoveryResearchResult[];
  updated_at: string;
  /** Selected provider/model snapshot (non-secret identity only). */
  provider: { id: string; model?: string } | null;
}

// ---------------------------------------------------------------------------
// Recovery research contract (bounded subagent interface)
// ---------------------------------------------------------------------------

export interface RecoveryResearchRequest {
  failureCategory: FailureCategory;
  failedStage: string;
  summary: string;
  evidence: FailureEvidence[];
  requestedQuestion: string;
}

export interface RecoveryResearchResult {
  additionalEvidence: FailureEvidence[];
  findings: string;
  citations: string[];
  /** Which collection sources actually contributed (e.g. "local", "tavily"). */
  sources: string[];
}

export interface RecoveryIssue {
  request: RecoveryResearchRequest;
  existing: RootCauseResult;
}

// ---------------------------------------------------------------------------
// Evidence collection input (raw failure context from the workflow)
// ---------------------------------------------------------------------------

export interface SandboxFailureContext {
  executionId?: string;
  sandboxId?: string;
  exitCodes?: number[];
  commands?: string[];
  stdoutRefs?: string[];
  stderrRefs?: string[];
  timedOut?: boolean;
  firstStderrLine?: string;
  hashSandbox?: string;
}

export interface ValidationFailureContext {
  validationId?: string;
  planId?: string;
  schemaId?: string;
  fixtureId?: string;
  goalId?: string;
  failedAssertions?: string[];
  failedCriteria?: string[];
  schemaValid?: boolean;
}

export interface BuildFailureContext {
  command?: string;
  exitCode?: number;
  compilerLine?: string;
}

export interface RawFailureInput {
  runId: string;
  stage: RecoveryStage | string;
  category?: FailureCategory;
  message: string;
  expected?: string;
  sandbox?: SandboxFailureContext;
  build?: BuildFailureContext;
  validation?: ValidationFailureContext;
  hashVerified?: boolean;
  artifactIds?: string[];
  providerStatus?: {
    category?: FailureCategory | string;
    retryable?: boolean;
    message?: string;
  };
  provider?: { id: string; model?: string };
  /** Non-secret env/config hint (e.g. TAVILY enabled=false). */
  config?: Record<string, string | boolean | number>;
}

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

/** Bounded retry ceiling for a whole failure/recovery cycle. */
export const MAX_RETRY_ATTEMPTS = 3;

/** Explicit approval for a corrective retry (never implicit). */
export interface RetryDecision {
  approved: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

/** Map the canonical RootCause (contracts) into the Phase 5 taxonomy. */
export function toFailureCategory(rootCause: RootCause): FailureCategory {
  const text = `${rootCause.issue} ${rootCause.actual}`.replace(/\s+/g, " ");
  return classify(text) ?? "WORKFLOW_INTERNAL_FAILURE";
}

/** Classify free text; returns null when no rule matches. */
export function classify(text: string): FailureCategory | null {
  const t = text || "";
  if (/\bschema\b|\bfixture\b|\bgoal\b|assertion|criterion|validation/i.test(t)) {
    return "VALIDATION_FAILURE";
  }
  if (/\bcompiler?\b|\bbuild\b|\bmodule not found\b|\bcannot find module\b|syntaxerror/i.test(t)) {
    return "BUILD_FAILURE";
  }
  if (/exit(?:ed)?\s+(?:with\s+)?codes?|non-?zero|\bsandbox\b|segmentation|process (exited|crashed)/i.test(t)) {
    return "SANDBOX_EXECUTION_FAILURE";
  }
  if (
    /not configured|missing credential|missing api key|missing api_key|invalid api key|invalid_api_key|api key|credential|unauthorized|401|forbidden|403/i.test(
      t,
    )
  ) {
    return "PROVIDER_AUTH_FAILURE";
  }
  if (
    /model[^.\n]{0,60}(not available|not found|unavailable|does not exist|invalid|decommissioned)|(not available|not found|unavailable)[^.\n]{0,60}model|unsupported model/i.test(
      t,
    )
  ) {
    return "PROVIDER_MODEL_FAILURE";
  }
  if (
    /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|getaddrinfo|fetch failed|network|unreachable|connection (error|refused|reset|timed out)/i.test(
      t,
    )
  ) {
    return "PROVIDER_NETWORK_FAILURE";
  }
  if (/configuration|config|api base|apiBase|base url|endpoint/i.test(t)) {
    return "PROVIDER_CONFIGURATION_FAILURE";
  }
  return null;
}