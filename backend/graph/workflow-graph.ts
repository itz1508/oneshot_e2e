/**
 * Google ADK 2.0 Graph Topology & Event Projection
 *
 * Authority:
 * - https://adk.dev/graphs/
 * - https://adk.dev/graphs/routes/
 * - workflow/WorkflowGraph_corrected_optimized.txt
 * - CANONICAL_WORKFLOW.md
 */

import type { ProcessingEvent, ValidationResult, WorkflowResult } from "../contract/types.js";

export type GraphNodeState = "PENDING" | "RUNNING" | "COMPLETE";

export interface WorkflowGraphNode {
  id: string;
  label: string;
  kind:
    | "boundary"
    | "generator"
    | "agent"
    | "router"
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
  input?: string;
  output?: string;
}

export interface WorkflowGraphEdge {
  from: string;
  to: string;
  condition?: string;
  description?: string;
  isBackEdge?: boolean;
}

/**
 * Real Google ADK 2.0 Graph Node Topology with explicit routers, fan-out, JoinNode barrier, and back-edge.
 */
export const CANONICAL_ADK_NODES: Array<Omit<WorkflowGraphNode, "state" | "message" | "result" | "artifactId">> = [
  { id: "user-intent", label: "User Intent Collection", kind: "boundary", input: "User message / prompt", output: "intent:id" },
  { id: "generator-prompt", label: "Generator (Prompt_id)", kind: "generator", input: "intent:id", output: "Prompt_id bound to Job_id" },
  { id: "researcher", label: "Researcher Agent", kind: "agent", input: "Prompt_id", output: "plan_id, schema_id, fixture_id, goal_id, validation_id" },
  { id: "planner", label: "Planner Agent", kind: "agent", input: "plan_id", output: "audit_id review findings" },
  { id: "refactor", label: "Refactor Agent", kind: "agent", input: "audit_id + plan_id", output: "same plan_id preserved" },
  { id: "gap-check", label: "Gap Check Router", kind: "router", input: "refactored plan", output: "Event(route: GAP_0 | GAPS_FOUND)" },
  { id: "gap-fix", label: "Gap Fix Node", kind: "agent", input: "unresolved gaps", output: "remediated plan" },
  { id: "gap-recheck", label: "Gap Recheck Node", kind: "agent", input: "remediated plan", output: "recheck status" },
  { id: "evaluation", label: "Evaluation Router", kind: "router", input: "gap_0 certified plan", output: "Event(route: PASSED | ROOT_CAUSE)" },
  { id: "evaluation-root-cause", label: "Evaluation Root Cause Terminal", kind: "terminal", input: "ROOT_CAUSE event", output: "Terminal Root Cause" },
  { id: "schema-validation", label: "Schema Validator", kind: "validator", input: "schema_id", output: "VALID | NOT_VALID" },
  { id: "fixture-validation", label: "Fixture Validator", kind: "validator", input: "fixture_id", output: "VALID | NOT_VALID" },
  { id: "goal-validation", label: "Goal Validator", kind: "validator", input: "goal_id + FINAL plan_id", output: "VALID | NOT_VALID" },
  { id: "triple-join", label: "Triple Validation JoinNode Barrier", kind: "join", input: "3 validator outputs", output: "Synchronized output map" },
  { id: "validation-gate", label: "Validation Gate Router", kind: "gate", input: "joined validator map", output: "Event(route: ALL_VALID | NOT_VALID)" },
  { id: "validation-root-cause", label: "Validation Root Cause Terminal", kind: "terminal", input: "NOT_VALID event", output: "Terminal Root Cause" },
  { id: "confirmed", label: "Confirmed Core Assembler", kind: "gate", input: "validated artifacts", output: "confirmed_package.core" },
  { id: "create-hash", label: "Create Hash (RFC 8785 + SHA-256)", kind: "proof", input: "confirmed_package.core", output: "created_hash" },
  { id: "promote", label: "Promote (Researcher FINAL)", kind: "gate", input: "created_hash", output: "Promote(Researcher FINAL)" },
  { id: "builder", label: "Builder / Sandbox Execution", kind: "sandbox", input: "promoted package", output: "sandbox evidence logs" },
  { id: "recompute-hash", label: "Recompute Hash Proof", kind: "proof", input: "sandbox core", output: "recomputed_hash" },
  { id: "hash-verification", label: "Hash Verification Router", kind: "router", input: "created_hash + recomputed_hash", output: "Event(route: MATCH | MISMATCH)" },
  { id: "hash-mismatch-root-cause", label: "Hash Mismatch Root Cause Terminal", kind: "terminal", input: "MISMATCH event", output: "Terminal Root Cause" },
  { id: "done", label: "Done Terminal (PASSED)", kind: "terminal", input: "MATCH event", output: "DONE (PASSED)" },
];

/**
 * Explicit Google ADK 2.0 Graph Edges with conditional route maps, parallel fan-out, JoinNode, and back-edges.
 */
