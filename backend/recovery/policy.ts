import type {
  FailureCategory,
  FailureEvidence,
  RawFailureInput,
  RetryDecision,
} from "./types.js";
import { MAX_RETRY_ATTEMPTS } from "./types.js";

/**
 * Retry policy — the gate EVERY retry must pass. No failure is retried
 * implicitly: approval requires an explicit corrective action signal
 * (config change / code change / provider retryability), and even then the
 * bounded attempt ceiling applies.
 */
export function evaluateRetryPolicy(args: {
  category: FailureCategory;
  attempts: number;
  maxAttempts?: number;
  /** Evidence that a concrete correction was applied (config/code/artifact). */
  correctionApplied?: boolean;
  /** Explicit user/operator approval to retry now. */
  userApproved?: boolean;
  input?: RawFailureInput;
  evidence?: FailureEvidence[];
}): RetryDecision {
  const {
    category,
    attempts,
    correctionApplied = false,
    userApproved = false,
    input,
  } = args;
  const maxAttempts = args.maxAttempts ?? MAX_RETRY_ATTEMPTS;

  // attempts is the count AFTER this approval; max_attempts retries allowed.
  if (attempts > maxAttempts) {
    return {
      approved: false,
      reason: `Bounded retry ceiling reached (${attempts - 1}/${maxAttempts}); manual review required`,
    };
  }

  // Explicit provider retryability (from the normalized provider result).
  if (input?.providerStatus?.retryable === true) {
    return {
      approved: true,
      reason: `Provider failure is retryable per the normalized provider result (${category})`,
    };
  }

  // A concrete corrective action was applied (configuration/code/artifact).
  if (correctionApplied) {
    return {
      approved: true,
      reason: `Concrete correction applied for ${category}; verification retry allowed`,
    };
  }

  // Explicit operator approval (e.g. after manual inspection).
  if (userApproved) {
    return {
      approved: true,
      reason: `Explicit approval granted for ${category}`,
    };
  }

  switch (category) {
    case "PROVIDER_AUTH_FAILURE":
      return {
        approved: false,
        reason: "Auth failure: do not retry until the credential/config is changed",
      };
    case "PROVIDER_MODEL_FAILURE":
      return {
        approved: false,
        reason: "Model failure: do not retry until the model/config is changed",
      };
    case "PROVIDER_CONFIGURATION_FAILURE":
      return {
        approved: false,
        reason: "Configuration failure: complete the provider configuration before retrying",
      };
    case "BUILD_FAILURE":
      return {
        approved: false,
        reason: "Build failure: retry only after a concrete fix/change is applied",
      };
    case "VALIDATION_FAILURE":
      return {
        approved: false,
        reason: "Validation failure: retry only after the relevant artifact/plan/build correction",
      };
    case "SANDBOX_EXECUTION_FAILURE":
      return {
        approved: false,
        reason: "Sandbox failure: analyze first; retry only if the recommendation results in an actual correction",
      };
    case "WORKFLOW_INTERNAL_FAILURE":
      return {
        approved: false,
        reason: "Internal failure: do not loop automatically; inspect and re-run manually",
      };
    case "PROVIDER_NETWORK_FAILURE":
      return {
        approved: false,
        reason: "Network failure: retryability must come from the normalized provider result (bounded backoff)",
      };
    default:
      return {
        approved: false,
        reason: `No policy approval for ${category}`,
      };
  }
}

/**
 * Bounded backoff schedule for network-provider retries (deterministic,
 * test-visible; callers may sleep on it). Bounded = at most maxAttempts-1
 * delays, each strictly increasing.
 */
export function backoffDelayMs(attempt: number): number {
  if (attempt <= 0) return 0;
  return Math.min(1_000 * 2 ** (attempt - 1), 8_000);
}

/** Evidence source that proves a correction was applied. */
export function hasCorrectionEvidence(evidence: FailureEvidence[]): boolean {
  return evidence.some((e) => e.source === "config" || e.source === "correction");
}