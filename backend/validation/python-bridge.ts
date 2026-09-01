import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { delimiter, resolve } from "node:path";
import { resolvePythonExecutable } from "../python-runtime.js";

const projectRoot = process.env.ONESHOT_ROOT || process.cwd();

function pythonPath(): string {
  const parts = [projectRoot, resolve(projectRoot, ".venv/Lib/site-packages")];
  if (process.env.PYTHONPATH) parts.push(process.env.PYTHONPATH);
  return parts.filter(Boolean).join(delimiter);
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

export class PythonBridge {
  private child?: ChildProcessWithoutNullStreams;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(private python = resolvePythonExecutable(projectRoot)) {}

  private ensure() {
    if (this.child && !this.child.killed) return this.child;
    const child = spawn(this.python, ["-m", "validation.rpc"], {
      cwd: projectRoot,
      env: {
        ...process.env,
        PYTHONPATH: pythonPath(),
      },
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
        const line = this.buffer.slice(0, i);
        this.buffer = this.buffer.slice(i + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as {
          id: number;
          ok: boolean;
          result?: unknown;
          error?: string;
          trace?: string;
        };
        const p = this.pending.get(msg.id);
        if (!p) continue;
        this.pending.delete(msg.id);
        msg.ok
          ? p.resolve(msg.result)
          : p.reject(new Error(`${msg.error}\n${msg.trace || ""}`));
      }
    });
    let err = "";
    child.stderr.on("data", (d: string) => (err += d));
    child.on("exit", (code) => {
      const reason = new Error(
        `Python validation worker exited (${code}): ${err}`,
      );
      for (const p of this.pending.values()) p.reject(reason);
      this.pending.clear();
      this.child = undefined;
    });
    child.on("error", (e) => {
      for (const p of this.pending.values()) p.reject(e);
      this.pending.clear();
    });
    return child;
  }

  async call<T>(command: string, payload: unknown): Promise<T> {
    const child = this.ensure();
    const id = this.nextId++;
    return await new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
      child.stdin.write(JSON.stringify({ id, command, payload }) + "\n");
    });
  }

  close() {
    if (this.child && !this.child.killed) {
      this.child.stdin.end();
      this.child.kill();
    }
    this.child = undefined;
  }
}
