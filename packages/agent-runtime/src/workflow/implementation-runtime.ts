/**
 * OneShot Implementation Runtime
 *
 * The execution lifecycle is a SEPARATE owner from Research and Design_Planning
 * (ARCHITECTURE.MD §1.4). It consumes an Approved Plan and is never reachable by
 * simply advancing a planning stage.
 *
 *   IMPLEMENTATION → GAP_DISCOVERY → GAP_RESOLUTION → VERIFICATION
 *                  → RECEIPT → PROMOTION → CLOSED
 *
 * Two boundaries are enforced by construction:
 *
 *  1. This runtime cannot be constructed without an Approved Plan. Design_Planning
 *     must end at APPROVED_PLAN before implementation can exist at all.
 *  2. It advances one phase at a time and refuses skips, reversals, and unevidenced
 *     receipts — so it can never claim work it did not do.
 */

import type { ApprovedPlan } from "./types.js";

export type ImplementationPhase =
  | "IMPLEMENTATION"
  | "GAP_DISCOVERY"
  | "GAP_RESOLUTION"
  | "VERIFICATION"
  | "RECEIPT"
  | "PROMOTION"
  | "CLOSED";

export const IMPLEMENTATION_PHASE_ORDER: ImplementationPhase[] = [
  "IMPLEMENTATION",
  "GAP_DISCOVERY",
  "GAP_RESOLUTION",
  "VERIFICATION",
  "RECEIPT",
  "PROMOTION",
  "CLOSED",
];

/** Terminal phase. Approval and promotion are never simulated by planning. */
export const IMPLEMENTATION_STOP_PHASE: ImplementationPhase = "CLOSED";

/**
 * Phases that record completed, evidenced work. Reaching one without proof is a
 * claim, not a result — so each must be backed by evidence. This is the same
 * rule the repository applies to validation: no PASS without proof.
 */
const EVIDENCE_REQUIRED: ImplementationPhase[] = [
  "GAP_RESOLUTION",
  "VERIFICATION",
  "RECEIPT",
  "PROMOTION",
  "CLOSED",
];

export interface ImplementationReceipt {
  phase: ImplementationPhase;
  recordedAt: number;
  evidence: Record<string, unknown>;
}

export interface ImplementationRuntimeState {
  phase: ImplementationPhase;
  approvedPlanId: string;
  approvedPlanAuditId?: string;
  startedAt: number;
  receipts: ImplementationReceipt[];
}

export interface ImplementationTransitionResult {
  success: boolean;
  fromPhase: ImplementationPhase;
  toPhase: ImplementationPhase;
  error?: string;
  /** True only when the phase actually executed. Planning never sets this. */
  executed: boolean;
}

export class ImplementationRuntime {
  private state: ImplementationRuntimeState;
  private readonly approvedPlan: ApprovedPlan;

  /**
   * @throws when no approved plan is supplied. This is the handoff boundary: the
   * execution lifecycle cannot begin without a user-approved plan.
   */
  constructor(approvedPlan: ApprovedPlan) {
    if (!approvedPlan || typeof approvedPlan !== "object") {
      throw new Error(
        "ImplementationRuntime requires an ApprovedPlan. Design_Planning must end at APPROVED_PLAN before implementation may begin."
      );
    }
    if (!approvedPlan.planId) {
      throw new Error("ApprovedPlan is missing planId; refusing to start the execution lifecycle.");
    }

    this.approvedPlan = approvedPlan;
    this.state = {
      phase: "IMPLEMENTATION",
      approvedPlanId: approvedPlan.planId,
      approvedPlanAuditId: approvedPlan.auditId,
      startedAt: Date.now(),
      receipts: [],
    };
  }

  getPhase(): ImplementationPhase {
    return this.state.phase;
  }

  getState(): ImplementationRuntimeState {
    return { ...this.state, receipts: [...this.state.receipts] };
  }

  /** The plan is consumed, never rewritten. */
  getApprovedPlan(): ApprovedPlan {
    return this.approvedPlan;
  }

  canAdvanceTo(toPhase: ImplementationPhase): boolean {
    return (
      IMPLEMENTATION_PHASE_ORDER.indexOf(toPhase) ===
      IMPLEMENTATION_PHASE_ORDER.indexOf(this.state.phase) + 1
    );
  }

  /** Advances exactly one phase. Skips, reversals, and unevidenced receipts fail. */
  advance(
    toPhase: ImplementationPhase,
    evidence: Record<string, unknown> = {}
  ): ImplementationTransitionResult {
    const fromPhase = this.state.phase;

    if (fromPhase === IMPLEMENTATION_STOP_PHASE) {
      return {
        success: false,
        fromPhase,
        toPhase,
        error: "Implementation runtime is CLOSED; no further phases exist.",
        executed: false,
      };
    }

    if (!this.canAdvanceTo(toPhase)) {
      return {
        success: false,
        fromPhase,
        toPhase,
        error: `Illegal implementation transition ${fromPhase} → ${toPhase}. Phases advance one at a time and cannot be skipped or reversed.`,
        executed: false,
      };
    }

    if (EVIDENCE_REQUIRED.includes(toPhase) && Object.keys(evidence).length === 0) {
      return {
        success: false,
        fromPhase,
        toPhase,
        error: `Phase ${toPhase} requires evidence. A receipt or promotion without proof is never recorded.`,
        executed: false,
      };
    }

    this.state.receipts.push({ phase: toPhase, recordedAt: Date.now(), evidence });
    this.state.phase = toPhase;
    return { success: true, fromPhase, toPhase, executed: true };
  }

  isFinished(): boolean {
    return this.state.phase === IMPLEMENTATION_STOP_PHASE;
  }
}

/** Planning may not claim the execution lifecycle. */
export function designPlanningMayClaimImplementation(
  action: "emit_plan" | "claim_implementation" | "claim_receipt" | "claim_promotion" | "claim_closed"
): boolean {
  return action === "emit_plan";
}

/** Research may never enter the execution lifecycle. It stops at the handoff. */
export function researchMayEnterImplementation(): boolean {
  return false;
}
