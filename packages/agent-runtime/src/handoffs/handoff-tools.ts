/**
 * OneShot Multi-Agent Handoff Tools & Cryptographic Gate Verification
 *
 * Implements tool-driven transitions per:
 * https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs
 *
 * Invariants:
 * 1. Strict Message Pairing: Every handoff tool call (AIMessage) is paired with
 *    a ToolMessage with the matching tool_call_id.
 * 2. Human Gates:
 *    - Research Review gate must be approved before entering Planner stage.
 *    - Build Ready gate must be approved and match the confirmed package hash before entering Builder stage.
 * 3. Canonical representation hashing of confirmed_package.core.
 */

import * as crypto from "node:crypto";
import type {
  CanonicalStage,
  ConfirmedPackageCore,
  HandoffAiMessage,
  HandoffMessagePair,
  HandoffPackage,
  HandoffResult,
  HandoffToolMessage,
  HumanGate,
  StageState,
} from "./types.js";

/**
 * Computes canonical SHA-256 hash of confirmed_package.core.
 * Keys are deterministically sorted to ensure repeatable hashing.
 */
export function computeCanonicalCoreHash(core: ConfirmedPackageCore): string {
  const json = JSON.stringify(core, Object.keys(core).sort());
  return crypto.createHash("sha256").update(json, "utf8").digest("hex");
}

/**
 * Creates a valid, paired AIMessage and ToolMessage for a handoff.
 */
export function createHandoffPair(
  targetStage: CanonicalStage,
  toolCallId: string,
  parameters: Record<string, unknown> = {},
  summary?: string
): HandoffMessagePair {
  const toolName = `transfer_to_${targetStage}`;
  const aiMessage: HandoffAiMessage = {
    role: "assistant",
    toolCall: {
      id: toolCallId,
      name: toolName,
      parameters,
    },
  };

  const toolMessage: HandoffToolMessage = {
    role: "tool",
    toolCallId,
    name: toolName,
    content: summary || `Transferred execution to ${targetStage} agent`,
    stageConfirmed: targetStage,
  };

  return { aiMessage, toolMessage };
}

/**
 * Executes a stage handoff while strictly enforcing OneShot human gates and package bounds.
 */
export function executeHandoff(
  currentState: StageState,
  targetStage: CanonicalStage,
  toolCallId: string,
  parameters: Record<string, unknown> = {},
  packageCore?: ConfirmedPackageCore
): HandoffResult {
  const messagePair = createHandoffPair(targetStage, toolCallId, parameters);

  // 1. Gate: Researcher -> Planner requires "research_review" approval
  if (targetStage === "planner") {
    if (!currentState.approvedGates.has("research_review")) {
      return {
        success: false,
        activeStage: currentState.currentStage,
        messagePair,
        pendingGate: "research_review",
        error: "Human Gate Required: 'Research Review' must be approved by the user before transitioning to Planner.",
      };
    }
  }

  // 2. Gate: Evaluation -> Builder requires "build_ready" approval and hash match
  if (targetStage === "builder") {
    if (!currentState.approvedGates.has("build_ready")) {
      return {
        success: false,
        activeStage: currentState.currentStage,
        messagePair,
        pendingGate: "build_ready",
        error: "Human Gate Required: 'Build Ready' authorization must be approved before transitioning to Builder.",
      };
    }

    if (packageCore && currentState.activePackage) {
      const incomingHash = computeCanonicalCoreHash(packageCore);
      if (incomingHash !== currentState.activePackage.coreHash) {
        return {
          success: false,
          activeStage: currentState.currentStage,
          messagePair,
          pendingGate: "build_ready",
          packageHash: incomingHash,
          error: `Cryptographic Mismatch: Incoming package hash '${incomingHash}' does not match confirmed build-ready hash '${currentState.activePackage.coreHash}'.`,
        };
      }
    }
  }

  let finalPackage = currentState.activePackage;
  if (packageCore) {
    const hash = computeCanonicalCoreHash(packageCore);
    finalPackage = {
      core: packageCore,
      coreHash: hash,
    };
  }

  return {
    success: true,
    activeStage: targetStage,
    messagePair,
    packageCore: finalPackage?.core,
    packageHash: finalPackage?.coreHash,
  };
}
