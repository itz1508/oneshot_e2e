/**
 * OneShot Frontend Multi-Agent Handoffs Model
 *
 * Implements frontend projection of the LangChain Multi-Agent Handoff architecture per:
 * https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs
 *
 * Enforces OneShot's 7 Canonical Stages & Human Gates:
 * 1. Researcher -> Gate 1: Research Review
 * 2. Planner
 * 3. Refactor
 * 4. Gap Analysis
 * 5. Evaluation -> Gate 2: Build Ready (with canonical hash)
 * 6. Builder
 * 7. Review
 */

export type CanonicalStageId =
  | "researcher"
  | "planner"
  | "refactor"
  | "gap_analysis"
  | "evaluation"
  | "builder"
  | "review";

export interface StageDefinition {
  id: CanonicalStageId;
  label: string;
  order: number;
  agentName: string;
  description: string;
  requiredGateBefore?: "Research Review" | "Build Ready";
  requiresPackageHash?: boolean;
}

export const CANONICAL_STAGES: StageDefinition[] = [
  {
    id: "researcher",
    label: "Researcher",
    order: 1,
    agentName: "Researcher Agent",
    description: "Inspects code, queries knowledge items, and gathers facts without mutating files.",
  },
  {
    id: "planner",
    label: "Planner",
    order: 2,
    agentName: "Planner Agent",
    description: "Synthesizes research findings into an actionable, structured implementation plan.",
    requiredGateBefore: "Research Review",
  },
  {
    id: "refactor",
    label: "Refactor",
    order: 3,
    agentName: "Refactor Agent",
    description: "Calculates required architectural modifications preserving system invariants.",
  },
  {
    id: "gap_analysis",
    label: "Gap Analysis",
    order: 4,
    agentName: "Gap Analysis Agent",
    description: "Cross-references proposed changes against existing specifications and tests.",
  },
  {
    id: "evaluation",
    label: "Evaluation",
    order: 5,
    agentName: "Evaluation Agent",
    description: "Prepares canonical confirmed_package.core and calculates cryptographic SHA-256 hash.",
  },
  {
    id: "builder",
    label: "Builder",
    order: 6,
    agentName: "Builder Agent",
    description: "Executes verified code mutations strictly bound to authorized package hash.",
    requiredGateBefore: "Build Ready",
    requiresPackageHash: true,
  },
  {
    id: "review",
    label: "Review",
    order: 7,
    agentName: "Review Agent",
    description: "Final verification, test suite execution, and client delivery walkthrough.",
  },
];

export interface ClientHandoffEvent {
  fromStage: CanonicalStageId;
  toStage: CanonicalStageId;
  toolCallId: string;
  timestamp: string;
  summary: string;
  requiresGateApproval?: "Research Review" | "Build Ready";
  isGateApproved?: boolean;
  packageHash?: string;
}
