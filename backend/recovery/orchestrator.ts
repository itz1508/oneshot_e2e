import type {
  RawFailureInput,
  RecoveryReport,
  RecoveryResearchRequest,
  RecoveryResearchResult,
  RecoverySnapshot,
  RecoveryState,
} from "./types.js";
import { MAX_RETRY_ATTEMPTS } from "./types.js";
import { collectEvidence } from "./evidence.js";
import { classifyFailure } from "./classifier.js";
import {
  analyzeRootCause,
  isEvidenceSufficient,
  statusFor,
} from "./analysis.js";
import {
  runResearchEscalation,
  type RecoveryResearcher,
  type AdvancedResearchCollector,
} from "./research-escalation.js";
import { evaluateRetryPolicy } from "./policy.js";
import type { ProcessingEventBus } from "../runtime/event-bus.js";
import type { RunRepository } from "../runtime/run-repository.js";

export interface RecoveryOrchestratorDeps {
  runs: RunRepository;
  events: ProcessingEventBus;
  /** Existing Researcher/subagent capability (bounded recovery interface). */
  researcher?: RecoveryResearcher;
  /** Optional Tavily Advanced Research collector (never required). */
  advancedResearch?: AdvancedResearchCollector | null;
  /**
   * Explicit enablement for the optional advanced research pass. When false
   * or undefined the collector is never invoked — Tavily is never required
   * for recovery and an absent/failed collector never fails the cycle.
   */
  advancedResearchEnabled?: boolean;
}

export interface RecoveryCycleOutcome {
  snapshot: RecoverySnapshot;
  report: RecoveryReport;
}

function ev(
  deps: RecoveryOrchestratorDeps,
  runId: string,
  processor: string,
  state: "RUNNING" | "COMPLETE",
  message: string,
  result?: "ROOT_CAUSE",
): void {
  deps.events.emit(runId, processor, state, {
    scope: "SUPPORT",
    ...(result ? { result } : {}),
    message,
  });
}

/** Mutable recovery record attached to the durable run snapshot. */
type RunSnapshotWithRecovery = { recovery?: RecoverySnapshot };

/**
 * Recovery state machine + persistence.
 *
 *   RUNNING -> FAILURE_DETECTED -> ROOT_CAUSE_ANALYSIS
 *     -> (optional, bounded) RESEARCH_ESCALATION -> RECOMMENDATION_READY
 *     -> (optional, policy-gated) RETRYING -> RUNNING
 *   or terminal ROOT_CAUSE.
 *
 * A failed run NEVER becomes DONE because recovery completed; only verified
 * workflow success (Builder -> Sandbox -> Validation -> Hash Verification)
 * transitions a run to PASSED/DONE (WorkflowRuntime.finishPassed).
 */
export class RecoveryOrchestrator {
  constructor(private deps: RecoveryOrchestratorDeps) {}

  /** Current recovery snapshot for a run (undefined before any failure). */
  get(runId: string): RecoverySnapshot | undefined {
    const snap = this.deps.runs.get(runId) as unknown as
      | RunSnapshotWithRecovery
      | undefined;
    return snap?.recovery;
  }

  /**
   * Execute one bounded failure/recovery cycle for a run. The result is
   * persisted inside the durable run snapshot (`recovery` field) so a
   * reconnecting UI can reconstruct failure/recovery state, and mirrored
   * into Task Management as stage events.
   */
  async handleFailure(input: RawFailureInput): Promise<RecoveryCycleOutcome> {
    const deps = this.deps;
    const runId = input.runId;

    // FAILURE_DETECTED
    ev(deps, runId, "FailureDetected", "RUNNING", `Failure detected at stage ${input.stage}`);
    ev(deps, runId, "FailureDetected", "COMPLETE", `Failure detected at stage ${input.stage}`, "ROOT_CAUSE");

    // ROOT_CAUSE_ANALYSIS — initial evidence pass
    ev(deps, runId, "RootCauseAnalysis", "RUNNING", "Collecting failure evidence");
    const evidence = collectEvidence(input);
    const category = classifyFailure(input);
    let result = analyzeRootCause(input, category, evidence);
    ev(deps, runId, "RootCauseAnalysis", "COMPLETE", `Classified as ${category}`);

    // Optional bounded RESEARCH_ESCALATION (max one per failure cycle).
    let researchResults: RecoveryResearchResult[] = [];
    if (!isEvidenceSufficient(category, evidence) && deps.researcher) {
      ev(deps, runId, "ResearchEscalation", "RUNNING", `Evidence insufficient for ${category}; escalating to recovery researcher`);
      const request: RecoveryResearchRequest = {
        failureCategory: category,
        failedStage: input.stage,
        summary: result.summary,
        evidence,
        requestedQuestion: "",
      };
      const research = await runResearchEscalation(
        { request, existing: result },
        {
          researcher: deps.researcher,
          advanced:
            deps.advancedResearchEnabled && deps.advancedResearch
              ? deps.advancedResearch
              : null,
          events: deps.events,
          runId,
        },
      );
      researchResults = [research];
      // Merge new evidence with the original failure evidence and rerun the
      // root-cause analysis ONCE (bounded; no infinite research loops).
      const merged = [...evidence, ...research.additionalEvidence];
      result = {
        ...analyzeRootCause(input, category, merged),
        recommendation: recommendWith(research, input.stage),
        needsResearch: false,
      };
    }

    // RECOMMENDATION_READY — the recovery cycle always terminates here (or at
    // ROOT_CAUSE semantically: the run itself stays ROOT_CAUSE; DONE comes
    // only from verified workflow success).
    const retry = evaluateRetryPolicy({ category, attempts: 0, input, evidence });
    const state: RecoveryState = "RECOMMENDATION_READY";

    const snapshot: RecoverySnapshot = {
      run_id: runId,
      state,
      failure_category: category,
      failed_stage: input.stage,
      result,
      evidence,
      retry: {
        allowed: retry.approved,
        attempts: 0,
        max_attempts: MAX_RETRY_ATTEMPTS,
        policy_reason: retry.reason,
      },
      research_escalations: researchResults,
      updated_at: new Date().toISOString(),
      provider: input.provider ?? null,
    };
    this.persist(snapshot);
    ev(deps, runId, "Recommendation", "COMPLETE", result.recommendation);

    const status = statusFor(
      category,
      retry.approved,
      researchResults.length > 0,
      false,
    );
    const report = this.reportFor(snapshot, status);
    return { snapshot, report };
  }

