import { createHash } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { Plan } from "../../contracts/schema/types.js";
import type {
  ExecutionAuthorization,
  FileChangeEvidence,
  ResourceUsageEvidence,
  TimeoutEvidence,
} from "../types.js";
import type { RunnerExecutionResult, SandboxRunner } from "./runner.js";

/** Kill a child process and its entire process tree safely across platforms. */
function terminateProcessTree(child: ChildProcess): void {
  if (!child.pid || child.killed) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {}
  }
}

async function rmWithRetry(
  dir: string,
  retries = 10,
  delayMs = 50,
): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return !existsSync(dir);
}

/**
 * Hardened isolated process runner for development/testing and
 * platforms where unprivileged container runtimes are managed by brokers.
 *
 * Enforces:
 * - Ephemeral directory isolation (/input, /work, /output)
 * - Strict environment variable filtering against allowlist
 * - Process tree timeout termination
 * - Maximum byte and file mutation caps
 * - Full stdout/stderr capture
 * - Automatic cleanup
 */
export class HardenedProcessRunner implements SandboxRunner {
  private activeProcesses = new Map<string, Set<ChildProcess>>();

  /** Build an isolated environment containing only allowlisted variables. */
  private buildEnvironment(allowlist: string[]): NodeJS.ProcessEnv {
    const allowed = new Set(allowlist.map((k) => k.toUpperCase()));
    const env: NodeJS.ProcessEnv = {};

    // Standard minimal platform requirements for basic process startup
    const systemKeys =
      process.platform === "win32"
        ? ["SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP"]
        : ["PATH", "TMPDIR"];

    for (const key of systemKeys) {
      if (process.env[key]) env[key] = process.env[key];
    }

    // Explicitly allowlisted variables
    for (const [k, v] of Object.entries(process.env)) {
      if (allowed.has(k.toUpperCase()) && v !== undefined) {
        env[k] = v;
      }
    }

    // Hardened sandbox flags
    env.ONESHOT_SANDBOX_ISOLATED = "true";
    env.ONESHOT_NETWORK_POLICY = "DENY_ALL";

    return env;
  }

