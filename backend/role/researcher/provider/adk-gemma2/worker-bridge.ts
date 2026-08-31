import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import type { AdkGemmaConfig, AdkResearchDraft, AdkWorkerNodeEvent } from "./types.js";

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
  resolve: (value: AdkResearchDraft) => void;
  reject: (reason: unknown) => void;
  timer: NodeJS.Timeout;
};

export class AdkGemmaWorker {
  private child?: ChildProcessWithoutNullStreams;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(
    private projectRoot: string,
    private config: AdkGemmaConfig,
    private onEvent?: (runId: string, event: AdkWorkerNodeEvent) => void,
    private python = defaultPython(projectRoot),
  ) {}

  private rejectAll(reason: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(reason);
    }
    this.pending.clear();
  }

  private ensure() {
    if (this.child && !this.child.killed) return this.child;
    const script = resolve(
      this.projectRoot,
      "backend/role/researcher/provider/adk-gemma2/worker.py",
    );
    const env = {
      ...process.env,
      OLLAMA_API_BASE: this.config.ollamaBaseUrl,
      GEMMA2_LOCAL_MODEL: this.config.model,
      GEMMA2_AUTO_PULL: String(this.config.autoPull),
      GEMMA2_TIMEOUT_SECONDS: String(this.config.timeoutSeconds),
      CACHE_URL: this.config.cacheUrl || "",
      CACHE_TTL: String(this.config.cacheTtlSeconds),
      ONESHOT_ADK_TEST_DRAFT_FILE: this.config.testDraftFile || "",
      ONESHOT_ADK_EMIT_EVENTS: "true",
      PYTHONPATH: pythonPath(this.projectRoot),
    };
    const child = spawn(this.python, [script], {
      cwd: this.projectRoot,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => {
      this.buffer += d;
      for (;;) {
        const i = this.buffer.indexOf("\n");
        if (i < 0) break;
        const line = this.buffer.slice(0, i).trim();
        this.buffer = this.buffer.slice(i + 1);
        if (!line) continue;
        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          // Ignore non-JSON stdout lines emitted by dependencies (e.g. LiteLLM banners/logs)
          continue;
        }
        const p = this.pending.get(msg.id);
        if (!p) continue;
        if (msg.event) {
          this.onEvent?.(p.runId, msg.event as AdkWorkerNodeEvent);
          continue;
        }
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        msg.ok
          ? p.resolve(msg.result as AdkResearchDraft)
          : p.reject(new Error(msg.error || "ADK Gemma worker failed"));
      }
    });
    let err = "";
    child.stderr.on("data", (d: string) => (err += d));
    child.on("exit", (code) => {
      this.rejectAll(
        new Error(`ADK Gemma worker exited (${code}): ${err}`),
      );
      this.child = undefined;
    });
    child.on("error", (e) => this.rejectAll(e));
    return child;
  }

  async research(payload: {
    prompt: unknown;
    run_id: string;
    evidence?: unknown;
  }): Promise<AdkResearchDraft> {
    const child = this.ensure(),
      id = this.nextId++,
      runId = payload.run_id;
    return await new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const error = new Error(
          `ADK Gemma request timed out after ${this.config.timeoutSeconds}s`,
        );
        reject(error);
        if (this.child && !this.child.killed) {
          this.child.kill();
          this.child = undefined;
        }
      }, this.config.timeoutSeconds * 1000);
      this.pending.set(id, { runId, resolve: resolvePromise, reject, timer });
      child.stdin.write(JSON.stringify({ id, op: "research", payload }) + "\n");
    });
  }

  close() {
    if (this.child && !this.child.killed) {
      this.child.stdin.end();
      this.child.kill();
    }
    this.child = undefined;
    this.rejectAll(new Error("ADK Gemma worker closed"));
  }
}