export const CANONICAL_ADK_EDGES: WorkflowGraphEdge[] = [
  // 1. Ingestion sequence
  { from: "user-intent", to: "generator-prompt", description: "intent:id finalized" },
  { from: "generator-prompt", to: "researcher", description: "Prompt_id bound to Job_id" },
  { from: "researcher", to: "planner", description: "Researcher(id) + plan_id" },
  { from: "planner", to: "refactor", description: "audit_id findings" },
  { from: "refactor", to: "gap-check", description: "same plan_id preserved" },

  // 2. Gap Analysis Loop with explicit back-edge
  { from: "gap-check", to: "gap-fix", condition: "GAPS_FOUND", description: "route to gap fix" },
  { from: "gap-fix", to: "gap-recheck", description: "apply remediations" },
  { from: "gap-recheck", to: "gap-check", isBackEdge: true, description: "EXPLICIT BACK-EDGE: re-evaluate gaps" },
  { from: "gap-check", to: "evaluation", condition: "GAP_0", description: "0 unresolved gaps exit loop" },

  // 3. Evaluation Router
  { from: "evaluation", to: "schema-validation", condition: "PASSED", description: "Triple Validation Parallel Fan-Out" },
  { from: "evaluation", to: "fixture-validation", condition: "PASSED", description: "Triple Validation Parallel Fan-Out" },
  { from: "evaluation", to: "goal-validation", condition: "PASSED", description: "Triple Validation Parallel Fan-Out" },
  { from: "evaluation", to: "evaluation-root-cause", condition: "ROOT_CAUSE", description: "evaluation failure halt" },

  // 4. Parallel Fan-In into JoinNode Barrier
  { from: "schema-validation", to: "triple-join", description: "VALID | NOT_VALID" },
  { from: "fixture-validation", to: "triple-join", description: "VALID | NOT_VALID" },
  { from: "goal-validation", to: "triple-join", description: "VALID | NOT_VALID" },

  // 5. Validation Gate Router
  { from: "triple-join", to: "validation-gate", description: "all 3 validator outputs resolved" },
  { from: "validation-gate", to: "confirmed", condition: "ALL_VALID", description: "all 3 validators VALID" },
  { from: "validation-gate", to: "validation-root-cause", condition: "NOT_VALID", description: "validation failure halt" },

  // 6. Confirmed Core, Create Hash & Promotion
  { from: "confirmed", to: "create-hash", description: "immutable package handoff" },
  { from: "create-hash", to: "promote", description: "created_hash attached" },
  { from: "promote", to: "builder", description: "Job confirmed" },
  { from: "builder", to: "recompute-hash", description: "sandbox evidence collected" },
  { from: "recompute-hash", to: "hash-verification", description: "recomputed_hash generated" },

  // 7. Hash Verification Router
  { from: "hash-verification", to: "done", condition: "MATCH", description: "created_hash == recomputed_hash" },
  { from: "hash-verification", to: "hash-mismatch-root-cause", condition: "MISMATCH", description: "hash mismatch halt" },
];

/** Mapping from runtime processor names to graph node IDs */
const PROCESSOR_TO_NODE_ID: Record<string, string> = {
  Intent: "user-intent",
  Prompt: "generator-prompt",
  Researcher: "researcher",
  Planner: "planner",
  Refactor: "refactor",
  GapAnalysis: "gap-check",
  GapCheck: "gap-check",
  GapFix: "gap-fix",
  GapRecheck: "gap-recheck",
  Evaluation: "evaluation",
  SchemaValidation: "schema-validation",
  FixtureValidation: "fixture-validation",
  GoalValidation: "goal-validation",
  TripleValidation: "validation-gate",
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
 * Returns the complete Google ADK 2.0 Graph Topology.
 */
export function getAdkWorkflowGraphTopology() {
  return {
    graph_id: "oneshot-adk-workflow-v2",
    title: "OneShot Google ADK 2.0 Workflow Graph",
    specification: "workflow/WorkflowGraph_corrected_optimized.txt",
    authority: "OneShot Workflow_Tree & CANONICAL_WORKFLOW.md",
    engine: "@google/adk",
    fan_in_barrier: "JoinNode",
    triple_validation: {
      schema: "schema-validation",
      fixture: "fixture-validation",
      goal: "goal-validation",
      barrier: "triple-join",
      gate: "validation-gate",
    },
    gap_loop: {
      router: "gap-check",
      fix: "gap-fix",
      recheck: "gap-recheck",
      back_edge: "gap-recheck -> gap-check",
    },
    nodes: CANONICAL_ADK_NODES,
    edges: CANONICAL_ADK_EDGES,
  };
}

/**
 * Project the Google ADK 2.0 OneShot Workflow Graph from real runtime events.
 */
export function projectWorkflowGraph(events: ProcessingEvent[] = []) {
  const latestByProcessor = new Map<string, ProcessingEvent>();
  for (const e of events) {
    latestByProcessor.set(e.processor, e);
  }

  const nodes: WorkflowGraphNode[] = CANONICAL_ADK_NODES.map((def) => {
    let matchingEvent: ProcessingEvent | undefined;
    for (const [proc, ev] of latestByProcessor.entries()) {
      if (PROCESSOR_TO_NODE_ID[proc] === def.id) {
        matchingEvent = ev;
        break;
      }
    }

    let state: GraphNodeState = "PENDING";
    if (matchingEvent) {
      state = matchingEvent.state as GraphNodeState;
    }

    // JoinNode follows fan-in completion of all 3 parallel validators
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
    ...getAdkWorkflowGraphTopology(),
    nodes,
  };
}
