import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import type {
  FeatherlessConfig,
  FeatherlessResearchDraft,
  FeatherlessWorkerEvent,
} from "./types.js";

function defaultPython(projectRoot: string): string {
  if (process.env.ONESHOT_PYTHON) return process.env.ONESHOT_PYTHON;
  const venvPy = resolve(projectRoot, ".venv/Scripts/python.exe");
  if (existsSync(venvPy)) return venvPy;
  const uvPy = resolve(
    process.env.APPDATA || "",
    "uv/python/cpython-3.12.13-windows-x86_64-none/python.exe",
  );
  if (existsSync(uvPy)) return uvPy;
  return "python";
}

function pythonPath(projectRoot: string): string {
  const parts = [projectRoot, resolve(projectRoot, ".venv/Lib/site-packages")];
  if (process.env.PYTHONPATH) parts.push(process.env.PYTHONPATH);
  return parts.filter(Boolean).join(delimiter);
}

type Pending = {
  runId: string;
  resolve: (value: FeatherlessResearchDraft) => void;
  reject: (reason: unknown) => void;
  timer: NodeJS.Timeout;
};

export class FeatherlessWorker {
  private child?: ChildProcessWithoutNullStreams;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(
    private projectRoot: string,
    private config: FeatherlessConfig,
    private onEvent?: (runId: string, event: FeatherlessWorkerEvent) => void,
    private python = defaultPython(projectRoot),
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
      "backend/role/researcher/provider/featherless/worker.py",
    );
    const child = spawn(this.python, [script], {
      cwd: this.projectRoot,
      env: {
        ...process.env,
        FEATHERLESS_API_BASE: this.config.baseUrl,
        FEATHERLESS_MODEL: this.config.model,
        FEATHERLESS_TIMEOUT_SECONDS: String(this.config.timeoutSeconds),
        FEATHERLESS_MAX_TOKENS: String(this.config.maxTokens),
        FEATHERLESS_APP_URL: this.config.appUrl || "",
        ONESHOT_FEATHERLESS_TEST_DRAFT_FILE:
          this.config.testDraftFile || "",
        ONESHOT_FEATHERLESS_EMIT_EVENTS: "true",
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
            message.event as FeatherlessWorkerEvent,
          );
          continue;
        }

        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.ok) {
          pending.resolve(message.result as FeatherlessResearchDraft);
        } else {
          pending.reject(
            new Error(message.error || "Featherless worker failed"),
          );
        }
      }
    });

    let stderr = "";
    child.stderr.on("data", (data: string) => (stderr += data));
    child.on("exit", (code) => {
      this.rejectAll(
        new Error(`Featherless worker exited (${code}): ${stderr}`),
      );
      this.child = undefined;
    });
    child.on("error", (error) => this.rejectAll(error));
    return child;
  }

  async research(payload: {
    prompt: unknown;
    run_id: string;
    evidence?: unknown;
  }): Promise<FeatherlessResearchDraft> {
    const child = this.ensure();
    const id = this.nextId++;

    return await new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `Featherless request timed out after ${this.config.timeoutSeconds}s`,
          ),
        );
        if (this.child && !this.child.killed) {
          this.child.kill();
          this.child = undefined;
        }
      }, this.config.timeoutSeconds * 1000);

      this.pending.set(id, {
        runId: payload.run_id,
        resolve: resolvePromise,
        reject,
        timer,
      });
      child.stdin.write(
        JSON.stringify({ id, op: "research", payload }) + "\n",
      );
    });
  }

  close() {
    if (this.child && !this.child.killed) {
      this.child.stdin.end();
      this.child.kill();
    }
    this.child = undefined;
    this.rejectAll(new Error("Featherless worker closed"));
  }
}
