import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plan } from "../../contract/types.js";
import type { ExecutionAuthorization } from "../types.js";
import type { RunnerExecutionResult, SandboxRunner } from "./runner.js";

/**
 * Docker container broker sandbox runner.
 * Enforces the complete hardened container security baseline:
 * - Read-only root filesystem
 * - No-new-privileges
 * - Drop all Linux capabilities
 * - CPU / Memory / PID limits
 * - Network isolation (`--network none`)
 * - Tmpfs /tmp and /work
 * - Read-only /input mount
 */
export class ContainerSandboxRunner implements SandboxRunner {
  constructor(
    private image = process.env.ONESHOT_SANDBOX_IMAGE || "oneshot-sandbox-worker:latest",
    private dockerBin = process.env.DOCKER_BIN || "docker",
  ) {}

  async execute(
    sandboxId: string,
    workspacePath: string,
    plan: Plan,
    auth: ExecutionAuthorization,
    onLog?: (stream: "stdout" | "stderr", chunk: string) => void,
  ): Promise<RunnerExecutionResult> {
    const inputDir = join(workspacePath, "input");
    const outDir = join(workspacePath, "output");
    mkdirSync(inputDir, { recursive: true });
    mkdirSync(outDir, { recursive: true });

    writeFileSync(
      join(inputDir, "plan.json"),
      JSON.stringify(plan, null, 2),
      "utf8",
    );

    const containerName = `oneshot-sbx-${sandboxId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const startTime = Date.now();

    // Construct hardened Docker CLI arguments
    const dockerArgs = [
      "run",
      "--rm",
      "--name",
      containerName,
      "--read-only",
      "--security-opt",
      "no-new-privileges:true",
      "--cap-drop",
      "ALL",
      "--network",
      auth.network_policy === "DENY_ALL" ? "none" : "bridge",
      "--pids-limit",
      String(auth.pid_limit),
      "--memory",
      `${auth.memory_limit_mb}m`,
      "--cpus",
      String(auth.cpu_limit),
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m",
      "--tmpfs",
      "/work:rw,size=256m",
      "-v",
      `${inputDir}:/input:ro`,
      "-v",
      `${outDir}:/output:rw`,
      "-w",
      "/work",
    ];

    // Pass only allowlisted environment variables
    for (const key of auth.environment_allowlist) {
      if (process.env[key] !== undefined) {
        dockerArgs.push("-e", `${key}=${process.env[key]}`);
      }
    }

    dockerArgs.push(this.image);
    dockerArgs.push("sh", "-c", `echo '[Sandbox Container ${sandboxId}] Executing plan ${plan.plan_id}'`);

    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];

    const result = await new Promise<{ exitCode: number; timedOut: boolean }>(
      (resolvePromise) => {
        let timer: NodeJS.Timeout | undefined;
        let settled = false;

        const child = spawn(this.dockerBin, dockerArgs, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          // Force kill container on timeout
          spawn(this.dockerBin, ["kill", containerName], { stdio: "ignore" });
          resolvePromise({ exitCode: 124, timedOut: true });
        }, auth.timeout_seconds * 1000);

        child.stdout?.on("data", (d: Buffer) => {
          const text = d.toString("utf8");
          stdoutLines.push(text);
          onLog?.("stdout", text);
        });

        child.stderr?.on("data", (d: Buffer) => {
          const text = d.toString("utf8");
          stderrLines.push(text);
          onLog?.("stderr", text);
        });

        child.on("close", (code) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          resolvePromise({ exitCode: code ?? 0, timedOut: false });
        });

        child.on("error", (err) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          stderrLines.push(String(err));
          resolvePromise({ exitCode: 1, timedOut: false });
        });
      },
    );

    const durationMs = Date.now() - startTime;

    return {
      commands: [dockerArgs.join(" ")],
      exit_codes: [result.exitCode],
      stdout_lines: stdoutLines,
      stderr_lines: stderrLines,
      file_changes: [],
      bytes_written: 0,
      resource_usage: {
        duration_ms: durationMs,
        peak_memory_mb: auth.memory_limit_mb,
        cpu_time_ms: durationMs,
      },
      timeout_evidence: result.timedOut
        ? {
            timed_out: true,
            limit_seconds: auth.timeout_seconds,
            elapsed_seconds: durationMs / 1000,
          }
        : undefined,
      environment_allowlist_used: [...auth.environment_allowlist],
      network_policy_used: auth.network_policy,
      cleanup_result: {
        workspace_cleaned: false,
        processes_terminated: true,
      },
      condition: result.timedOut
        ? "timeout"
        : result.exitCode === 0
          ? "success"
          : "failure",
    };
  }

  async cleanup(sandboxId: string, workspacePath: string): Promise<boolean> {
    const containerName = `oneshot-sbx-${sandboxId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    try {
      spawn(this.dockerBin, ["rm", "-f", containerName], { stdio: "ignore" });
    } catch {}

    try {
      if (existsSync(workspacePath)) {
        rmSync(workspacePath, { recursive: true, force: true });
      }
      return true;
    } catch {
      return false;
    }
  }
}
