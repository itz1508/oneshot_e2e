import type { ProcessingEvent, ProcessingState, ValidationResult, WorkflowResult } from "../contract/types.js";

export type GraphNodeState = "PENDING" | "RUNNING" | "COMPLETE";

export interface WorkflowGraphNode {
  id: string;
  label: string;
  kind:
    | "boundary"
    | "generator"
    | "agent"
    | "validator"
    | "join"
    | "gate"
    | "proof"
    | "sandbox"
    | "terminal";
  state: GraphNodeState;
  result?: WorkflowResult | ValidationResult;
  artifactId?: string;
  message?: string;
}

export interface WorkflowGraphEdge {
  from: string;
  to: string;
  condition?: string;
  description?: string;
}

/**
 * Static node topology for the Google ADK 2.0 OneShot Workflow Graph.
 *
 * Authority: workflow/WorkflowGraph_corrected_optimized.txt & CANONICAL_WORKFLOW.md
 */
const CANONICAL_WORKFLOW_NODES: Array<Omit<WorkflowGraphNode, "state" | "message" | "result" | "artifactId">> = [
  { id: "user-intent", label: "User / Intent Collection", kind: "boundary" },
  { id: "generator-prompt", label: "Generator (Prompt_id)", kind: "generator" },
  { id: "researcher", label: "Researcher (plan_id, *_id)", kind: "agent" },
  { id: "planner", label: "Planner (audit_id)", kind: "agent" },
  { id: "refactor", label: "Refactor (same plan_id)", kind: "agent" },
  { id: "gap-analysis", label: "Gap Analysis (gap_0)", kind: "agent" },
  { id: "evaluation", label: "Evaluation (9-point matrix)", kind: "validator" },
  { id: "schema-validation", label: "Schema Validation", kind: "validator" },
  { id: "fixture-validation", label: "Fixture Validation", kind: "validator" },
  { id: "goal-validation", label: "Goal Validation", kind: "validator" },
  { id: "triple-join", label: "Triple Validation JoinNode", kind: "join" },
  { id: "triple-gate", label: "Triple Validation Gate (all_valid)", kind: "gate" },
  { id: "confirmed", label: "Confirmed (confirmed_package.core)", kind: "gate" },
  { id: "create-hash", label: "Create Hash (RFC 8785 + SHA-256)", kind: "proof" },
  { id: "promote", label: "Promote (Researcher FINAL)", kind: "gate" },
  { id: "builder", label: "Builder / Sandbox Execution", kind: "sandbox" },
  { id: "recompute-hash", label: "Recompute Hash Proof", kind: "proof" },
  { id: "hash-verification", label: "Hash Verification (equal: true)", kind: "proof" },
  { id: "done", label: "Done (PASSED)", kind: "terminal" },
];

/**
 * Static edge definitions representing execution order and fan-out/fan-in barriers.
 */
export const WORKFLOW_GRAPH_EDGES: WorkflowGraphEdge[] = [
  { from: "user-intent", to: "generator-prompt", description: "intent:id finalized" },
  { from: "generator-prompt", to: "researcher", description: "Prompt_id bound to Job_id" },
  { from: "researcher", to: "planner", description: "Researcher(id) + plan_id" },
  { from: "planner", to: "refactor", description: "audit_id findings" },
  { from: "refactor", to: "gap-analysis", description: "same plan_id preserved" },
  { from: "gap-analysis", to: "evaluation", description: "gap_0 verified" },
  { from: "evaluation", to: "schema-validation", condition: "PASSED", description: "Triple Validation Fan-Out" },
  { from: "evaluation", to: "fixture-validation", condition: "PASSED", description: "Triple Validation Fan-Out" },
  { from: "evaluation", to: "goal-validation", condition: "PASSED", description: "Triple Validation Fan-Out" },
  { from: "schema-validation", to: "triple-join", description: "VALID | NOT_VALID" },
  { from: "fixture-validation", to: "triple-join", description: "VALID | NOT_VALID" },
  { from: "goal-validation", to: "triple-join", description: "VALID | NOT_VALID" },
  { from: "triple-join", to: "triple-gate", description: "Join barrier resolved" },
  { from: "triple-gate", to: "confirmed", condition: "all_valid == true", description: "confirmed_package.core" },
  { from: "confirmed", to: "create-hash", description: "immutable package handoff" },
  { from: "create-hash", to: "promote", description: "created_hash attached" },
  { from: "promote", to: "builder", description: "Job confirmed" },
  { from: "builder", to: "recompute-hash", description: "sandbox evidence collected" },
  { from: "recompute-hash", to: "hash-verification", description: "recomputed_hash generated" },
  { from: "hash-verification", to: "done", condition: "created_hash == recomputed_hash", description: "proof verified" },
];

