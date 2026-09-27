import {
  createLiveModel,
  createMainAgent,
  streamStrandsToAgUi,
  formatAgUiSse,
} from "../../packages/agent-runtime/src/index.js";
import { streamPythonReasoning } from "../python-runtime.js";
import type { RouteHandler } from "./types.js";

const REASONING_TASKS = [
  "researcher",
  "planner",
  "gap-analysis",
  "evaluation",
  "critic",
  "general",
] as const;
type ReasoningTask = (typeof REASONING_TASKS)[number];

export const handleStreamRoutes: RouteHandler = async (req, res, ctx) => {
  const { pathname, parseBody, getSessionProvider, isConfiguredKey } = ctx;

  if ((pathname === "/invocations" || pathname === "/api/agent/stream") && req.method === "POST") {
    const parsed = await parseBody(req);
    const prompt = (parsed.prompt || parsed.messages?.[parsed.messages.length - 1]?.content || "").trim();
    const sessionId = (req.headers["x-session-id"] as string) || "default";

    if (!prompt) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing prompt" }));
      return true;
    }

    const sessionCfg = getSessionProvider(sessionId);
    const resolvedProvider = parsed.provider || sessionCfg.provider;
    const resolvedModel = parsed.model || sessionCfg.model ||
      (resolvedProvider === "gemini" ? process.env.GEMINI_MODEL || "gemini-2.5-flash" :
       resolvedProvider === "openai" ? process.env.OPENAI_MODEL || "gpt-4o-mini" :
       resolvedProvider === "mistral" ? process.env.MISTRAL_MODEL || "mistral-large-latest" :
       resolvedProvider === "ollama" ? process.env.OLLAMA_MODEL || "llama3.2" :
       "moonshotai/Kimi-K2.5");
    const resolvedBaseUrl = sessionCfg.baseUrl ||
      (resolvedProvider === "nebius" ? "https://api.studio.nebius.com/v1/" :
       resolvedProvider === "mistral" ? process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1" :
       resolvedProvider === "ollama" ? process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1" :
       resolvedProvider === "openai" ? process.env.OPENAI_BASE_URL || "" : "");

    const rawKey =
      sessionCfg.apiKey ||
      (resolvedProvider === "gemini" ? process.env.GEMINI_API_KEY :
       resolvedProvider === "openai" ? process.env.OPENAI_API_KEY :
       resolvedProvider === "mistral" ? process.env.MISTRAL_API_KEY :
       resolvedProvider === "ollama" ? "ollama" :
       process.env.NEBIUS_API_KEY) || "";

    const isLive =
      (isConfiguredKey(rawKey) || resolvedProvider === "ollama") &&
      resolvedProvider !== "mock" &&
      resolvedProvider !== "sample" &&
      process.env.ONESHOT_MODE !== "sample";

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    });

    const ac = new AbortController();
    req.on("aborted", () => ac.abort());
    res.on("close", () => {
      if (!res.writableEnded) ac.abort();
    });

    if (isLive) {
      try {
        const liveModel = createLiveModel({
          apiKey: rawKey,
          modelId: resolvedModel,
          baseUrl: resolvedBaseUrl || undefined,
        });

        const agent = createMainAgent({ model: liveModel });

        for await (const event of streamStrandsToAgUi({ agent, prompt, signal: ac.signal })) {
          if (ac.signal.aborted) break;
          res.write(formatAgUiSse(event));
        }
        res.end();
      } catch (err: any) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        } else {
          if (!res.writableEnded) {
            res.write(formatAgUiSse({
              type: "RUN_FINISH",
              runId: `run-${Date.now().toString(36)}`,
              timestamp: new Date().toISOString(),
              status: "FAILED",
              error: err.message || "Agent execution failed",
            }));
            res.end();
          }
        }
      }
      return true;
    }

    // === LOCAL PYTHON REASONER FALLBACK ===
    try {
      const runId = `run-${Date.now().toString(36)}`;
      const nowIso = () => new Date().toISOString();
      const emitDelta = (text: string) => {
        if (ac.signal.aborted) return;
        res.write(formatAgUiSse({
          type: "TEXT_MESSAGE_DELTA",
          runId,
          timestamp: nowIso(),
          delta: text,
        }));
      };

      res.write(formatAgUiSse({
        type: "RUN_START",
        runId,
        timestamp: nowIso(),
        agentName: "OneShot Local Python Reasoner",
      }));
      res.write(formatAgUiSse({
        type: "STEP_START",
        runId,
        timestamp: nowIso(),
        stepId: "python-reasoning",
        label: "Python reasoning subprocess",
      }));

      const requestedTask = (parsed as Record<string, unknown>).useResearch === true
        ? "researcher"
        : (parsed as Record<string, unknown>).useDesignPlanning === true
          ? "planner"
          : (parsed as Record<string, unknown>).task;
      const task: ReasoningTask = REASONING_TASKS.includes(requestedTask as ReasoningTask)
        ? (requestedTask as ReasoningTask)
        : "general";

      let receivedDelta = false;
      for await (const delta of streamPythonReasoning({ runId, prompt, task }, ac.signal)) {
        if (ac.signal.aborted) break;
        receivedDelta = true;
        emitDelta(delta);
      }

      res.write(formatAgUiSse({
        type: "STEP_FINISH",
        runId,
        timestamp: nowIso(),
        stepId: "python-reasoning",
        label: "Python reasoning subprocess",
        status: receivedDelta ? "completed" : "failed",
      }));
      res.write(formatAgUiSse({
        type: "RUN_FINISH",
        runId,
        timestamp: nowIso(),
        status: receivedDelta ? "COMPLETED" : "FAILED",
        error: receivedDelta ? undefined : "The local Python reasoner returned no output.",
      }));
      res.end();
    } catch (err: any) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      } else {
        if (!res.writableEnded) {
          res.write(formatAgUiSse({
            type: "RUN_FINISH",
            runId: `run-${Date.now().toString(36)}`,
            timestamp: new Date().toISOString(),
            status: "FAILED",
            error: err.message || "Python reasoning failed",
          }));
          res.end();
        }
      }
    }
    return true;
  }

  return false;
};
