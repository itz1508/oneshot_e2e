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

function parsePythonReasoningResponse(
  value: unknown,
  expectedRunId: string,
  expectedTask: string,
): PythonReasoningResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Python reasoning response must be a JSON object");
  }
  const payload = value as Record<string, unknown>;
  if (payload.run_id !== expectedRunId || payload.task !== expectedTask) {
    throw new Error(`Python reasoning correlation mismatch: expected ${expectedRunId}/${expectedTask}, received ${String(payload.run_id)}/${String(payload.task)}`);
  }
  if (payload.success !== true || typeof payload.confidence !== "number" || payload.confidence < 0 || payload.confidence > 1) {
    throw new Error("Python reasoning response failed its success/confidence contract");
  }
  if (!Array.isArray(payload.analysis) || !payload.analysis.every((item) => typeof item === "string")) {
    throw new Error("Python reasoning response analysis must be a string array");
  }
  if (!Array.isArray(payload.findings) || !payload.findings.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const finding = item as Record<string, unknown>;
    return typeof finding.code === "string" && typeof finding.severity === "string" && typeof finding.message === "string";
  })) {
    throw new Error("Python reasoning response findings failed their object contract");
  }
  if (!Array.isArray(payload.risks) || !payload.risks.every((item) => typeof item === "string") ||
      !Array.isArray(payload.missing_evidence) || !payload.missing_evidence.every((item) => typeof item === "string") ||
      typeof payload.recommendation !== "string" || !payload.recommendation) {
    throw new Error("Python reasoning response risks/evidence/recommendation failed their contract");
  }
  return payload as unknown as PythonReasoningResponse;
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

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        throw new Error(`Python reasoning stream returned invalid JSON: ${error instanceof Error ? error.message : "parse error"}`);
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Python reasoning stream event must be a JSON object");
      }
      const event = parsed as Record<string, unknown>;
      if (event.type === "delta" && typeof event.text === "string") {
        yield event.text;
      } else if (event.type === "done") {
        finalResponse = parsePythonReasoningResponse(event.response, input.runId, input.task || "general");
      } else {
        throw new Error(`Python reasoning stream returned unsupported event ${String(event.type)}`);
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
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Python reasoning HTTP returned non-JSON content (HTTP ${res.status})`);
    }
    let payload: unknown;
    try {
      payload = await res.json();
    } catch (error) {
      throw new Error(`Python reasoning HTTP returned invalid JSON: ${error instanceof Error ? error.message : "parse error"}`);
    }
    return parsePythonReasoningResponse(payload, input.runId, input.task || "general");
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
    throw new Error("Python reasoning process ended without a final response");
  }
  return finalResp;
}
