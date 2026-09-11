import type { ProcessingEvent } from "../contracts/schema/types.js";

export type GraphNodeState = "Pending" | "Running" | "Completed" | "Failed";

export interface WorkflowGraphNode {
  id: string;
  label: string;
  kind:
    | "workflow"
    | "stage"
    | "loop"
    | "parallel"
    | "gate"
    | "boundary"
    | "integration"
    | "artifact";
  state: GraphNodeState;
  message?: string;
}

export interface WorkflowGraphEdge {
  from: string;
  to: string;
  condition?: string;
}

interface NodeDefinition extends Omit<WorkflowGraphNode, "state" | "message"> {
  processor?: string;
  inherit?: string;
}

const workflowDefs: NodeDefinition[] = [
  {
    id: "OneShotWorkflow",
    label: "OneShot Workflow",
    kind: "workflow",
    processor: "Done",
  },
  {
    id: "Researcher",
    label: "Researcher",
    kind: "stage",
    processor: "Researcher",
  },
  { id: "Planner", label: "Planner", kind: "stage", processor: "Planner" },
  { id: "Refactor", label: "Refactor", kind: "stage", processor: "Refactor" },
  {
    id: "GapAnalysis",
    label: "Gap Analysis",
    kind: "stage",
    processor: "GapAnalysis",
  },
  {
    id: "Evaluation",
    label: "Evaluation",
    kind: "stage",
    processor: "Evaluation",
  },
  {
    id: "TripleValidation",
    label: "Triple Validation",
    kind: "parallel",
    processor: "TripleValidation",
  },
  {
    id: "SchemaValidation",
    label: "Schema Validation",
    kind: "stage",
    processor: "SchemaValidation",
  },
  {
    id: "FixtureValidation",
    label: "Fixture Validation",
    kind: "stage",
    processor: "FixtureValidation",
  },
  {
    id: "GoalValidation",
    label: "Goal Validation",
    kind: "stage",
    processor: "GoalValidation",
  },
  { id: "Confirmed", label: "Confirmed", kind: "gate", processor: "Confirmed" },
  {
    id: "CreateHash",
    label: "Create H1",
    kind: "stage",
    processor: "CreateHash",
  },
  {
    id: "Builder",
    label: "Builder / Sandbox Execution",
    kind: "stage",
    processor: "Builder",
  },
  { id: "Hash", label: "H1 = Sandbox H2", kind: "gate", processor: "Hash" },
  { id: "Done", label: "Done", kind: "gate", processor: "Done" },
];

export const WORKFLOW_GRAPH_EDGES: WorkflowGraphEdge[] = [
  { from: "OneShotWorkflow", to: "Researcher", condition: "START" },
  { from: "Researcher", to: "Planner" },
  { from: "Planner", to: "Refactor" },
  { from: "Refactor", to: "GapAnalysis" },
  { from: "GapAnalysis", to: "Evaluation" },
  { from: "Evaluation", to: "TripleValidation", condition: "Passed" },
  {
    from: "TripleValidation",
    to: "SchemaValidation",
    condition: "parallel",
  },
  {
    from: "TripleValidation",
    to: "FixtureValidation",
    condition: "parallel",
  },
  {
    from: "TripleValidation",
    to: "GoalValidation",
    condition: "parallel",
  },
  {
    from: "SchemaValidation",
    to: "Confirmed",
    condition: "VALID with all lanes",
  },
  {
    from: "FixtureValidation",
    to: "Confirmed",
    condition: "VALID with all lanes",
  },
  {
    from: "GoalValidation",
    to: "Confirmed",
    condition: "VALID with all lanes",
  },
  {
    from: "TripleValidation",
    to: "GapAnalysis",
    condition: "NOT_VALID feedback",
  },
  { from: "Confirmed", to: "CreateHash" },
  { from: "CreateHash", to: "Builder" },
  { from: "Builder", to: "Hash" },
  { from: "Hash", to: "Done", condition: "MATCH" },
];

function rootState(latest: Map<string, ProcessingEvent>): GraphNodeState {
  if (latest.get("Done")?.execution_status === "Completed") return "Completed";
  if ([...latest.values()].some((event) => event.execution_status === "Failed"))
    return "Failed";
  if (
    [...latest.values()].some((event) => event.execution_status === "Running")
  )
    return "Running";
  if (
    [...latest.values()].some((event) => event.execution_status === "Completed")
  )
    return "Running";
  return "Pending";
}

/**
 * Project the native OneShot workflow graph.
 * This API is projection-only; execution authority is the native pipeline/runtime.
 */
export function projectWorkflowGraph(events: ProcessingEvent[] = []) {
  const latest = new Map<string, ProcessingEvent>();
  for (const event of events) latest.set(event.processor, event);

  const integrationEvents = events.filter(
    (e) => e.scope === "SUPPORT" && e.processor.startsWith("Integration:"),
  );

  const dynamicNodes: NodeDefinition[] = [];
  const dynamicEdges: WorkflowGraphEdge[] = [];

  if (integrationEvents.length > 0) {
    const integrationNodeId = "Integration:active";
    dynamicNodes.push({
      id: integrationNodeId,
      label: "Active Integration",
      kind: "integration",
      processor: integrationEvents[integrationEvents.length - 1].processor,
    });
    dynamicEdges.push({
      from: "Researcher",
      to: integrationNodeId,
      condition: "model capability",
    });
  }

  const defs = [...workflowDefs, ...dynamicNodes];
  const nodes = defs.map((definition) => {
    if (definition.id === "OneShotWorkflow") {
      return {
        id: definition.id,
        label: definition.label,
        kind: definition.kind,
        state: rootState(latest),
      };
    }

    const processor = definition.processor ?? definition.inherit;
    const event = processor ? latest.get(processor) : undefined;
    return {
      id: definition.id,
      label: definition.label,
      kind: definition.kind,
      state: (event?.execution_status ?? "Pending") as GraphNodeState,
      message: event?.message,
    };
  });

  return {
    graph_id: "oneshot-native-workflow-v1",
    authority: "projection-only",
    execution_authority: "oneshot-native",
    root_agent: {
      id: "OneShotWorkflow",
      type: "Workflow",
    },
    workflow_agents: {
      pipeline: "native",
      gap_analysis: "native refinement loop",
      triple_validation: "Promise.all(parallel lanes)",
    },
    nodes,
    edges: [...WORKFLOW_GRAPH_EDGES, ...dynamicEdges],
  };
}