  /**
   * Retry gate — every retry passes through here. Retries without policy
   * approval are refused and recorded; they never bypass the recommendation
   * or the canonical verification loop.
   */
  approveRetry(runId: string, reason: string): boolean {
    const snap = this.get(runId);
    if (!snap) return false;
    const attempts = snap.retry.attempts + 1;
    const decision = evaluateRetryPolicy({
      category: snap.failure_category,
      attempts,
      correctionApplied:
        reason.includes("correction applied") ||
        reason.includes("config changed"),
      // Policy approval recorded when the failure was classified (e.g. a
      // retryable PROVIDER_NETWORK_FAILURE) authorizes bounded retries.
      userApproved: snap.retry.allowed,
    });
    if (!decision.approved) {
      // Record the refusal reason so the UI/report reflects why the retry was
      // blocked (e.g. the bounded ceiling, or missing corrective approval).
      snap.retry = {
        ...snap.retry,
        policy_reason: decision.reason,
      };
      this.persist(snap);
      this.deps.events.emit(runId, "Retry", "RUNNING", {
        scope: "SUPPORT",
        message: `Retry refused: ${decision.reason}`,
      });
      return false;
    }
    snap.retry = { ...snap.retry, attempts };
    snap.state = "RETRYING";
    snap.updated_at = new Date().toISOString();
    this.persist(snap);
    this.deps.events.emit(runId, "Retry", "RUNNING", {
      scope: "SUPPORT",
      message: `Retry approved (${attempts}/${snap.retry.max_attempts}): ${decision.reason}`,
    });
    return true;
  }

  /** Mark an approved retry as started (run re-enters RUNNING). */
  markRetrying(runId: string): void {
    const snap = this.get(runId);
    if (!snap) return;
    snap.state = "RUNNING";
    snap.updated_at = new Date().toISOString();
    this.persist(snap);
    this.deps.events.emit(runId, "Retry", "COMPLETE", {
      scope: "SUPPORT",
      message: "Retry started; canonical workflow re-execution begins",
    });
  }

  /** Clear recovery state after a VERIFIED PASSED run (RUNNING -> DONE). */
  clearOnSuccess(runId: string): void {
    const snap = this.get(runId);
    if (!snap) return;
    snap.state = "DONE";
    snap.updated_at = new Date().toISOString();
    this.persist(snap);
  }

  /** User-facing report — the ONLY recovery shape shown in the main UI. */
  reportFor(
    snap: RecoverySnapshot,
    status: RecoveryReport["status"],
  ): RecoveryReport {
    return {
      run_id: snap.run_id,
      status,
      what_failed: `${snap.failed_stage} (${snap.failure_category})`,
      why: snap.result.rootCause,
      recommended_fix: snap.result.recommendation,
      retry: {
        allowed: snap.retry.allowed,
        attempts: snap.retry.attempts,
        max_attempts: snap.retry.max_attempts,
        policy_reason: snap.retry.policy_reason,
      },
      research: { escalated: snap.research_escalations.length > 0 },
      state: snap.state,
    };
  }

  /** Persist the recovery snapshot inside the durable run snapshot. */
  private persist(snap: RecoverySnapshot): void {
    this.deps.runs.update(snap.run_id, (current) => {
      (current as unknown as RunSnapshotWithRecovery).recovery = snap;
    });
  }
}

/**
 * Merge research findings into the actionable recommendation. The researcher
 * proposes; the recommendation still requires the canonical verification
 * loop (Builder -> Sandbox -> Validation -> Hash) before any success.
 */
function recommendWith(
  research: RecoveryResearchResult,
  stage: string,
): string {
  const base =
    `Based on ${research.sources.join("+") || "local"} research: ` +
    (research.findings || "no additional findings").slice(0, 240);
  return `${base}. Verify this correction, then retry stage ${stage} so Builder -> Sandbox -> Validation re-verify the result.`;
}