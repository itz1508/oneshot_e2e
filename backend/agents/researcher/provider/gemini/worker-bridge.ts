import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { delimiter, resolve } from "node:path";
import { resolvePythonExecutable } from "../../../../python-runtime.js";
import type {
  GeminiConfig,
  GeminiProviderHealth,
  GeminiResearchDraft,
  GeminiWorkerNodeEvent,
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

export class GeminiWorker {
  private child?: ChildProcessWithoutNullStreams;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(
    private projectRoot: string,
    private config: GeminiConfig,
    private onEvent?: (runId: string, event: GeminiWorkerNodeEvent) => void,
    private python = resolvePythonExecutable(projectRoot),
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
      "backend/role/researcher/provider/native_worker.py",
    );
    const env = {
      ...process.env,
      GEMINI_API_KEY: this.config.apiKey ?? process.env.GEMINI_API_KEY ?? "",
      GEMINI_TEMPERATURE: this.config.temperature === undefined ? "" : String(this.config.temperature),
      GEMINI_API_BASE: this.config.baseUrl || "https://generativelanguage.googleapis.com/v1beta",
      GEMINI_DISTRIBUTION_MODEL: this.config.distributionModel,
      GEMINI_RESEARCH_MODEL: this.config.researchModel,
      GEMINI_SYNTHESIS_MODEL: this.config.synthesisModel,
      GEMINI_TIMEOUT_SECONDS: String(this.config.timeoutSeconds),
      GOOGLE_CLOUD_PROJECT: this.config.googleCloudProject || "",
      GOOGLE_CLOUD_LOCATION: this.config.googleCloudLocation,
      GOOGLE_GENAI_USE_VERTEXAI: String(this.config.useVertexAi),
      CACHE_URL: this.config.cacheUrl || "",
      CACHE_TTL: String(this.config.cacheTtlSeconds),
      ONESHOT_GEMINI_TEST_DRAFT_FILE: this.config.testDraftFile || "",
      ONESHOT_GEMINI_EMIT_EVENTS: "true",
      PYTHONPATH: pythonPath(this.projectRoot),
    };
    const child = spawn(this.python, [script, "gemini"], {
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
          continue;
        }
        const p = this.pending.get(msg.id);
        if (!p) continue;
        if (msg.event) {
          this.onEvent?.(p.runId, msg.event as GeminiWorkerNodeEvent);
          continue;
        }
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        msg.ok
          ? p.resolve(msg.result)
          : p.reject(new Error(msg.error || "Gemini worker failed"));
      }
    });
    let err = "";
    child.stderr.on("data", (d: string) => (err += d));
    child.on("exit", (code) => {
      this.rejectAll(
        new Error(`Gemini worker exited (${code}); check server-side runtime dependencies`),
      );
      this.child = undefined;
    });
    child.on("error", (e) => this.rejectAll(e));
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
            `Gemini ${op} timed out after ${this.config.timeoutSeconds}s`,
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

  async health(runId: string): Promise<GeminiProviderHealth> {
    return await this.request<GeminiProviderHealth>("health", {}, runId);
  }

  async research(payload: {
    prompt: unknown;
    run_id: string;
    evidence?: unknown;
  }): Promise<GeminiResearchDraft> {
    return await this.request<GeminiResearchDraft>(
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
    this.rejectAll(new Error("Gemini worker closed"));
  }
}
