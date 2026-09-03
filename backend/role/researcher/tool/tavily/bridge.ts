import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { resolvePythonExecutable } from "../../../python-runtime.js";

export type TavilyRequest =
  | {
      op: "search";
      query: string;
      include_answer?: "basic" | "advanced" | false;
      search_depth?: "basic" | "advanced";
      max_results?: number;
    }
  | {
      op: "extract";
      urls: string[];
      query?: string;
      extract_depth?: "basic" | "advanced";
      format?: "markdown" | "text";
    }
  | {
      op: "research_stream";
      query: string;
      model?: "mini" | "pro" | "auto";
      citation_format?: "numbered" | "mla" | "apa" | "chicago";
    };

export interface TavilyRunner {
  run<T>(request: TavilyRequest): Promise<T>;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function redactSecret(text: string): string {
  const key = (process.env.TAVILY_API_KEY || "").trim();
  return key ? text.split(key).join("[REDACTED]") : text;
}

export class TavilyPythonRunner implements TavilyRunner {
  constructor(
    private projectRoot: string,
    private python = resolvePythonExecutable(projectRoot),
  ) {}

  async run<T>(request: TavilyRequest): Promise<T> {
    const script = resolve(
      this.projectRoot,
      "backend/role/researcher/tool/tavily/worker.py",
    );
    const timeoutSeconds = positiveInt(process.env.TAVILY_TIMEOUT_SECONDS, 180);

    return await new Promise<T>((resolvePromise, reject) => {
      const child = spawn(this.python, [script], {
        cwd: this.projectRoot,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let settled = false;

      const finish = (error?: Error, value?: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolvePromise(value as T);
      };

      const timer = setTimeout(() => {
        if (!child.killed) child.kill();
        finish(
          new Error(`Tavily ${request.op} timed out after ${timeoutSeconds}s`),
        );
      }, timeoutSeconds * 1000);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (data: string) => (stdout += data));
      child.stderr.on("data", (data: string) => (stderr += data));
      child.on("error", (error) => finish(error));
      child.on("exit", (code) => {
        const lines = stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        let envelope: any;
        try {
          envelope = lines.length ? JSON.parse(lines[lines.length - 1]) : undefined;
        } catch {
          envelope = undefined;
        }

        if (code !== 0 || !envelope?.ok) {
          const detail = envelope?.error || stderr || stdout || `exit code ${code}`;
          finish(new Error(redactSecret(`Tavily ${request.op} failed: ${detail}`)));
          return;
        }
        finish(undefined, envelope.result as T);
      });

      child.stdin.end(JSON.stringify(request));
    });
  }
}
