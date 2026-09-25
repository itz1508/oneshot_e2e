/**
 * OneShot Canonical Workflow Engine
 *
 * Implements the Research → Design_Planning boundary only:
 *   research → planning   (Gate 1: Research Review)
 *
 * Invariants Enforced:
 * 1. Gate 1 (Research Review): Must be CONFIRMED by human before Planning.
 * 2. Planning is TERMINAL for this engine. It must not advance into the execution
 *    lifecycle — that belongs to the separate `ImplementationRuntime`, which
 *    requires a user-approved plan (ARCHITECTURE.MD §1.4).
 */

import crypto from "node:crypto";
import type {
  HumanGateState,
  StageTodo,
  WorkflowStage,
  WorkflowStageInfo,
  WorkflowTransitionResult,
} from "./types.js";

/**
 * Stages owned by the separate implementation runtime. This engine must never
 * transition into them, because doing so is what previously let planning reach
 * the execution lifecycle.
 */
export const EXECUTION_STAGES: WorkflowStage[] = [
  "gap_analysis",
  "evaluation",
  "builder",
];

export class OneShotWorkflowEngine {
  private currentStage: WorkflowStage = "research";
  private gate1: HumanGateState = {
    gateId: "gate_1_research_review",
    name: "Gate 1: Research Review",
    status: "PENDING_APPROVAL",
  };
  private gate2: HumanGateState = {
    gateId: "gate_2_build_ready",
    name: "Gate 2: Build Ready",
    status: "PENDING_APPROVAL",
  };

  private stages: Map<WorkflowStage, WorkflowStageInfo> = new Map([
    [
      "research",
      {
        stage: "research",
        name: "Research & Explore",
        status: "active",
        todos: [
          { id: "r1", text: "Index official product & API requirements", state: "done" },
          { id: "r2", text: "Execute in-chat and standalone research searches", state: "active" },
          { id: "r3", text: "Draft initial proposal for Gate 1 human review", state: "wait" },
        ],
      },
    ],
    [
      "planning",
      {
        stage: "planning",
        name: "Plan Architecture",
        status: "waiting",
        todos: [
          { id: "p1", text: "Validate schema contracts and module boundaries", state: "wait" },
          { id: "p2", text: "Generate atomic change package with core hash", state: "wait" },
        ],
      },
    ],
    [
      "gap_analysis",
      {
        stage: "gap_analysis",
        name: "Gap Analysis & Invariants Reconciliation",
        status: "waiting",
        todos: [
          { id: "g1", text: "Reconcile active code against design specifications", state: "wait" },
          { id: "g2", text: "Verify sandbox path security policy", state: "wait" },
        ],
      },
    ],
    [
      "evaluation",
      {
        stage: "evaluation",
        name: "Evaluation & Test Verification",
        status: "waiting",
        todos: [
          { id: "e1", text: "Run automated contract and unit tests", state: "wait" },
          { id: "e2", text: "Validate end-to-end browser scenarios", state: "wait" },
        ],
      },
    ],
    [
      "builder",
      {
        stage: "builder",
        name: "Builder & Output Packaging",
        status: "waiting",
        todos: [
          { id: "b1", text: "Verify Gate 2 hash-bound package authorization", state: "wait" },
          { id: "b2", text: "Compile production bundle", state: "wait" },
        ],
      },
    ],
  ]);

  getCurrentStage(): WorkflowStage {
    return this.currentStage;
  }

  getStageInfo(stage: WorkflowStage): WorkflowStageInfo | undefined {
    return this.stages.get(stage);
  }

  getAllStages(): WorkflowStageInfo[] {
    return Array.from(this.stages.values());
  }

  getGate1(): HumanGateState {
    return { ...this.gate1 };
  }

  getGate2(): HumanGateState {
    return { ...this.gate2 };
  }

  /**
   * Confirms Gate 1 (Research Review).
   * Unblocks transition to the Planning stage.
   */
  confirmGate1(confirmedBy: string = "user"): HumanGateState {
    this.gate1.status = "CONFIRMED";
    this.gate1.confirmedAt = new Date().toISOString();
    this.gate1.confirmedBy = confirmedBy;
    return { ...this.gate1 };
  }

  /**
   * Confirms Gate 2 (Build Ready).
   * Generates and binds the canonical SHA-256 package hash required before Builder execution.
   */
  confirmGate2(packageCore: Record<string, unknown>, confirmedBy: string = "user"): HumanGateState {
    const canonicalJson = JSON.stringify(packageCore, Object.keys(packageCore).sort());
    const hash = crypto.createHash("sha256").update(canonicalJson).digest("hex");

    this.gate2.status = "CONFIRMED";
    this.gate2.confirmedAt = new Date().toISOString();
    this.gate2.confirmedBy = confirmedBy;
    this.gate2.packageHash = `sha256:${hash}`;
    return { ...this.gate2 };
  }

  /**
   * Attempts to transition to the next research/planning stage.
   *
   * Invariant: this engine owns Research → Design_Planning ONLY. It must not walk
   * planning into the execution lifecycle (ARCHITECTURE.MD §1.4). Execution is
   * owned by the separate `ImplementationRuntime`, which cannot be constructed
   * without a user-approved plan.
   *
   * Invariant 1: Gate 1 (Research Review) must be CONFIRMED before Planning.
   */
  transitionTo(targetStage: WorkflowStage): WorkflowTransitionResult {
    const fromStage = this.currentStage;

    // Boundary: execution stages do not belong to this engine.
    if (EXECUTION_STAGES.includes(targetStage)) {
      return {
        success: false,
        fromStage,
        toStage: targetStage,
        error:
          "Execution stage is owned by the separate implementation runtime. Design_Planning must end at APPROVED_PLAN, and the ImplementationRuntime must be constructed from that approved plan.",
      };
    }

    // Invariant: Transition from research to planning requires Gate 1 approval
    if (targetStage === "planning" && this.gate1.status !== "CONFIRMED") {
      return {
        success: false,
        fromStage,
        toStage: targetStage,
        error: "Gate 1 (Research Review) invariant violation: Human approval required before Planner stage.",
        gateRequired: this.gate1,
      };
    }

    // Planning is terminal for this engine. Nothing advances past it here.
    if (fromStage === "planning" && targetStage !== "planning") {
      return {
        success: false,
        fromStage,
        toStage: targetStage,
        error:
          "Design_Planning is the terminal stage of this engine. Hand off to the implementation runtime with an Approved Plan.",
      };
    }

    // Mark previous stage completed
    const prevInfo = this.stages.get(fromStage);
    if (prevInfo) prevInfo.status = "completed";

    // Mark target stage active
    const nextInfo = this.stages.get(targetStage);
    if (nextInfo) nextInfo.status = "active";

    this.currentStage = targetStage;
    return {
      success: true,
      fromStage,
      toStage: targetStage,
    };
  }

  /**
   * Updates state of a stage todo item.
   */
  updateTodoState(stage: WorkflowStage, todoId: string, state: StageTodo["state"]): boolean {
    const info = this.stages.get(stage);
    if (!info) return false;
    const todo = info.todos.find((t) => t.id === todoId);
    if (!todo) return false;
    todo.state = state;
    return true;
  }
}
