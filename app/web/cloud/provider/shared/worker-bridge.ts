import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";
import { resolvePythonExecutable } from "../../../../../backend/python-runtime.js";
import { pythonPath } from "./env.js";
import type { ProviderWorkerEvent, WorkerConfig } from "./types.js";

export interface NativeWorkerOptions<TConfig extends WorkerConfig> {
  /** Lower-case provider id used in error strings (e.g. "anthropic"). */
  provider: string;
  /** Display label used in error strings (e.g. "Anthropic"). */
  label: string;
  /** Worker script path relative to the project root. */
  scriptPath: string;
  /** Extra argv appended after the script path. */
  scriptArgs?: string[];
  /** Environment overlay for the spawned worker process. */
  buildEnv: (config: TConfig) => NodeJS.ProcessEnv;
  /**
   * Detail for the "worker exited" failure; defaults to a generic
   * server-side runtime dependency hint.
   */
  exitDetail?: (code: number | null, stderr: string) => string;
}

type Pending = {
  runId: string;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: NodeJS.Timeout;
};

/**
 * Line-delimited JSON request/response bridge to a spawned Python worker.
 * Requests time out and kill the child; worker events are forwarded verbatim.
 */
export class NativeWorkerBridge<TConfig extends WorkerConfig, THealth, TDraft> {
  private child?: ChildProcessWithoutNullStreams;
  private buffer = "";
  private stderrText = "";
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(
    private readonly projectRoot: string,
    protected readonly config: TConfig,
    private readonly options: NativeWorkerOptions<TConfig>,
    private readonly onEvent?: (
      runId: string,
      event: ProviderWorkerEvent,
    ) => void,
    private readonly python: string = resolvePythonExecutable(projectRoot),
  ) {}

  private rejectAll(reason: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(reason);
    }
    this.pending.clear();
  }

  private ensure() {
    if (this.child && !this.child.killed) return this.child;

    const script = resolve(this.projectRoot, this.options.scriptPath);
    const child = spawn(
      this.python,
      [script, ...(this.options.scriptArgs ?? [])],
      {
        cwd: this.projectRoot,
        env: this.options.buildEnv(this.config),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    this.child = child;
    this.stderrText = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (data: string) => {
      this.buffer += data;
      for (;;) {
        const newline = this.buffer.indexOf("\n");
        if (newline < 0) break;
        const line = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
        if (!line) continue;

        let message: any;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }

        const pending = this.pending.get(message.id);
        if (!pending) continue;
        if (message.event) {
          this.onEvent?.(pending.runId, message.event as ProviderWorkerEvent);
          continue;
        }

        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.ok) {
          pending.resolve(message.result);
        } else {
          pending.reject(
            new Error(message.error || `${this.options.label} worker failed`),
          );
        }
      }
    });

    child.stderr.on("data", (data: string) => (this.stderrText += data));
    child.on("exit", (code) => {
      this.rejectAll(
        new Error(
          this.options.exitDetail
            ? this.options.exitDetail(code, this.stderrText)
            : `${this.options.label} worker exited (${code}); check server-side runtime dependencies`,
        ),
      );
      this.child = undefined;
    });
    child.on("error", (error) => this.rejectAll(error));
    return child;
  }

  private async request<T>(
    op: "health" | "research",
    payload: unknown,
    runId: string,
  ): Promise<T> {
    const child = this.ensure();
    const id = this.nextId++;
    return await new Promise<T>((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `${this.options.label} ${op} timed out after ${this.config.timeoutSeconds}s`,
          ),
        );
        if (this.child && !this.child.killed) {
          this.child.kill();
          this.child = undefined;
        }
      }, this.config.timeoutSeconds * 1000);

      this.pending.set(id, {
        runId,
        resolve: (value) => resolvePromise(value as T),
        reject,
        timer,
      });
      child.stdin.write(JSON.stringify({ id, op, payload }) + "\n");
    });
  }

  async health(runId: string): Promise<THealth> {
    return await this.request<THealth>("health", {}, runId);
  }

  async research(payload: {
    prompt: unknown;
    run_id: string;
    evidence?: unknown;
  }): Promise<TDraft> {
    return await this.request<TDraft>("research", payload, payload.run_id);
  }

  close() {
    if (this.child && !this.child.killed) {
      this.child.stdin.end();
      this.child.kill();
    }
    this.child = undefined;
    this.rejectAll(new Error(`${this.options.label} worker closed`));
  }
}
