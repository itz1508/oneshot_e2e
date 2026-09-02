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
    id: "OneShotCanonicalWorkflow",
    label: "OneShot Canonical Workflow / SequentialAgent",
    kind: "workflow",
    processor: "Done",
  },
  { id: "ResearcherStage", label: "Researcher", kind: "stage", processor: "Researcher" },
  { id: "PlannerStage", label: "Planner", kind: "stage", processor: "Planner" },
  { id: "RefactorStage", label: "Refactor", kind: "stage", processor: "Refactor" },
  {
    id: "GapAnalysisWorkflow",
    label: "Gap Analysis / SequentialAgent",
    kind: "workflow",
    processor: "GapAnalysis",
  },
  {
    id: "GapAnalysisLoop",
    label: "Gap Analysis Loop / LoopAgent",
    kind: "loop",
    inherit: "GapAnalysis",
  },
  { id: "GapCheck", label: "Gap Check", kind: "stage", inherit: "GapAnalysis" },
  { id: "GapFix", label: "Gap Fix", kind: "stage", inherit: "GapAnalysis" },
  { id: "GapRecheck", label: "Gap Recheck", kind: "stage", inherit: "GapAnalysis" },
  {
    id: "GapAnalysisComplete",
    label: "Gap Analysis Complete",
    kind: "gate",
    inherit: "GapAnalysis",
  },
  { id: "EvaluationStage", label: "Evaluation", kind: "stage", processor: "Evaluation" },
  {
    id: "TripleValidationWorkflow",
    label: "Triple Validation / SequentialAgent",
    kind: "workflow",
    processor: "TripleValidation",
  },
  {
    id: "TripleValidationAdmission",
    label: "Triple Validation Admission",
    kind: "gate",
    inherit: "TripleValidation",
  },
  {
    id: "TripleValidationParallel",
    label: "Triple Validation / ParallelAgent",
    kind: "parallel",
    inherit: "TripleValidation",
  },
  {
    id: "SchemaValidationAgent",
    label: "Schema Validation",
    kind: "stage",
    processor: "SchemaValidation",
  },
  {
    id: "FixtureValidationAgent",
    label: "Fixture Validation",
    kind: "stage",
    processor: "FixtureValidation",
  },
  {
    id: "GoalValidationAgent",
    label: "Goal Validation",
    kind: "stage",
    processor: "GoalValidation",
  },
  {
    id: "TripleValidationGate",
    label: "Triple Validation Gate",
    kind: "gate",
    processor: "TripleValidation",
  },
  { id: "ConfirmationStage", label: "Confirmed", kind: "gate", processor: "Confirmed" },
  { id: "CreateHashStage", label: "Create H1", kind: "stage", processor: "CreateHash" },
  { id: "BuilderStage", label: "Builder / Sandbox Execution", kind: "stage", processor: "Builder" },
  {
    id: "HashVerificationStage",
    label: "H1 = Sandbox H2",
    kind: "gate",
    processor: "Hash",
  },
  { id: "DoneStage", label: "Done", kind: "gate", processor: "Done" },
];

const providerDefs: NodeDefinition[] = [
  { id: "Provider:researcher", label: "Researcher Provider", kind: "boundary", processor: "ADK:researcher-provider" },
  { id: "Provider:cache", label: "Research Draft Cache", kind: "cache", processor: "ADK:cache" },
  { id: "Provider:runner", label: "Google ADK LlmAgent / Runner", kind: "agent", processor: "ADK:adk-runner" },
  { id: "Provider:litellm", label: "LiteLLM ollama_chat", kind: "model-adapter", processor: "ADK:litellm" },
  { id: "Provider:ollama", label: "Ollama", kind: "model-server", processor: "ADK:ollama" },
  { id: "Provider:gemma2", label: "Gemma 2 9B", kind: "model", processor: "ADK:gemma2" },
  { id: "Provider:research-draft", label: "Structured Research Draft", kind: "artifact", processor: "ADK:research-draft" },
];

