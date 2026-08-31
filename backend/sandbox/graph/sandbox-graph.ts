import type { ProcessingEvent } from "../../contract/types.js";

export type SandboxGraphNodeState = "PENDING" | "RUNNING" | "COMPLETE";

export interface SandboxGraphNode {
  id: string;
  label: string;
  stage: number;
  state: SandboxGraphNodeState;
  message?: string;
  artifact_id?: string;
}

export interface SandboxGraphEdge {
  from: string;
  to: string;
  condition?: string;
}

const STAGES: Array<Omit<SandboxGraphNode, "state" | "message" | "artifact_id">> = [
  { id: "SandboxHandoffReceived", label: "Sandbox Handoff Received", stage: 1 },
  { id: "SandboxAdmissionVerified", label: "Admission Verified (HASH == recomputed)", stage: 2 },
  { id: "SandboxCreated", label: "Sandbox Created (Ephemeral Workspace)", stage: 3 },
  { id: "ExecutionStarted", label: "Execution Started (Isolated Boundary)", stage: 4 },
  { id: "ExecutionCompleted", label: "Execution Completed", stage: 5 },
  { id: "ExecutionEvidenceRecorded", label: "Execution Evidence Recorded", stage: 6 },
  { id: "SandboxHashCreated", label: "Sandbox Hash Created", stage: 7 },
  { id: "SandboxHashVerified", label: "Sandbox Hash Verified (HASH == hash_sandbox)", stage: 8 },
  { id: "SandboxCleaned", label: "Sandbox Cleaned", stage: 9 },
];

export const SANDBOX_GRAPH_EDGES: SandboxGraphEdge[] = [
  { from: "SandboxHandoffReceived", to: "SandboxAdmissionVerified" },
  { from: "SandboxAdmissionVerified", to: "SandboxCreated", condition: "admission verified" },
  { from: "SandboxCreated", to: "ExecutionStarted" },
  { from: "ExecutionStarted", to: "ExecutionCompleted" },
  { from: "ExecutionCompleted", to: "ExecutionEvidenceRecorded" },
  { from: "ExecutionEvidenceRecorded", to: "SandboxHashCreated" },
  { from: "SandboxHashCreated", to: "SandboxHashVerified" },
  { from: "SandboxHashVerified", to: "SandboxCleaned", condition: "hash matched" },
];

/**
 * Project the Sandbox Execution lifecycle graph.
 * Projection-only metadata derived from SANDBOX-scoped processing events.
 */
export function projectSandboxGraph(events: ProcessingEvent[] = []) {
  const latest = new Map<string, ProcessingEvent>();
  for (const e of events.filter((x) => x.scope === "SANDBOX")) {
    latest.set(e.processor, e);
  }

  const nodes: SandboxGraphNode[] = STAGES.map((s) => {
    const e = latest.get(s.id);
    return {
      ...s,
      state: (e?.state ?? "PENDING") as SandboxGraphNodeState,
      message: e?.message,
      artifact_id: e?.artifact_id,
    };
  });

  return {
    graph_id: "oneshot-sandbox-execution-v1",
    authority: "projection-only",
    attached_to: "ConfirmedPackage + Canonical HASH",
    nodes,
    edges: SANDBOX_GRAPH_EDGES,
  };
}
