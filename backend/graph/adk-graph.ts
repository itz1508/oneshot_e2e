import type { ProcessingEvent } from "../contract/types.js";

export type GraphNodeState = "PENDING" | "RUNNING" | "COMPLETE";

export interface AdkGraphNode {
  id: string;
  label: string;
  kind:
    | "workflow"
    | "stage"
    | "loop"
    | "parallel"
    | "gate"
    | "boundary"
    | "cache"
    | "agent"
    | "model-adapter"
    | "model-server"
    | "model"
    | "artifact";
  state: GraphNodeState;
  message?: string;
}

export interface AdkGraphEdge {
  from: string;
  to: string;
  condition?: string;
}

interface NodeDefinition extends Omit<AdkGraphNode, "state" | "message"> {
  processor?: string;
  inherit?: string;
}

const workflowDefs: NodeDefinition[] = [
  {
    id: "OneShotWorkflow",
    label: "OneShot / Google ADK Workflow",
    kind: "workflow",
    processor: "Done",
  },
  {
    id: "OneShotPipeline",
    label: "OneShot Pipeline / dynamic node",
    kind: "workflow",
    processor: "Done",
  },
  { id: "Researcher", label: "Researcher", kind: "stage", processor: "Researcher" },
  { id: "Planner", label: "Planner", kind: "stage", processor: "Planner" },
  { id: "Refactor", label: "Refactor", kind: "stage", processor: "Refactor" },
  {
    id: "GapAnalysis",
    label: "Gap Analysis / ctx.runNode loop",
    kind: "workflow",
    processor: "GapAnalysis",
  },
  { id: "GapAnalysisCheck", label: "Gap Check", kind: "stage", inherit: "GapAnalysis" },
  { id: "GapAnalysisFix", label: "Gap Improve", kind: "stage", inherit: "GapAnalysis" },
  { id: "GapAnalysisFinalize", label: "Gap Finalize", kind: "gate", inherit: "GapAnalysis" },
  { id: "Evaluation", label: "Evaluation", kind: "stage", processor: "Evaluation" },
  {
    id: "TripleValidation",
    label: "Triple Validation / dynamic parallel fan-out",
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
  { id: "CreateHash", label: "Create H1", kind: "stage", processor: "CreateHash" },
  { id: "Builder", label: "Builder / Sandbox Execution", kind: "stage", processor: "Builder" },
  { id: "Hash", label: "H1 = Sandbox H2", kind: "gate", processor: "Hash" },
  { id: "Done", label: "Done", kind: "gate", processor: "Done" },
];

const providerDefs: NodeDefinition[] = [
  {
    id: "Provider:researcher",
    label: "Researcher Provider Binding",
    kind: "boundary",
    processor: "ProviderBinding:Researcher",
  },
  { id: "Provider:cache", label: "Research Draft Cache", kind: "cache", processor: "ADK:cache" },
  { id: "Provider:runner", label: "Google ADK Researcher Pipeline", kind: "agent", processor: "ADK:researcher-pipeline" },
  { id: "Provider:distribution", label: "Distribution Model", kind: "model", processor: "ADK:distribution-model" },
  { id: "Provider:research", label: "Research Model", kind: "model", processor: "ADK:research-model" },
  { id: "Provider:synthesis", label: "Synthesis Model", kind: "model", processor: "ADK:synthesis-model" },
  { id: "Provider:research-draft", label: "Structured Research Draft", kind: "artifact", processor: "ADK:research-draft" },
];

export const ADK_GRAPH_EDGES: AdkGraphEdge[] = [
  { from: "OneShotWorkflow", to: "OneShotPipeline", condition: "START" },
  { from: "OneShotPipeline", to: "Researcher", condition: "ctx.runNode" },
  { from: "Researcher", to: "Planner" },
  { from: "Planner", to: "Refactor" },
  { from: "Refactor", to: "GapAnalysis" },
  { from: "GapAnalysis", to: "GapAnalysisCheck", condition: "ctx.runNode" },
  { from: "GapAnalysisCheck", to: "GapAnalysisFix", condition: "gap found" },
  { from: "GapAnalysisFix", to: "GapAnalysisCheck", condition: "fresh recheck" },
  { from: "GapAnalysisCheck", to: "GapAnalysisFinalize", condition: "gap_0" },
  { from: "GapAnalysisFinalize", to: "Evaluation" },
  { from: "Evaluation", to: "TripleValidation", condition: "PASSED" },
  { from: "TripleValidation", to: "SchemaValidation", condition: "parallel ctx.runNode" },
  { from: "TripleValidation", to: "FixtureValidation", condition: "parallel ctx.runNode" },
  { from: "TripleValidation", to: "GoalValidation", condition: "parallel ctx.runNode" },
  { from: "SchemaValidation", to: "Confirmed", condition: "VALID with all lanes" },
  { from: "FixtureValidation", to: "Confirmed", condition: "VALID with all lanes" },
  { from: "GoalValidation", to: "Confirmed", condition: "VALID with all lanes" },
  { from: "TripleValidation", to: "GapAnalysis", condition: "NOT_VALID feedback" },
  { from: "Confirmed", to: "CreateHash" },
  { from: "CreateHash", to: "Builder" },
  { from: "Builder", to: "Hash" },
  { from: "Hash", to: "Done", condition: "MATCH" },

  // Researcher provider/model subgraph attached beneath the real Researcher node.
  { from: "Researcher", to: "Provider:researcher", condition: "provider binding" },
  { from: "Provider:researcher", to: "Provider:cache" },
  { from: "Provider:cache", to: "Provider:research-draft", condition: "cache hit" },
  { from: "Provider:cache", to: "Provider:runner", condition: "cache miss" },
  { from: "Provider:runner", to: "Provider:distribution" },
  { from: "Provider:distribution", to: "Provider:research" },
  { from: "Provider:research", to: "Provider:synthesis" },
  { from: "Provider:synthesis", to: "Provider:research-draft" },
];

function rootState(latest: Map<string, ProcessingEvent>): GraphNodeState {
  if (latest.get("Done")?.state === "COMPLETE") return "COMPLETE";
  if ([...latest.values()].some((event) => event.state === "RUNNING")) return "RUNNING";
  if ([...latest.values()].some((event) => event.state === "COMPLETE")) return "RUNNING";
  return "PENDING";
}

/**
 * Project the real dynamic @google/adk workflow plus the Researcher provider
 * subgraph. This API is projection-only; execution authority remains the
 * actual Workflow/node/ctx.runNode objects executed by WorkflowRuntime.
 */
export function projectAdkGraph(events: ProcessingEvent[] = []) {
  const latest = new Map<string, ProcessingEvent>();
  for (const event of events) latest.set(event.processor, event);

  const defs = [...workflowDefs, ...providerDefs];
  const nodes = defs.map((definition) => {
    if (definition.id === "OneShotWorkflow" || definition.id === "OneShotPipeline") {
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
      state: (event?.state ?? "PENDING") as GraphNodeState,
      message: event?.message,
    };
  });

  return {
    graph_id: "oneshot-adk-dynamic-workflow-v3",
    authority: "projection-only",
    execution_authority: "@google/adk",
    root_agent: {
      id: "OneShotWorkflow",
      type: "Workflow",
    },
    workflow_agents: {
      pipeline: "node+ctx.runNode",
      gap_analysis: "dynamic ctx.runNode loop",
      triple_validation: "Promise.all(ctx.runNode)",
    },
    provider_subgraph: {
      attached_to: "Researcher",
      root: "Provider:researcher",
    },
    nodes,
    edges: ADK_GRAPH_EDGES,
  };
}