export const ADK_GRAPH_EDGES: AdkGraphEdge[] = [
  { from: "OneShotCanonicalWorkflow", to: "ResearcherStage", condition: "SequentialAgent" },
  { from: "ResearcherStage", to: "PlannerStage" },
  { from: "PlannerStage", to: "RefactorStage" },
  { from: "RefactorStage", to: "GapAnalysisWorkflow" },
  { from: "GapAnalysisWorkflow", to: "GapAnalysisLoop", condition: "contains" },
  { from: "GapAnalysisLoop", to: "GapCheck", condition: "LoopAgent" },
  { from: "GapCheck", to: "GapFix", condition: "gaps found" },
  { from: "GapFix", to: "GapRecheck" },
  { from: "GapRecheck", to: "GapCheck", condition: "gaps remaining" },
  { from: "GapCheck", to: "GapAnalysisComplete", condition: "gap_0" },
  { from: "GapRecheck", to: "GapAnalysisComplete", condition: "gap_0" },
  { from: "GapAnalysisComplete", to: "EvaluationStage" },
  { from: "EvaluationStage", to: "TripleValidationWorkflow", condition: "PASSED" },
  { from: "TripleValidationWorkflow", to: "TripleValidationAdmission", condition: "contains" },
  { from: "TripleValidationAdmission", to: "TripleValidationParallel" },
  { from: "TripleValidationParallel", to: "SchemaValidationAgent", condition: "parallel" },
  { from: "TripleValidationParallel", to: "FixtureValidationAgent", condition: "parallel" },
  { from: "TripleValidationParallel", to: "GoalValidationAgent", condition: "parallel" },
  { from: "SchemaValidationAgent", to: "TripleValidationGate" },
  { from: "FixtureValidationAgent", to: "TripleValidationGate" },
  { from: "GoalValidationAgent", to: "TripleValidationGate" },
  { from: "TripleValidationGate", to: "ConfirmationStage", condition: "VALID" },
  { from: "ConfirmationStage", to: "CreateHashStage" },
  { from: "CreateHashStage", to: "BuilderStage" },
  { from: "BuilderStage", to: "HashVerificationStage" },
  { from: "HashVerificationStage", to: "DoneStage", condition: "MATCH" },

  // Existing Researcher provider ADK subgraph, attached beneath Researcher.
  { from: "ResearcherStage", to: "Provider:researcher", condition: "provider" },
  { from: "Provider:researcher", to: "Provider:cache" },
  { from: "Provider:cache", to: "Provider:research-draft", condition: "cache hit" },
  { from: "Provider:cache", to: "Provider:runner", condition: "cache miss" },
  { from: "Provider:runner", to: "Provider:litellm" },
  { from: "Provider:litellm", to: "Provider:ollama" },
  { from: "Provider:ollama", to: "Provider:gemma2" },
  { from: "Provider:gemma2", to: "Provider:research-draft" },
];

function rootState(latest: Map<string, ProcessingEvent>): GraphNodeState {
  if (latest.get("Done")?.state === "COMPLETE") return "COMPLETE";
  if ([...latest.values()].some((event) => event.state === "RUNNING")) {
    return "RUNNING";
  }
  if ([...latest.values()].some((event) => event.state === "COMPLETE")) {
    return "RUNNING";
  }
  return "PENDING";
}

/**
 * Project the real canonical ADK workflow structure plus the Researcher
 * provider subgraph. This API is projection-only; execution authority is the
 * actual @google/adk agent object tree created by the backend runtime.
 */
export function projectAdkGraph(events: ProcessingEvent[] = []) {
  const latest = new Map<string, ProcessingEvent>();
  for (const event of events) latest.set(event.processor, event);

  const defs = [...workflowDefs, ...providerDefs];
  const nodes = defs.map((definition) => {
    if (definition.id === "OneShotCanonicalWorkflow") {
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
    graph_id: "oneshot-adk-workflow-v2",
    authority: "projection-only",
    execution_authority: "@google/adk",
    root_agent: {
      id: "OneShotCanonicalWorkflow",
      type: "SequentialAgent",
    },
    workflow_agents: {
      gap_analysis: "LoopAgent",
      triple_validation: "ParallelAgent",
    },
    provider_subgraph: {
      attached_to: "ResearcherStage",
      root: "Provider:researcher",
    },
    nodes,
    edges: ADK_GRAPH_EDGES,
  };
}
