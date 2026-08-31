import type { Plan } from "../../contract/types.js";
import type {
  ExecutionAuthorization,
  ExecutionEvidence,
  FileChangeEvidence,
  ResourceUsageEvidence,
  TimeoutEvidence,
} from "../types.js";

/** Internal execution output from a sandbox runner. */
export interface RunnerExecutionResult {
  commands: string[];
  exit_codes: number[];
  stdout_lines: string[];
  stderr_lines: string[];
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
  condition?: "success" | "failure" | "timeout" | "resource_exhausted" | "denied";
}

/** Abstract sandbox runner interface. */
export interface SandboxRunner {
  execute(
    sandboxId: string,
    workspacePath: string,
    plan: Plan,
    auth: ExecutionAuthorization,
    onLog?: (stream: "stdout" | "stderr", chunk: string) => void,
  ): Promise<RunnerExecutionResult>;

  cleanup(sandboxId: string, workspacePath: string): Promise<boolean>;
}
