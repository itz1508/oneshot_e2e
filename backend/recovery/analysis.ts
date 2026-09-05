import type {
  FailureCategory,
  FailureEvidence,
  RawFailureInput,
  RootCauseResult,
  RecoveryStatus,
} from "./types.js";
import { redactEvidenceText, stripStackFrames } from "./evidence.js";

/** Collapse any multi-line text (stacks, provider bodies) into one line. */
function oneLine(text: string): string {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

/** First sentence, stack frames and secrets removed — user-facing safe. */
function firstSentence(text: string): string {
  const t = stripStackFrames(String(text ?? ""));
  const single = t.replace(/\s+/g, " ").trim();
  const cut = single.search(/[.!?](\s|$)/);
  return (cut > 0 ? single.slice(0, cut + 1) : single).slice(0, 200);
}

/** Categories whose corrective action is a user configuration change. */
const CONFIG_CATEGORIES = new Set<FailureCategory>([
  "PROVIDER_CONFIGURATION_FAILURE",
  "PROVIDER_AUTH_FAILURE",
  "PROVIDER_MODEL_FAILURE",
]);

/** Deterministic per-category recommendation templates. */
function recommendationFor(
  category: FailureCategory,
  stage: string,
): string {
  switch (category) {
    case "PROVIDER_AUTH_FAILURE":
      return "Verify the credential for the selected provider in Provider settings (BYOK), save it, then retry the run. The run stopped before sandbox execution.";
    case "PROVIDER_MODEL_FAILURE":
      return "Select an available model for the provider in Provider settings, save, then retry the run. The run stopped before sandbox execution.";
    case "PROVIDER_NETWORK_FAILURE":
      return "Check connectivity to the provider endpoint; when reachable, retry the run (bounded automatic backoff applies).";
    case "PROVIDER_CONFIGURATION_FAILURE":
      return "Complete the provider configuration (endpoint/base URL and required settings) in Provider settings, save, then retry the run.";
    case "BUILD_FAILURE":
      return "Apply a concrete correction to the failing build/compiler step, then retry the run. The retried run must pass Builder -> Sandbox -> Validation -> Hash Verification before it can finish.";
    case "VALIDATION_FAILURE":
      return "Correct the schema/fixture/goal mismatch (plan or build output), then retry the run so Builder -> Sandbox -> Validation can re-verify.";
    case "RESEARCH_EVIDENCE_INSUFFICIENT":
      return "Run research escalation with repository context (and optional Tavily Advanced Research) to gather the missing evidence, then re-analyze.";
    case "SANDBOX_EXECUTION_FAILURE":
      return `Analyze the sandbox failure in stage ${stage}; retry only after the recommended correction is actually applied. The corrected run must still pass Builder -> Sandbox -> Validation -> Hash Verification.`;
    case "WORKFLOW_INTERNAL_FAILURE":
    default:
      return "Review the run traces in Task Management, correct the internal condition, and re-run. Automatic retries are not applied for internal failures.";
  }
}

/** Is the collected evidence sufficient for a reliable recommendation? */
const STRUCTURED_SOURCES = new Set([
  "sandbox",
  "sandbox:stderr",
  "build",
  "build:compiler",
  "validation",
  "validation:fixture",
  "validation:goal",
  "hash",
  "provider",
]);

export function isEvidenceSufficient(
  category: FailureCategory,
  evidence: FailureEvidence[],
): boolean {
  const sources = new Set(evidence.map((e) => e.source));
  const structured = [...sources].some((s) => STRUCTURED_SOURCES.has(s));
  if (structured) return true;
  // Provider categories need at least the normalized provider status.
  if (category.startsWith("PROVIDER_")) return sources.has("provider");
  // Bare workflow-echo evidence (stage + message) is NOT sufficient.
  return false;
}

/** User-facing status derived from category + retry + escalation. */
export function statusFor(
  category: FailureCategory,
  retryAllowed: boolean,
  researchEscalated: boolean,
  exhausted: boolean,
): RecoveryStatus {
  if (exhausted) return "MANUAL_REVIEW_REQUIRED";
  if (CONFIG_CATEGORIES.has(category)) return "NEEDS_CONFIGURATION_CHANGE";
  if (researchEscalated) return "ADDITIONAL_RESEARCH_PERFORMED";
  if (retryAllowed) return "READY_TO_RETRY";
  return "MANUAL_REVIEW_REQUIRED";
}

/**
 * Build the sanitized, user-facing root-cause result.
 *
 * The result contains ONLY: category, stage, bounded summary, bounded root
 * cause, evidence ids, recommendation, retryability, confidence, and the
 * research flag. Raw stacks, API keys, internal prompts, full provider
 * responses, and terminal logs never enter this artifact — callers pass
 * already-bounded input and this function re-bounds every string.
 */
export function analyzeRootCause(
  input: RawFailureInput,
  category: FailureCategory,
  evidence: FailureEvidence[],
): RootCauseResult {
  const summary = `${category} at stage ${input.stage}: ${firstSentence(input.message)}`;
  const rootCause = rootCauseFor(category, input);
  const confidence = confidenceFor(category, evidence);
  return {
    category,
    stage: input.stage,
    // Every user-facing string is redacted + single-line + bounded here, so
    // stack dumps / provider response bodies / secrets can never survive.
    summary: bound(oneLine(redactEvidenceText(summary)), 240),
    rootCause: bound(oneLine(redactEvidenceText(rootCause)), 300),
    evidenceIds: evidence.map((e) => e.evidence_id),
    recommendation: recommendationFor(category, input.stage),
    retryable: RETRYABLE_CATEGORIES.has(category),
    confidence,
    needsResearch: !isEvidenceSufficient(category, evidence),
  };
}

/** What the recommendation verifies before a retry may happen. */
export function recheckTargetFor(category: FailureCategory, runId: string): string {
  switch (category) {
    case "PROVIDER_AUTH_FAILURE":
      return "provider credentials";
    case "PROVIDER_MODEL_FAILURE":
      return "provider model configuration";
    case "PROVIDER_NETWORK_FAILURE":
      return "provider connectivity";
    case "PROVIDER_CONFIGURATION_FAILURE":
      return "provider configuration";
    case "BUILD_FAILURE":
      return "build/compiler correction";
    case "VALIDATION_FAILURE":
      return "plan/build correction against schema, fixture, and goal";
    case "RESEARCH_EVIDENCE_INSUFFICIENT":
      return "additional research evidence";
    case "SANDBOX_EXECUTION_FAILURE":
      return "sandbox failure correction";
    default:
      return `run ${runId} internal condition`;
  }
}

function rootCauseFor(category: FailureCategory, input: RawFailureInput): string {
  const sbx = input.sandbox;
  switch (category) {
    case "PROVIDER_AUTH_FAILURE":
      return "The provider rejected or is missing the configured credential (BYOK), so workflow execution was stopped before sandbox execution.";
    case "PROVIDER_MODEL_FAILURE":
      return `The configured model${input.provider?.model ? ` "${input.provider.model}"` : ""} was not accepted by the provider, so workflow execution was stopped before sandbox execution.`;
    case "PROVIDER_NETWORK_FAILURE":
      return "The provider endpoint could not be reached (network-level failure), reported by the normalized provider result.";
    case "PROVIDER_CONFIGURATION_FAILURE":
      return "Required provider configuration is missing or invalid, so the provider could not be bound for execution.";
    case "BUILD_FAILURE":
      return input.build?.compilerLine
        ? `The build/compiler step failed: ${firstSentence(input.build.compilerLine)}`
        : "The build/compiler step failed during execution.";
    case "VALIDATION_FAILURE":
      return validationRootCause(input);
    case "SANDBOX_EXECUTION_FAILURE":
      return sandboxRootCause(input, sbx);
    case "RESEARCH_EVIDENCE_INSUFFICIENT":
      return "Collected failure evidence is insufficient to determine a reliable root cause and recommendation.";
    default:
      return `The workflow failed unexpectedly at stage ${input.stage}: ${firstSentence(input.message)}`;
  }
}

function validationRootCause(input: RawFailureInput): string {
  const v = input.validation;
  const parts: string[] = [];
  if (v?.schemaValid === false) parts.push("schema validation");
  if (v?.failedAssertions?.length) {
    parts.push(`${v.failedAssertions.length} fixture assertion(s)`);
  }
  if (v?.failedCriteria?.length) {
    parts.push(`${v.failedCriteria.length} goal criterion/criteria`);
  }
  const what = parts.length ? parts.join(", ") : "one or more validation checks";
  return `The confirmed package failed ${what}; the plan/build output does not satisfy the researcher contract.`;
}

function sandboxRootCause(
  input: RawFailureInput,
  sbx: RawFailureInput["sandbox"],
): string {
  if (sbx?.timedOut) {
    return "Sandbox execution exceeded its time limit and was terminated.";
  }
  const bad = (sbx?.exitCodes ?? []).find((c) => c !== 0);
  if (bad !== undefined) {
    return `Sandbox execution exited with code ${bad}.`;
  }
  return `Sandbox execution failed at stage ${input.stage}.`;
}

function confidenceFor(
  category: FailureCategory,
  evidence: FailureEvidence[],
): number {
  if (!evidence.length) return 0.3;
  const sources = new Set(evidence.map((e) => e.source));
  const structured = [...sources].some((s) =>
    ["sandbox", "sandbox:stderr", "build", "build:compiler", "validation", "validation:fixture", "validation:goal", "hash", "provider"].includes(s),
  );
  if (structured) return 0.9;
  if (category.startsWith("PROVIDER_")) return 0.7;
  return evidence.length >= 2 ? 0.6 : 0.4;
}

function bound(text: string, max: number): string {
  const t = String(text ?? "");
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

const RETRYABLE_CATEGORIES = new Set<FailureCategory>([
  "PROVIDER_NETWORK_FAILURE",
]);