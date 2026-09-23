/**
 * OneShot Multi-Agent Handoffs Types & Contracts
 *
 * Implements the LangChain Multi-Agent Handoff pattern per:
 * https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs
 *
 * Reconciled with OneShot's 7 canonical stages and human gates:
 * - 7 Canonical Stages: Researcher, Planner, Refactor, Gap Analysis, Evaluation, Builder, Review
 * - Human Gates: Research Review (before Planner) and Build Ready (before Builder)
 * - Cryptographic hash check on confirmed_package.core
 */

export type CanonicalStage =
  | "researcher"
  | "planner"
  | "refactor"
  | "gap_analysis"
  | "evaluation"
  | "builder"
  | "review";

export type HumanGate = "research_review" | "build_ready";

export interface HandoffAiMessage {
  role: "assistant";
  content?: string;
  toolCall: {
    id: string;
    name: string;
    parameters: Record<string, unknown>;
  };
}

export interface HandoffToolMessage {
  role: "tool";
  toolCallId: string;
  name: string;
  content: string;
  stageConfirmed: CanonicalStage;
}

export interface HandoffMessagePair {
  aiMessage: HandoffAiMessage;
  toolMessage: HandoffToolMessage;
}

export interface ConfirmedPackageCore {
  planId: string;
  stage: CanonicalStage;
  objectives: string[];
  tasks: Array<{ id: string; description: string; status: string }>;
  version: number;
}

export interface HandoffPackage {
  core: ConfirmedPackageCore;
  coreHash: string;
  metadata?: Record<string, unknown>;
}

export interface StageState {
  currentStage: CanonicalStage;
  approvedGates: Set<HumanGate>;
  activePackage?: HandoffPackage;
  handoffHistory: HandoffMessagePair[];
}

export interface HandoffResult {
  success: boolean;
  activeStage: CanonicalStage;
  messagePair: HandoffMessagePair;
  pendingGate?: HumanGate;
  packageCore?: ConfirmedPackageCore;
  packageHash?: string;
  error?: string;
}