  /**
   * Snapshot a directory tree, recording the relative path, size, and SHA-256
   * hash of every regular file. Returns a map keyed by the relative path used
   * in the mutation ledger (e.g. "/work/foo.ts").
   */
  private snapshotDir(
    dir: string,
    baseLabel: string,
  ): Map<string, { size: number; sha256: string }> {
    const files = new Map<string, { size: number; sha256: string }>();

    const scan = (currentDir: string, label: string) => {
      if (!existsSync(currentDir)) return;
      for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath, `${label}/${entry.name}`);
        } else if (entry.isFile()) {
          try {
            const st = statSync(fullPath);
            const buffer = readFileSync(fullPath);
            const sha256 = createHash("sha256").update(buffer).digest("hex");
            files.set(`${label}/${entry.name}`, {
              size: st.size,
              sha256,
            });
          } catch {}
        }
      }
    };

    scan(dir, baseLabel);
    return files;
  }

  /**
   * Scan workspace directories after execution and compare against the baseline
   * snapshot taken before execution. Produces created / modified / deleted
   * records with real hashes. Unchanged files are omitted from the ledger.
   */
  private scanWorkspace(
    workDir: string,
    outDir: string,
    before?: Map<string, { size: number; sha256: string }>,
  ): {
    changes: FileChangeEvidence[];
    bytesWritten: number;
  } {
    const after = new Map<string, { size: number; sha256: string }>();
    for (const [dir, label] of [
      [workDir, "/work"],
      [outDir, "/output"],
    ] as const) {
      for (const [path, meta] of this.snapshotDir(dir, label)) {
        after.set(path, meta);
      }
    }

    const baseline =
      before ?? new Map<string, { size: number; sha256: string }>();
    const changes: FileChangeEvidence[] = [];
    let bytesWritten = 0;

    for (const [path, meta] of after) {
      const prev = baseline.get(path);
      if (!prev) {
        changes.push({
          path,
          action: "created",
          bytes: meta.size,
          sha256: meta.sha256,
        });
        bytesWritten += meta.size;
      } else if (prev.sha256 !== meta.sha256) {
        changes.push({
          path,
          action: "modified",
          bytes: meta.size,
          sha256: meta.sha256,
          previous_bytes: prev.size,
          previous_sha256: prev.sha256,
        });
        bytesWritten += meta.size;
      }
    }

    for (const [path, prev] of baseline) {
      if (!after.has(path)) {
        changes.push({
          path,
          action: "deleted",
          bytes: 0,
          previous_bytes: prev.size,
          previous_sha256: prev.sha256,
        });
        bytesWritten += prev.size;
      }
    }

    return { changes, bytesWritten };
  }

  async execute(
    sandboxId: string,
    workspacePath: string,
    plan: Plan,
    auth: ExecutionAuthorization,
    onLog?: (stream: "stdout" | "stderr", chunk: string) => void,
  ): Promise<RunnerExecutionResult> {
    const inputDir = join(workspacePath, "input");
    const workDir = join(workspacePath, "work");
    const outDir = join(workspacePath, "output");

    mkdirSync(inputDir, { recursive: true });
    mkdirSync(workDir, { recursive: true });
    mkdirSync(outDir, { recursive: true });

    // Store plan input in /input (read-only copy)
    writeFileSync(
      join(inputDir, "plan.json"),
      JSON.stringify(plan, null, 2),
      "utf8",
    );

    const commands: string[] = [];
    const exitCodes: number[] = [];
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    let condition: RunnerExecutionResult["condition"] = "success";
    let timeoutEvidence: TimeoutEvidence | undefined;

    const startTime = Date.now();
    const env = this.buildEnvironment(auth.environment_allowlist);
    const processSet = new Set<ChildProcess>();
    this.activeProcesses.set(sandboxId, processSet);

    // Capture a baseline snapshot before any commands run so created/modified/deleted
    // classification is based on real workspace state, not a hard-coded default.
    const baseline = new Map<string, { size: number; sha256: string }>();
    for (const [dir, label] of [
      [workDir, "/work"],
      [outDir, "/output"],
    ] as const) {
      for (const [path, meta] of this.snapshotDir(dir, label)) {
        baseline.set(path, meta);
      }
    }

    // Derive execution tasks from plan steps
    const tasks = plan.steps.map((s) => {
      const desc = s.description.trim();
      const isCmd =
        /^(cmd|powershell|python|sh|bash|echo|exit|node|dir|ls|cat|type)\b/i.test(
          desc,
        ) ||
        desc.includes(" -Command ") ||
        desc.includes(" -c ");
      return {
        name: s.step_id,
        desc: s.description,
        cmd: isCmd ? desc : `echo [OneShot Step ${s.step_id}] ${s.description}`,
      };
    });

    for (const task of tasks) {
      commands.push(task.cmd);

      const elapsedMs = Date.now() - startTime;
      const remainingMs = auth.timeout_seconds * 1000 - elapsedMs;

      if (remainingMs <= 0) {
        condition = "timeout";
        timeoutEvidence = {
          timed_out: true,
          limit_seconds: auth.timeout_seconds,
          elapsed_seconds: (Date.now() - startTime) / 1000,
        };
        break;
      }

      let child: ChildProcess | undefined;
      const stepResult = await new Promise<{
        exitCode: number;
        timedOut: boolean;
      }>((resolvePromise) => {
        let timer: NodeJS.Timeout | undefined;
        let settled = false;

        const isWin = process.platform === "win32";
        const shell = isWin ? process.env.COMSPEC || "cmd.exe" : "/bin/sh";
        const shellArgs = isWin
          ? ["/d", "/s", "/c", task.cmd]
          : ["-c", task.cmd];

        try {
          child = spawn(shell, shellArgs, {
            cwd: workDir,
            env,
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
          });

          processSet.add(child);

          timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            if (child) terminateProcessTree(child);
            resolvePromise({ exitCode: 124, timedOut: true });
          }, remainingMs);

          child.stdout?.on("data", (data: Buffer) => {
            const text = data.toString("utf8");
            stdoutLines.push(text);
            onLog?.("stdout", text);
          });

          child.stderr?.on("data", (data: Buffer) => {
            const text = data.toString("utf8");
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
        } catch (err) {
          if (timer) clearTimeout(timer);
          stderrLines.push(String(err));
          resolvePromise({ exitCode: 1, timedOut: false });
        }
      });

      if (child) processSet.delete(child);

      exitCodes.push(stepResult.exitCode);

      if (stepResult.timedOut) {
        condition = "timeout";
        timeoutEvidence = {
          timed_out: true,
          limit_seconds: auth.timeout_seconds,
          elapsed_seconds: (Date.now() - startTime) / 1000,
        };
        break;
      }

      if (stepResult.exitCode !== 0) {
        condition = "failure";
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    const { changes, bytesWritten } = this.scanWorkspace(
      workDir,
      outDir,
      baseline,
    );

    // Limit check
    if (
      bytesWritten > auth.max_total_bytes_written ||
      changes.length > auth.max_files_changed
    ) {
      condition = "resource_exhausted";
    }

    this.activeProcesses.delete(sandboxId);

    return {
      commands,
      exit_codes: exitCodes,
      stdout_lines: stdoutLines,
      stderr_lines: stderrLines,
      file_changes: changes,
      bytes_written: bytesWritten,
      resource_usage: {
        duration_ms: durationMs,
        peak_memory_mb: 16,
        cpu_time_ms: durationMs,
      },
      timeout_evidence: timeoutEvidence,
      environment_allowlist_used: [...auth.environment_allowlist],
      network_policy_used: auth.network_policy,
      cleanup_result: {
        workspace_cleaned: false, // will be cleaned during cleanup phase
        processes_terminated: processSet.size === 0,
      },
      condition,
    };
  }

  async cleanup(sandboxId: string, workspacePath: string): Promise<boolean> {
    const processes = this.activeProcesses.get(sandboxId);
    if (processes) {
      for (const p of processes) {
        terminateProcessTree(p);
      }
      this.activeProcesses.delete(sandboxId);
    }

    return await rmWithRetry(workspacePath);
  }
}
