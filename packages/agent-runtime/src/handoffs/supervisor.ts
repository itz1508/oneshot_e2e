/**
 * OneShot Multi-Agent Stage Supervisor
 *
 * Coordinates execution and handoffs between the 7 canonical stages:
 * Researcher -> Planner -> Refactor -> Gap Analysis -> Evaluation -> Builder -> Review
 *
 * Implements context engineering & selective context propagation per:
 * https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs#context-engineering
 *
 * Prunes noisy subagent internals while preserving strictly paired handoff messages
 * and cryptographic package cores.
 */

import {
  computeCanonicalCoreHash,
  executeHandoff,
} from "./handoff-tools.js";
import type {
  CanonicalStage,
  ConfirmedPackageCore,
  HandoffMessagePair,
  HandoffPackage,
  HandoffResult,
  HumanGate,
  StageState,
} from "./types.js";

export class OneShotStageSupervisor {
  private state: StageState;

  constructor(initialStage: CanonicalStage = "researcher") {
    this.state = {
      currentStage: initialStage,
      approvedGates: new Set<HumanGate>(),
      handoffHistory: [],
    };
  }

  getCurrentStage(): CanonicalStage {
    return this.state.currentStage;
  }

  isGateApproved(gate: HumanGate): boolean {
    return this.state.approvedGates.has(gate);
  }

  approveGate(gate: HumanGate): void {
    this.state.approvedGates.add(gate);
  }

  revokeGate(gate: HumanGate): void {
    this.state.approvedGates.delete(gate);
  }

  setPackage(packageCore: ConfirmedPackageCore): HandoffPackage {
    const hash = computeCanonicalCoreHash(packageCore);
    const pkg: HandoffPackage = {
      core: packageCore,
      coreHash: hash,
    };
    this.state.activePackage = pkg;
    return pkg;
  }

  getActivePackage(): HandoffPackage | undefined {
    return this.state.activePackage;
  }

  /**
   * Executes a handoff to the target stage.
   * If a human gate is required and not approved, returns an unapproved result without transitioning.
   */
  handoffTo(
    targetStage: CanonicalStage,
    toolCallId: string,
    parameters: Record<string, unknown> = {},
    packageCore?: ConfirmedPackageCore
  ): HandoffResult {
    const result = executeHandoff(
      this.state,
      targetStage,
      toolCallId,
      parameters,
      packageCore
    );

    if (result.success) {
      this.state.currentStage = targetStage;
      this.state.handoffHistory.push(result.messagePair);
      if (packageCore) {
        this.setPackage(packageCore);
      }
    }

    return result;
  }

  /**
   * Context Engineering: returns pruned conversation context.
   * Only includes high-level handoff pairs and package state, avoiding context bloat
   * and internal subagent trace pollution.
   */
  getPrunedContext(): {
    currentStage: CanonicalStage;
    activePackageCore?: ConfirmedPackageCore;
    packageHash?: string;
    handoffPairs: HandoffMessagePair[];
  } {
    return {
      currentStage: this.state.currentStage,
      activePackageCore: this.state.activePackage?.core,
      packageHash: this.state.activePackage?.coreHash,
      handoffPairs: [...this.state.handoffHistory],
    };
  }
}
