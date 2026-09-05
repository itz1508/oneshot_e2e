import type { ConfirmedPackage, Plan, RootCause } from "../contracts/schema/types.js";
import type { HelpRequest } from "../intent/types.js";
export type { HelpRequest } from "../intent/types.js";

/** Policy for outbound network access inside the execution sandbox. */
export type NetworkPolicy = "DENY_ALL" | "ALLOW_SPECIFIC";

/** Execution authorization metadata controlling sandbox isolation parameters. */
export interface ExecutionAuthorization {
  execution_id: string;
  execution_root?: string;
  permitted_operations?: string[];
  protected_paths?: string[];
  timeout_seconds: number;
  memory_limit_mb: number;
  cpu_limit: number;
  pid_limit: number;
  network_policy: NetworkPolicy;
  environment_allowlist: string[];
  max_output_bytes: number;
  max_files_changed: number;
  max_total_bytes_written: number;
}

/** Immutable execution input delivered across the sandbox handoff boundary. */
export interface SandboxExecutionInput {
  confirmed_package: ConfirmedPackage;
  hash: string;
  execution_authorization?: Partial<ExecutionAuthorization>;
}

/** Record of a single file mutation during sandboxed execution. */
export interface FileChangeEvidence {
  path: string;
  action: "created" | "modified" | "deleted";
  bytes: number;
}

/** Resource consumption metrics collected during sandboxed execution. */
export interface ResourceUsageEvidence {
  duration_ms: number;
  peak_memory_mb?: number;
  cpu_time_ms?: number;
}

/** Timeout condition evidence when execution exceeds bounds. */
export interface TimeoutEvidence {
  timed_out: boolean;
  limit_seconds: number;
  elapsed_seconds: number;
}

/** Comprehensive, immutable execution evidence captured inside the sandbox. */
export interface ExecutionEvidence {
  execution_id: string;
  sandbox_id: string;
  confirmed_package_hash: string;
  started_at: string;
  completed_at: string;
  commands: string[];
  exit_codes: number[];
  stdout_refs: string[];
  stderr_refs: string[];
  file_changes: FileChangeEvidence[];
  bytes_written: number;
  resource_usage: ResourceUsageEvidence;
  timeout_evidence?: TimeoutEvidence;
  environment_allowlist_used: string[];
  network_policy_used: string;
  cleanup_result: {
    workspace_cleaned: boolean;
    processes_terminated: boolean;
  };
  hash_sandbox: string;
}

/**
 * Request emitted when sandbox execution identifies that additional
 * canonical research is required to resolve a failure. Routes back to
 * OneShot Researcher.
 */
export interface ResearchRequest {
  request_id: string;
  issue: string;
  why_research_is_required: string;
  evidence_ids: string[];
  missing_information: string[];
  execution_id: string;
}

/** Successful execution result with verified sandbox hash. */
export interface SandboxExecutionPassed {
  result: "PASSED";
  execution_id: string;
  sandbox_id: string;
  evidence: ExecutionEvidence;
  hash_sandbox: string;
  hash_matched: true;
}

/** Execution failure or admission failure with deterministic root cause. */
export interface SandboxExecutionRootCause {
  result: "ROOT_CAUSE";
  execution_id: string;
  sandbox_id?: string;
  root_cause: RootCause;
  evidence?: ExecutionEvidence;
  help_request?: HelpRequest;
  research_request?: ResearchRequest;
}

/** Discriminated union for terminal sandbox outcome. */
export type SandboxExecutionResult =
  | SandboxExecutionPassed
  | SandboxExecutionRootCause;
