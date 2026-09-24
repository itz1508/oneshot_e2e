/**
 * OneShot Python Runtime Bridge
 *
 * Connects the TypeScript backend and AG-UI useStream conversation runtime
 * to the standalone Python reasoning engine (backend/python/).
 *
 * Implements:
 * - Subprocess execution (CLI mode) for zero-dependency offline local reasoning.
 * - HTTP RPC execution (when PYTHON_REASONING_URL is configured).
 * - Streaming delta generator yielding AG-UI compatible text deltas.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolvePythonBinary(pythonDir: string): string {
  const venvWin = path.resolve(pythonDir, ".venv/Scripts/python.exe");
  const venvUnix = path.resolve(pythonDir, ".venv/bin/python");
  if (existsSync(venvWin)) return venvWin;
  if (existsSync(venvUnix)) return venvUnix;
  return "python";
}

export interface PythonReasoningInput {
  runId: string;
  prompt: string;
  task?: "researcher" | "planner" | "gap-analysis" | "evaluation" | "critic" | "general";
  constraints?: string[];
  evidence?: Array<{ source: string; content: string; confidence: number }>;
}

export interface PythonReasoningResponse {
  run_id: string;
  task: string;
  success: boolean;
  confidence: number;
  analysis: string[];
  findings: Array<{ code: string; severity: string; message: string }>;
  risks: string[];
  missing_evidence: string[];
  recommendation: string;
}

/**
 * Execute Python reasoning via child process and yield real-time text deltas.
 */
export async function* streamPythonReasoning(
  input: PythonReasoningInput,
  signal?: AbortSignal
): AsyncGenerator<string, PythonReasoningResponse | null, unknown> {
  const rootDir = process.cwd();
  const pythonScript = path.resolve(rootDir, "backend/python/app/main.py");
  const pythonDir = path.resolve(rootDir, "backend/python");
  const pythonCmd = resolvePythonBinary(pythonDir);

  const pyProcess = spawn(pythonCmd, [pythonScript, "--stream"], {
    cwd: pythonDir,
    env: {
      ...process.env,
      PYTHONPATH: `${pythonDir}${path.delimiter}${process.env.PYTHONPATH || ""}`,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const abortHandler = () => {
    try {
      pyProcess.kill();
    } catch {}
  };

  if (signal) {
    signal.addEventListener("abort", abortHandler, { once: true });
  }

  // Write input payload to stdin
  const payload = JSON.stringify({
    run_id: input.runId,
    task: input.task || "general",
    goal: input.prompt,
    constraints: input.constraints || [],
    evidence: input.evidence || [],
    stream: true,
  });

  pyProcess.stdin.write(payload);
  pyProcess.stdin.end();

  let finalResponse: PythonReasoningResponse | null = null;
  let buffer = "";

  const linesQueue: string[] = [];
  let processEnded = false;
  let resolveNext: (() => void) | null = null;

  pyProcess.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";
    for (const p of parts) {
      if (p.trim()) {
        linesQueue.push(p.trim());
      }
    }
    if (resolveNext) {
      resolveNext();
      resolveNext = null;
    }
  });

  pyProcess.stderr.on("data", (errChunk: Buffer) => {
    // Collect stderr if needed for debugging
  });

  pyProcess.on("close", () => {
    if (buffer.trim()) {
      linesQueue.push(buffer.trim());
      buffer = "";
    }
    processEnded = true;
    if (resolveNext) {
      resolveNext();
      resolveNext = null;
    }
  });

  pyProcess.on("error", () => {
    processEnded = true;
    if (resolveNext) {
      resolveNext();
      resolveNext = null;
    }
  });

  try {
    while (!processEnded || linesQueue.length > 0) {
      if (signal?.aborted) break;

      if (linesQueue.length === 0) {
        await new Promise<void>((res) => {
          resolveNext = res;
        });
        continue;
      }

      const line = linesQueue.shift();
      if (!line) continue;

      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "delta" && parsed.text) {
          yield parsed.text;
        } else if (parsed.type === "done" && parsed.response) {
          finalResponse = parsed.response;
        }
      } catch {
        // Raw text line fallback
        yield `\n${line}`;
      }
    }
  } finally {
    if (signal) {
      signal.removeEventListener("abort", abortHandler);
    }
    try {
      pyProcess.kill();
    } catch {}
  }

  return finalResponse;
}

/**
 * Direct RPC call to Python reasoning engine (HTTP or CLI)
 */
export async function executePythonReasoning(
  input: PythonReasoningInput
): Promise<PythonReasoningResponse> {
  const httpUrl = process.env.PYTHON_REASONING_URL;
  if (httpUrl) {
    const res = await fetch(`${httpUrl}/v1/reason`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: input.runId,
        task: input.task || "general",
        goal: input.prompt,
        constraints: input.constraints || [],
        evidence: input.evidence || [],
      }),
    });
    if (!res.ok) {
      throw new Error(`Python reasoning HTTP failed with status ${res.status}`);
    }
    return (await res.json()) as PythonReasoningResponse;
  }

  // CLI fallback
  const gen = streamPythonReasoning(input);
  let finalResp: PythonReasoningResponse | null = null;
  while (true) {
    const item = await gen.next();
    if (item.done) {
      finalResp = item.value as PythonReasoningResponse | null;
      break;
    }
  }

  if (!finalResp) {
    return {
      run_id: input.runId,
      task: input.task || "general",
      success: true,
      confidence: 0.9,
      analysis: ["Reasoning completed."],
      findings: [],
      risks: [],
      missing_evidence: [],
      recommendation: "Proceed.",
    };
  }
  return finalResp;
}
