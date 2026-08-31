import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { HashProof, RootCause } from "../contract/types.js";
import { WorkflowRootCauseError } from "../core/root-cause-error.js";
import type { ProcessingEventBus } from "../runtime/event-bus.js";
import type { CanonicalContractSkill } from "../skill/canonical-contract-skill.js";
import { verifySandboxAdmission } from "./admission.js";
import { HardenedProcessRunner } from "./runner/process-runner.js";
import type { SandboxRunner } from "./runner/runner.js";
import type {
  ExecutionAuthorization,
  ExecutionEvidence,
  HelpRequest,
  ResearchRequest,
  SandboxExecutionInput,
  SandboxExecutionResult,
} from "./types.js";

function positiveInt(val: string | undefined, fallback: number): number {
  const n = Number(val);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Load default sandbox execution authorization from environment. */
export function loadDefaultAuthorization(): ExecutionAuthorization {
  return {
    execution_id: `exec:${randomUUID()}`,
    timeout_seconds: positiveInt(process.env.SANDBOX_TIMEOUT_SECONDS, 300),
    memory_limit_mb: positiveInt(process.env.SANDBOX_MEMORY_LIMIT, 512),
    cpu_limit: Math.max(0.1, Number(process.env.SANDBOX_CPU_LIMIT || "1.0")),
    pid_limit: positiveInt(process.env.SANDBOX_PID_LIMIT, 64),
    network_policy:
      (process.env.SANDBOX_NETWORK_POLICY || "DENY_ALL") === "ALLOW_SPECIFIC"
        ? "ALLOW_SPECIFIC"
        : "DENY_ALL",
    environment_allowlist: (
      process.env.SANDBOX_ENVIRONMENT_ALLOWLIST || "NODE_ENV,PATH"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    max_output_bytes: positiveInt(
      process.env.SANDBOX_MAX_OUTPUT_BYTES,
      1048576,
    ),
    max_files_changed: positiveInt(process.env.SANDBOX_MAX_FILES_CHANGED, 100),
    max_total_bytes_written: positiveInt(
      process.env.SANDBOX_MAX_TOTAL_BYTES_WRITTEN,
      10485760,
    ),
  };
}

/**
 * Sandbox Service — manages the complete external execution lifecycle:
 * 1. SandboxHandoffReceived
 * 2. SandboxAdmissionVerified
 * 3. SandboxCreated
 * 4. ExecutionStarted
 * 5. ExecutionCompleted
 * 6. ExecutionEvidenceRecorded
 * 7. SandboxHashCreated
 * 8. SandboxHashVerified
 * 9. SandboxCleaned
 *
 * Excludes all execution metadata from confirmed_package.core.
 */
export class SandboxService {
  private memoryEvidence = new Map<string, ExecutionEvidence>();

  constructor(
    private contracts: CanonicalContractSkill,
    private events?: ProcessingEventBus,
    private runner: SandboxRunner = new HardenedProcessRunner(),
    private root = resolve(process.env.ONESHOT_ROOT || process.cwd(), "data/sandbox-workspaces"),
  ) {
    mkdirSync(this.root, { recursive: true });
  }

  private ev(
    runId: string,
    processor: string,
    state: "PENDING" | "RUNNING" | "COMPLETE",
    data: {
      result?: "PASSED" | "ROOT_CAUSE" | "VALID" | "NOT_VALID";
      artifact_id?: string;
      message?: string;
    } = {},
  ): void {
    this.events?.emit(runId, processor, state, {
      scope: "SANDBOX",
      ...data,
    });
  }

  getEvidence(runId: string): ExecutionEvidence | undefined {
    return this.memoryEvidence.get(runId);
  }

  async execute(input: SandboxExecutionInput): Promise<SandboxExecutionResult> {
    const runId = input.confirmed_package?.core?.plan?.plan_id?.replace(/^plan:/, "") || `sbx-${randomUUID()}`;
    const defaultAuth = loadDefaultAuthorization();
    const auth: ExecutionAuthorization = {
      ...defaultAuth,
      ...input.execution_authorization,
      execution_id: input.execution_authorization?.execution_id || `exec:${runId}`,
    };

    // --- 1. SandboxHandoffReceived ---
    this.ev(runId, "SandboxHandoffReceived", "COMPLETE", {
      artifact_id: input.hash,
      message: `execution_id=${auth.execution_id}`,
    });

    // --- 2. SandboxAdmissionVerified ---
    this.ev(runId, "SandboxAdmissionVerified", "RUNNING");
    let admission;
    try {
      admission = await verifySandboxAdmission(input, this.contracts);
      this.ev(runId, "SandboxAdmissionVerified", "COMPLETE", {
        result: "VALID",
        artifact_id: admission.recomputed_hash,
      });
    } catch (err) {
      const rc: RootCause =
        err instanceof WorkflowRootCauseError
          ? err.rootCause
          : {
              issue: "Sandbox admission verification failed",
              expected: "Valid immutable confirmed package and matching canonical hash",
              actual: err instanceof Error ? err.message : String(err),
              evidence_ids: ["sandbox-admission"],
              required_correction: "Provide valid confirmed package and canonical HASH",
              recheck_target: "sandbox admission",
            };

      this.ev(runId, "SandboxAdmissionVerified", "COMPLETE", {
        result: "ROOT_CAUSE",
        message: rc.actual,
      });

      return {
        result: "ROOT_CAUSE",
        execution_id: auth.execution_id,
        root_cause: rc,
      };
    }

    // --- 3. SandboxCreated ---
    const sandboxId = `sandbox:${runId}:${randomUUID()}`;
    const workspacePath = join(this.root, sandboxId.replace(/[^a-zA-Z0-9_-]/g, "_"));
    mkdirSync(workspacePath, { recursive: true });

    this.ev(runId, "SandboxCreated", "COMPLETE", {
      artifact_id: sandboxId,
      message: `workspace=${workspacePath}`,
    });

    const startedAt = new Date().toISOString();

    // --- 4. ExecutionStarted ---
    this.ev(runId, "ExecutionStarted", "COMPLETE", {
      artifact_id: sandboxId,
      message: `timeout=${auth.timeout_seconds}s memory=${auth.memory_limit_mb}MB`,
    });

    const runnerResult = await this.runner.execute(
      sandboxId,
      workspacePath,
      input.confirmed_package.core.plan,
      auth,
    );

    const completedAt = new Date().toISOString();

    // --- 5. ExecutionCompleted ---
    this.ev(runId, "ExecutionCompleted", "COMPLETE", {
      result: runnerResult.condition === "success" ? "PASSED" : "ROOT_CAUSE",
      message: `exit_codes=${runnerResult.exit_codes.join(",")}`,
    });

    // --- 6. ExecutionEvidenceRecorded & Hash Recomputation ---
    const hashSandbox = await this.contracts.createHash(input.confirmed_package.core);

    const evidence: ExecutionEvidence = {
      execution_id: auth.execution_id,
      sandbox_id: sandboxId,
      confirmed_package_hash: input.hash,
      started_at: startedAt,
      completed_at: completedAt,
      commands: runnerResult.commands,
      exit_codes: runnerResult.exit_codes,
      stdout_refs: runnerResult.stdout_lines.map((_, i) => `stdout:${auth.execution_id}:${i + 1}`),
      stderr_refs: runnerResult.stderr_lines.map((_, i) => `stderr:${auth.execution_id}:${i + 1}`),
      file_changes: runnerResult.file_changes,
      bytes_written: runnerResult.bytes_written,
      resource_usage: runnerResult.resource_usage,
      timeout_evidence: runnerResult.timeout_evidence,
      environment_allowlist_used: runnerResult.environment_allowlist_used,
      network_policy_used: runnerResult.network_policy_used,
      cleanup_result: {
        workspace_cleaned: false,
        processes_terminated: runnerResult.cleanup_result.processes_terminated,
      },
      hash_sandbox: hashSandbox,
    };

    this.memoryEvidence.set(runId, evidence);

    this.ev(runId, "ExecutionEvidenceRecorded", "COMPLETE", {
      artifact_id: `evidence:${auth.execution_id}`,
      message: `bytes_written=${evidence.bytes_written} duration=${evidence.resource_usage.duration_ms}ms`,
    });

    // --- 7. SandboxHashCreated ---
    this.ev(runId, "SandboxHashCreated", "COMPLETE", {
      artifact_id: hashSandbox,
    });

    // --- 8. SandboxHashVerified ---
    const hashMatched = hashSandbox === input.hash;
    this.ev(runId, "SandboxHashVerified", "COMPLETE", {
      result: hashMatched ? "PASSED" : "ROOT_CAUSE",
      artifact_id: hashSandbox,
      message: `hash_matched=${hashMatched}`,
    });

    // --- 9. SandboxCleaned ---
    const cleaned = await this.runner.cleanup(sandboxId, workspacePath);
    evidence.cleanup_result.workspace_cleaned = cleaned;

    this.ev(runId, "SandboxCleaned", "COMPLETE", {
      artifact_id: sandboxId,
      message: `workspace_cleaned=${cleaned}`,
    });

    // Evaluate failure conditions
    if (runnerResult.condition === "timeout") {
      return {
        result: "ROOT_CAUSE",
        execution_id: auth.execution_id,
        sandbox_id: sandboxId,
        evidence,
        root_cause: {
          issue: "Sandbox execution timeout exceeded",
          expected: `Execution completes within ${auth.timeout_seconds}s`,
          actual: `Execution timed out after ${runnerResult.timeout_evidence?.elapsed_seconds || auth.timeout_seconds}s`,
          evidence_ids: [`evidence:${auth.execution_id}`],
          required_correction: "Optimize execution steps or increase authorized timeout limit",
          recheck_target: sandboxId,
        },
      };
    }

    if (runnerResult.condition === "resource_exhausted") {
      return {
        result: "ROOT_CAUSE",
        execution_id: auth.execution_id,
        sandbox_id: sandboxId,
        evidence,
        root_cause: {
          issue: "Sandbox resource limits exceeded",
          expected: `Files changed <= ${auth.max_files_changed} and bytes written <= ${auth.max_total_bytes_written}`,
          actual: `Files changed = ${runnerResult.file_changes.length}, bytes written = ${runnerResult.bytes_written}`,
          evidence_ids: [`evidence:${auth.execution_id}`],
          required_correction: "Adjust workload output volume or authorized resource limits",
          recheck_target: sandboxId,
        },
      };
    }

    if (runnerResult.condition === "failure" || runnerResult.exit_codes.some((c) => c !== 0)) {
      return {
        result: "ROOT_CAUSE",
        execution_id: auth.execution_id,
        sandbox_id: sandboxId,
        evidence,
        root_cause: {
          issue: "Sandbox command execution failure",
          expected: "All execution steps exit with code 0",
          actual: `Commands exited with codes: ${runnerResult.exit_codes.join(", ")}. Stderr: ${runnerResult.stderr_lines.join(" ").slice(0, 500)}`,
          evidence_ids: [`evidence:${auth.execution_id}`],
          required_correction: "Review stderr diagnostics and plan step commands",
          recheck_target: sandboxId,
        },
      };
    }

    if (!hashMatched) {
      return {
        result: "ROOT_CAUSE",
        execution_id: auth.execution_id,
        sandbox_id: sandboxId,
        evidence,
        root_cause: {
          issue: "Sandbox verification hash mismatch",
          expected: input.hash,
          actual: hashSandbox,
          evidence_ids: [`evidence:${auth.execution_id}`],
          required_correction: "Recompute sandbox hash from exact confirmed immutable core",
          recheck_target: sandboxId,
        },
      };
    }

    return {
      result: "PASSED",
      execution_id: auth.execution_id,
      sandbox_id: sandboxId,
      evidence,
      hash_sandbox: hashSandbox,
      hash_matched: true,
    };
  }
}
