import type { ProcessingEvent } from "../contract/types.js";

export type GraphNodeState = "PENDING" | "RUNNING" | "COMPLETE";

export interface AdkGraphNode {
  id: string;
  label: string;
  kind:
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

/** Static node definitions for the ADK Researcher provider subgraph. */
const defs: Array<Omit<AdkGraphNode, "state" | "message">> = [
  { id: "researcher-provider", label: "Researcher Provider", kind: "boundary" },
  { id: "cache", label: "Research Draft Cache", kind: "cache" },
  { id: "adk-runner", label: "Google ADK LlmAgent / Runner", kind: "agent" },
  { id: "litellm", label: "LiteLLM ollama_chat", kind: "model-adapter" },
  { id: "ollama", label: "Ollama", kind: "model-server" },
  { id: "gemma2", label: "Gemma 2 9B", kind: "model" },
  { id: "research-draft", label: "Structured Research Draft", kind: "artifact" },
];

/** Static edge definitions with cache hit/miss conditions. */
export const ADK_GRAPH_EDGES: AdkGraphEdge[] = [
  { from: "researcher-provider", to: "cache" },
  { from: "cache", to: "research-draft", condition: "cache hit" },
  { from: "cache", to: "adk-runner", condition: "cache miss" },
  { from: "adk-runner", to: "litellm" },
  { from: "litellm", to: "ollama" },
  { from: "ollama", to: "gemma2" },
  { from: "gemma2", to: "research-draft" },
];

/**
 * Project the ADK Researcher provider subgraph.
 *
 * This is projection-only — it is attached to the Researcher boundary and
 * never owns any canonical workflow transitions.
 */
export function projectAdkGraph(events: ProcessingEvent[] = []) {
  const latest = new Map<string, ProcessingEvent>();
  for (const e of events.filter((x) => x.scope === "ADK")) {
    latest.set(e.processor.replace(/^ADK:/, ""), e);
  }

  const nodes = defs.map((d) => {
    const e = latest.get(d.id);
    return {
      ...d,
      state: (e?.state ?? "PENDING") as GraphNodeState,
      message: e?.message,
    };
  });

  return {
    graph_id: "oneshot-adk-researcher-v1",
    attached_to: "Researcher",
    authority: "projection-only",
    agent_type: "LlmAgent",
    nodes,
    edges: ADK_GRAPH_EDGES,
  };
}