/** Mapping from runtime processor names to graph node IDs */
const PROCESSOR_TO_NODE_ID: Record<string, string> = {
  Intent: "user-intent",
  Prompt: "generator-prompt",
  Researcher: "researcher",
  Planner: "planner",
  Refactor: "refactor",
  GapAnalysis: "gap-analysis",
  Evaluation: "evaluation",
  SchemaValidation: "schema-validation",
  FixtureValidation: "fixture-validation",
  GoalValidation: "goal-validation",
  TripleValidation: "triple-gate",
  Confirmed: "confirmed",
  CreateHash: "create-hash",
  Promote: "promote",
  Builder: "builder",
  Sandbox: "builder",
  RecomputeHash: "recompute-hash",
  Hash: "hash-verification",
  Done: "done",
};

/**
 * Project the Google ADK 2.0 OneShot Workflow Graph from real runtime events.
 *
 * Driven directly by monotonic Task Management events.
 */
export function projectWorkflowGraph(events: ProcessingEvent[] = []) {
  const latestByProcessor = new Map<string, ProcessingEvent>();
  for (const e of events) {
    latestByProcessor.set(e.processor, e);
  }

  const nodes: WorkflowGraphNode[] = CANONICAL_WORKFLOW_NODES.map((def) => {
    // Find matching runtime event if available
    let matchingEvent: ProcessingEvent | undefined;
    for (const [proc, ev] of latestByProcessor.entries()) {
      if (PROCESSOR_TO_NODE_ID[proc] === def.id) {
        matchingEvent = ev;
        break;
      }
    }

    // Default to PENDING unless matched
    let state: GraphNodeState = "PENDING";
    if (matchingEvent) {
      state = matchingEvent.state as GraphNodeState;
    }

    // Special join node follows fan-in completion
    if (def.id === "triple-join") {
      const s = latestByProcessor.get("SchemaValidation")?.state;
      const f = latestByProcessor.get("FixtureValidation")?.state;
      const g = latestByProcessor.get("GoalValidation")?.state;
      if (s === "COMPLETE" && f === "COMPLETE" && g === "COMPLETE") {
        state = "COMPLETE";
      } else if (s === "RUNNING" || f === "RUNNING" || g === "RUNNING") {
        state = "RUNNING";
      }
    }

    return {
      ...def,
      state,
      result: matchingEvent?.result,
      artifactId: matchingEvent?.artifact_id,
      message: matchingEvent?.message,
    };
  });

  return {
    graph_id: "oneshot-adk-workflow-v2",
    title: "OneShot Google ADK 2.0 Workflow Graph",
    specification: "workflow/WorkflowGraph_corrected_optimized.txt",
    authority: "OneShot Workflow_Tree & CANONICAL_WORKFLOW.md",
    engine: "@google/adk",
    fan_in_barrier: "JoinNode",
    triple_validation: {
      schema: "SchemaValidation",
      fixture: "FixtureValidation",
      goal: "GoalValidation",
      barrier: "triple-join",
      gate: "triple-gate",
    },
    nodes,
    edges: WORKFLOW_GRAPH_EDGES,
  };
}
