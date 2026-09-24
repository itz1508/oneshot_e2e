/**
 * OneShot Streaming & Execution Contracts
 *
 * Implements typed contracts for Session, Job, Conversation runtime,
 * Tool capabilities, DeepAgents event streaming, and State-driven progress.
 */

// Core Session & Conversation Contracts
export interface SessionEntity {
  readonly session_id: string;
  sessionLabel: string;
  conversation: ConversationState;
  createdAt: string;
}

// Job & Execution Contracts
export interface JobEntity {
  readonly job_id: string;
  jobTitle: string;
  execution: JobExecutionState;
  session_id: string;
}

export interface NodeManifest {
  nodeId: string;
  nodeType: string;
  hash: string;
  isValid: boolean;
  structureValid: boolean;
}

export interface BuildManifest {
  readonly build_id: string;
  commitHash: string;
  artifacts: string[];
  manifestHash: string;
  isValid: boolean;
}

export interface ArtifactEntity {
  readonly artifact_id?: string;
  runtimeName: string;
  isMutable: boolean;
  isInProgress: boolean;
  consumer: string;
  content?: unknown;
  status: "draft" | "evolving" | "validated" | "persisted";
}

// Verification & Contract Proof Record
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

// Event Contracts Consumed by UI Components
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

// State-Driven Progress Contracts (DeepAgents TodoListMiddleware Pattern)
export interface TodoItem {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  stage?: string;
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

// Stream Messages & Runtime State
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

// Tool Capability Execution
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

// Job Execution State
export interface JobExecutionState {
  job_id: string;
  currentStep: string;
  stage: string;
  progress: number;
  activeCapabilities: ToolCapabilityExecution[];
  status: "queued" | "running" | "completed" | "failed";
}

// Subagent Projection Contract (DeepAgents stream.subagents)
export interface SubagentProjection {
  name: string;
  path: string;
  status: "started" | "running" | "completed" | "failed" | "interrupted";
  messages?: StreamMessage[];
  tool_calls?: ToolCapabilityExecution[];
  output?: unknown;
}
