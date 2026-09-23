/**
 * OneShot Canonical 24 Invariants Type System & Contracts
 *
 * Implements the 24 authoritative invariants governing Session, Job,
 * Conversation runtime, Tool capabilities, Validation proof ledger, and Artifact duality.
 */

// Invariant 1: Session owns conversation.
// Invariant 16: Session Label != session_id.
export interface SessionEntity {
  readonly session_id: string; // Persistence Artifact (_id)
  sessionLabel: string;        // Human-readable display label (Session Label != session_id)
  conversation: ConversationState; // Session owns conversation
  createdAt: string;
}

// Invariant 2: Job owns execution.
// Invariant 17: Job Title != job_id.
export interface JobEntity {
  readonly job_id: string; // Persistence Artifact (_id)
  jobTitle: string;        // Human-readable title (Job Title != job_id)
  execution: JobExecutionState; // Job owns execution
  session_id: string;
}

// Invariant 19: Every Node requires a Manifest.
// Invariant 11: Manifest validates structure.
// Invariant 15: No Event Out without Manifest VALID.
export interface NodeManifest {
  nodeId: string;
  nodeType: string;
  hash: string;
  isValid: boolean;
  structureValid: boolean;
}

// Invariant 14: No Build Complete without Build Manifest.
export interface BuildManifest {
  readonly build_id: string;
  commitHash: string;
  artifacts: string[];
  manifestHash: string;
  isValid: boolean;
}

// Invariant 18: Every Artifact requires a Consumer.
// Invariant 8: Runtime operates on (...).
// Invariant 9: Persistence operates on _id.
// Invariant 24: Only final persisted decisions become *_id artifacts.
export interface ArtifactEntity {
  readonly artifact_id?: string; // Defined only when persisted (_id)
  runtimeName: string;          // artifact(...)
  isMutable: boolean;
  isInProgress: boolean;
  consumer: string;             // Strictly required: Every Artifact requires a Consumer
  content?: unknown;
  status: "draft" | "evolving" | "validated" | "persisted";
}

// Invariant 10: Validation blocks promotion.
// Invariant 12: Expected must equal Observed.
// Invariant 13: No PASS without proof.
// Invariant 20: Every Validation requires: Expected, Observed, Assertion, Failure.
export interface ValidationRecord {
  id: string;
  assertion: string;
  expected: unknown;
  observed: unknown;
  failure: string | null;
  hasProof: boolean;
  passed: boolean;
  blocksPromotion: boolean;
  timestamp: string;
}

// Event Contracts Consumed
// Consumed by Main Screen: useStream(...), BuildCompleted, ValidationConfirmed
// Consumed by Task Rail: TasksCreated, PlanUpdated, ValidationConfirmed

export interface BuildCompletedEvent {
  type: "BuildCompleted";
  build_id: string;
  buildManifest: BuildManifest;
  timestamp: number;
}

export interface ValidationConfirmedEvent {
  type: "ValidationConfirmed";
  validation_id: string;
  validations: ValidationRecord[];
  allPassed: boolean;
  timestamp: number;
}

export interface TasksCreatedEvent {
  type: "TasksCreated";
  job_id: string;
  tasks: Array<{
    task_id: string;
    title: string;
    stage: string;
    status: "pending" | "in_progress" | "completed" | "failed";
  }>;
  timestamp: number;
}

export interface PlanUpdatedEvent {
  type: "PlanUpdated";
  plan_id: string;
  coreHash: string;
  steps: string[];
  version: number;
  timestamp: number;
}

// Invariant 3: useStream(...) owns conversation runtime.
// Invariant 22: Conversation flows through useStream(...).
export interface StreamMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  toolCallIds?: string[];
}

export interface ConversationState {
  session_id: string;
  messages: StreamMessage[];
  streamingChunk?: string;
  isStreaming: boolean;
}

// Invariant 4: useTool(...) owns capability runtime.
// Invariant 23: Capabilities execute through useTool(...).
export interface ToolCapabilityExecution {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: "running" | "finished" | "error";
  result?: unknown;
  error?: string;
  startTime: number;
  endTime?: number;
}

// Invariant 2: Job owns execution.
export interface JobExecutionState {
  job_id: string;
  currentStep: string;
  stage: string;
  progress: number;
  activeCapabilities: ToolCapabilityExecution[];
  status: "queued" | "running" | "completed" | "failed";
}
