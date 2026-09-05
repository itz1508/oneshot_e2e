import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { delimiter, resolve } from "node:path";
import { resolvePythonExecutable } from "../../../../python-runtime.js";
import type {
  AnthropicConfig,
  AnthropicResearchDraft,
  AnthropicWorkerEvent,
} from "./types.js";

function pythonPath(projectRoot: string): string {
  const parts = [projectRoot, resolve(projectRoot, ".venv/Lib/site-packages")];
  if (process.env.PYTHONPATH) parts.push(process.env.PYTHONPATH);
  return parts.filter(Boolean).join(delimiter);
}

type Pending = {
  runId: string;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: NodeJS.Timeout;
};

export interface AnthropicHealth {
  ready: boolean;
  provider: "anthropic";
  model: string;
  api_base: string;
  detail?: string;
}

export class AnthropicWorker {
  private child?: ChildProcessWithoutNullStreams;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(
    private projectRoot: string,
    private config: AnthropicConfig,
    private onEvent?: (runId: string, event: AnthropicWorkerEvent) => void,
    private python = resolvePythonExecutable(projectRoot),
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

    const script = resolve(
      this.projectRoot,
      "backend/role/researcher/provider/native_worker.py",
    );
    const child = spawn(this.python, [script, "anthropic"], {
      cwd: this.projectRoot,
      env: {
        ...process.env,
      ANTHROPIC_API_KEY: this.config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
      ANTHROPIC_TEMPERATURE: this.config.temperature === undefined ? "" : String(this.config.temperature),
        ANTHROPIC_API_BASE: this.config.baseUrl,
        ANTHROPIC_MODEL: this.config.model,
        ANTHROPIC_TIMEOUT_SECONDS: String(this.config.timeoutSeconds),
        ANTHROPIC_MAX_TOKENS: String(this.config.maxTokens),
        ONESHOT_ANTHROPIC_TEST_DRAFT_FILE:
          this.config.testDraftFile || "",
        ONESHOT_ANTHROPIC_EMIT_EVENTS: "true",
        PYTHONPATH: pythonPath(this.projectRoot),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
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
          this.onEvent?.(
            pending.runId,
            message.event as AnthropicWorkerEvent,
          );
          continue;
        }

        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.ok) {
          pending.resolve(message.result);
        } else {
          pending.reject(
            new Error(message.error || "Anthropic worker failed"),
          );
        }
      }
    });

    let stderr = "";
    child.stderr.on("data", (data: string) => (stderr += data));
    child.on("exit", (code) => {
      this.rejectAll(
        new Error(`Anthropic worker exited (${code}); check server-side runtime dependencies`),
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
            `Anthropic ${op} timed out after ${this.config.timeoutSeconds}s`,
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

  async health(runId: string): Promise<AnthropicHealth> {
    return await this.request<AnthropicHealth>("health", {}, runId);
  }

  async research(payload: {
    prompt: unknown;
    run_id: string;
    evidence?: unknown;
  }): Promise<AnthropicResearchDraft> {
    return await this.request<AnthropicResearchDraft>(
      "research",
      payload,
      payload.run_id,
    );
  }

  close() {
    if (this.child && !this.child.killed) {
      this.child.stdin.end();
      this.child.kill();
    }
    this.child = undefined;
    this.rejectAll(new Error("Anthropic worker closed"));
  }
}
