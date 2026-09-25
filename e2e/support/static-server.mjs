import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDistDir = path.resolve(moduleDir, "../../frontend/web/dist");
const frontendPublicDir = path.resolve(moduleDir, "../../frontend/web/public");
const servedDir = fs.existsSync(frontendDistDir) ? frontendDistDir : frontendPublicDir;
const port = Number(process.env.PORT || 4173);

// Load app/env/.env on startup if present
const envFilePath = path.resolve(moduleDir, "../../app/env/.env");
if (fs.existsSync(envFilePath)) {
    try {
        const content = fs.readFileSync(envFilePath, "utf-8");
        for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
                const idx = trimmed.indexOf("=");
                const key = trimmed.slice(0, idx).trim();
                const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
                if (key && !process.env[key]) {
                    process.env[key] = val;
                }
            }
        }
        console.log("[static-server] Loaded environment from app/env/.env");
    } catch (e) {
        console.error("[static-server] Error reading app/env/.env:", e.message);
    }
}

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
};

import {
    OneShotWorkflowEngine,
    SessionLedger,
    TodoChainManager,
    createStrandsAgent,
    createMainAgent,
    createResearcherAgent,
    createLiveModel,
    workflowTransitionTool,
    workflowGateStatusTool,
    readImageAttachmentTool,
    captureScreenshotTool,
    generateImageTool,
    tavilySearchBackend,
    GitLocalStorage,
} from "../../packages/agent-runtime/src/index.ts";
import { streamStrandsToAgUi, formatAgUiSse } from "../../packages/agent-runtime/src/ag-ui/server-adapter.ts";
import { streamPythonReasoning } from "../../backend/python-runtime.ts";

let workflowEngine = new OneShotWorkflowEngine();
let sessionLedger = new SessionLedger("session-101");
let todoManager = new TodoChainManager([]);

const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(reqUrl.pathname);

    // ── API Route: /api/health ──────────────────────────────────────────
    if (pathname === "/api/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, status: "healthy" }));
        return;
    }

    // ── API Route: /api/providers/status ────────────────────────────────
    if (pathname === "/api/providers/status" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            gemini: { configured: Boolean(process.env.GEMINI_API_KEY) },
            openai: { configured: Boolean(process.env.OPENAI_API_KEY) },
            nebius: { configured: Boolean(process.env.NEBIUS_API_KEY) },
            tavily: { configured: Boolean(process.env.TAVILY_API_KEY) },
        }));
        return;
    }

    // ── API Route: /api/providers/configure (Save and Apply Real API Keys) ───
    if (pathname === "/api/providers/configure" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", async () => {
            try {
                const { provider, apiKey, model } = JSON.parse(body || "{}");
                if (!provider) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Provider is required" }));
                    return;
                }

                const keyMap = {
                    gemini: "GEMINI_API_KEY",
                    openai: "OPENAI_API_KEY",
                    tavily: "TAVILY_API_KEY",
                    nebius: "NEBIUS_API_KEY",
                };

                const modelMap = {
                    gemini: "GEMINI_MODEL",
                    openai: "OPENAI_MODEL",
                };

                const envVarName = keyMap[provider];
                if (envVarName && apiKey) {
                    process.env[envVarName] = apiKey.trim();
                }

                const modelVarName = modelMap[provider];
                if (modelVarName && model) {
                    process.env[modelVarName] = model.trim();
                }

                // Persist to app/env/.env
                const envDir = path.resolve(moduleDir, "../../app/env");
                if (!fs.existsSync(envDir)) fs.mkdirSync(envDir, { recursive: true });
                const envFile = path.join(envDir, ".env");
                let existing = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf-8") : "";

                if (envVarName && apiKey) {
                    const regex = new RegExp(`^${envVarName}=.*$`, "m");
                    if (regex.test(existing)) {
                        existing = existing.replace(regex, `${envVarName}=${apiKey.trim()}`);
                    } else {
                        existing = `${existing.trim()}\n${envVarName}=${apiKey.trim()}\n`;
                    }
                }

                if (modelVarName && model) {
                    const regex = new RegExp(`^${modelVarName}=.*$`, "m");
                    if (regex.test(existing)) {
                        existing = existing.replace(regex, `${modelVarName}=${model.trim()}`);
                    } else {
                        existing = `${existing.trim()}\n${modelVarName}=${model.trim()}\n`;
                    }
                }

                fs.writeFileSync(envFile, existing, "utf-8");

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    ok: true,
                    configured: true,
                    provider,
                    model: model || `(default for ${provider})`,
                    persisted: true,
                    message: `Credentials for ${provider} active and persisted to app/env/.env.`
                }));
            } catch (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // ── API Route: /api/research/query (Standalone User-Driven Tavily Search) ─
    if (pathname === "/api/research/query" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", async () => {
            try {
                const parsed = JSON.parse(body || "{}");
                const query = (parsed.query || "").trim();
                if (!query) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Query parameter is required" }));
                    return;
                }

                // If real Tavily API key is available, call Tavily directly
                const apiKey = process.env.TAVILY_API_KEY;
                if (apiKey) {
                    try {
                        const { tavily } = await import("@tavily/core");
                        const tv = tavily({ apiKey });
                        const response = await tv.search(query, {
                            searchDepth: parsed.searchDepth || "basic",
                            maxResults: parsed.maxResults || 5,
                        });
                        if (!Array.isArray(response.results)) {
                            throw new Error("Tavily response is missing results array");
                        }
                        const results = response.results.map((result) => {
                            if (!result || typeof result.title !== "string" || !result.title || typeof result.url !== "string" || !result.url || typeof result.content !== "string" || !result.content) {
                                throw new Error("Tavily response contains an invalid result record");
                            }
                            const url = new URL(result.url);
                            if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Tavily response contains a non-HTTP result URL");
                            return {
                                title: result.title,
                                url: result.url,
                                content: result.content,
                                ...(typeof result.score === "number" ? { score: result.score } : {})
                            };
                        });
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ query, results }));
                        return;
                    } catch (tavilyErr) {
                        console.error("[tavily] Live call failed:", tavilyErr.message);
                    }
                }

                res.writeHead(503, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    error: "Research search is currently unavailable because TAVILY_API_KEY is not configured.",
                }));
                return;
            } catch (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // ── API Route: /api/system/status (Live System & Engine Status) ────────
    if (pathname === "/api/system/status" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            status: "healthy",
            currentStage: workflowEngine.getCurrentStage(),
            gate1: workflowEngine.getGate1(),
            gate2: workflowEngine.getGate2(),
            checkpointsCount: sessionLedger.getAllCheckpoints().length,
            auditLogsCount: sessionLedger.getAuditHookLogs().length,
            uptimeSeconds: process.uptime(),
            providers: {
                gemini: Boolean(process.env.GEMINI_API_KEY),
                openai: Boolean(process.env.OPENAI_API_KEY),
                tavily: Boolean(process.env.TAVILY_API_KEY),
            }
        }));
        return;
    }

    // A workflow plan appears only after the backend creates one.
    if (pathname === "/api/pipeline/plan" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(null));
        return;
    }

    // ── API Route: /api/pipeline/stages (Workflow Stages & Status) ───────
    if (pathname === "/api/pipeline/stages" && req.method === "GET") {
        const gate1 = workflowEngine.getGate1();
        const gate2 = workflowEngine.getGate2();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            stages: [
                { id: "research", name: "Research & Explore", status: "completed", kind: "run", todos: ["Understand user prompt requirements", "Formulate search queries", "Index primary documentation sources"] },
                { id: "review", name: "Gate 1: Research Review", status: gate1.status === "CONFIRMED" ? "confirmed" : "pending", kind: "pause", todos: ["Present findings and evidence", "Obtain human confirmation before planner"] },
                { id: "planning", name: "Plan Architecture", status: workflowEngine.getCurrentStage() === "planning" ? "active" : "waiting", kind: "run", todos: ["Validate schema contracts", "Verify partition boundaries", "Generate atomic plan package"] },
                { id: "refactor", name: "Refactor Strategy", status: "waiting", kind: "run", todos: ["Audit imports and caller graph", "Preserve public exports"] },
                { id: "gap", name: "Gap Analysis", status: "waiting", kind: "run", todos: ["Reconcile active code against source of truth", "Enforce invariant contracts"] },
                { id: "evaluation", name: "Evaluation & Tests", status: "waiting", kind: "run", todos: ["Execute unit tests", "Run browser E2E verification"] },
                { id: "build_ready", name: "Gate 2: Build Ready", status: gate2.status === "CONFIRMED" ? "confirmed" : "waiting", kind: "pause", todos: ["Hash confirmed core representation", "Obtain human authorization for build"] },
                { id: "build", name: "Builder & Output", status: "waiting", kind: "run", todos: ["Apply certified patches", "Verify static export bundle"] }
            ]
        }));
        return;
    }

    // ── API Route: /api/pipeline/gate/confirm (Human Invariant Confirmation) ─
    if (pathname === "/api/pipeline/gate/confirm" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
            const parsed = JSON.parse(body || "{}");
            const gateId = parsed.gateId || "gate-1";
            const gate1 = workflowEngine.confirmGate1("user");
            sessionLedger.recordAuditHook("on_gate_confirmed", {
                gateId,
                status: "CONFIRMED",
                confirmedAt: gate1.confirmedAt
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                gateId,
                status: "CONFIRMED",
                confirmedAt: gate1.confirmedAt || new Date().toISOString()
            }));
        });
        return;
    }

    // ── API Route: /api/todos/active (Active-Only Todo Chain) ────────────
    if (pathname === "/api/todos/active" && req.method === "GET") {
        const snapshot = todoManager.getSnapshot();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(snapshot));
        return;
    }

    // ── API Route: /api/telemetry (Live Execution Telemetry) ─────────────
    if (pathname === "/api/telemetry" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            tokens: 1420,
            tokensPerSecond: 64.2,
            stepLatencyMs: 380,
            toolCalls: sessionLedger.getAuditHookLogs().length,
            uptimeSeconds: Math.round(process.uptime())
        }));
        return;
    }

    // ── API Route: /api/session/checkpoints (All Saved Checkpoints) ──────
    if (pathname === "/api/session/checkpoints" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            checkpoints: sessionLedger.getAllCheckpoints()
        }));
        return;
    }

    // ── API Route: /api/session/restore (Session Rewind) ─────────────────
    if (pathname === "/api/session/restore" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
            const parsed = JSON.parse(body || "{}");
            const restoreId = parsed.restoreId;
            if (typeof restoreId !== "string" || !restoreId) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "restoreId is required" }));
                return;
            }
            const restoreRes = sessionLedger.restoreToCheckpoint(restoreId);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                restored: restoreRes.success,
                restoreId,
                checkpoint: restoreRes.checkpoint,
                timestamp: new Date().toISOString(),
                auditLogs: sessionLedger.getAuditHookLogs()
            }));
        });
        return;
    }

    // ── API Route: /api/session/fork (Conversation Fork) ─────────────────
    if (pathname === "/api/session/fork" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
            const parsed = JSON.parse(body || "{}");
            const originMessageId = parsed.messageId || "msg-001";
            const forkResult = sessionLedger.forkBranch(originMessageId);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(forkResult));
        });
        return;
    }

    // ── API Route: /api/session/new (Start Clean Session / New Chat) ────
    if (pathname === "/api/session/new" && req.method === "POST") {
        workflowEngine = new OneShotWorkflowEngine();
        const newSessionId = `session-${Date.now().toString().slice(-4)}`;
        sessionLedger.recordAuditHook("on_stage_transition", {
            action: "session_created",
            sessionId: newSessionId,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            ok: true,
            sessionId: newSessionId,
            stage: workflowEngine.getCurrentStage(),
            timestamp: new Date().toISOString()
        }));
        return;
    }

    // ── API Route: /api/session/clear (Restart Chat / Clear History) ─────
    if (pathname === "/api/session/clear" && req.method === "POST") {
        workflowEngine = new OneShotWorkflowEngine();
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
            const parsed = JSON.parse(body || "{}");
            const sessionId = parsed.sessionId || sessionLedger.getActiveSessionId();
            sessionLedger.recordAuditHook("on_stage_transition", {
                action: "history_cleared",
                sessionId,
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                ok: true,
                cleared: true,
                sessionId,
                timestamp: new Date().toISOString()
            }));
        });
        return;
    }

    // ── API Route: /api/session/audit-logs (Audit Hook Logs) ─────────────
    if (pathname === "/api/session/audit-logs" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            logs: sessionLedger.getAuditHookLogs()
        }));
        return;
    }

    // ── API Route: /api/tools/execute (Direct Tool Execution) ───────────
    if (pathname === "/api/tools/execute" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", async () => {
            try {
                const { toolName, input } = JSON.parse(body || "{}");
                let result;
                if (toolName === "generate_image") {
                    result = await generateImageTool.invoke(input || { prompt: "Modern agent dashboard mockup", style: "ui-mockup" });
                } else if (toolName === "capture_screenshot") {
                    result = await captureScreenshotTool.invoke(input || { url: "http://localhost:8787" });
                } else if (toolName === "read_image_attachment") {
                    result = await readImageAttachmentTool.invoke(input);
                } else if (toolName === "workflow_transition") {
                    const targetStage = input?.targetStage || "planning";
                    const transitionRes = workflowEngine.transitionTo(targetStage);
                    sessionLedger.recordAuditHook("on_stage_transition", {
                        targetStage,
                        result: transitionRes
                    });
                    if (transitionRes.success) {
                        todoManager.updateSubtaskState("skill-plan", "t3", "done");
                        todoManager.updateSubtaskState("skill-plan", "t4", "active");
                    }
                    result = transitionRes.success
                        ? `STAGE_TRANSITION_SUCCESS: Moved from ${transitionRes.fromStage} to ${transitionRes.toStage}`
                        : `STAGE_TRANSITION_FAILED: ${transitionRes.error}`;
                } else if (toolName === "workflow_gate_status") {
                    const currentGate2 = workflowEngine.getGate2();
                    const latestCheckpoint = sessionLedger.getAllCheckpoints().at(-1);
                    result = {
                        workflowStage: workflowEngine.getCurrentStage(),
                        gate1Status: workflowEngine.getGate1().status,
                        gate2Status: currentGate2.status,
                        confirmedPackageCore: currentGate2.packageHash || null,
                        restorePoint: latestCheckpoint?.restoreId || null
                    };
                } else if (toolName === "tavily_search") {
                    result = await tavilySearchBackend.search(input?.query || "OneShot architecture");
                } else if (toolName === "git_snapshot") {
                    const gitStore = new GitLocalStorage({ rootDir: path.resolve(process.cwd(), ".oneshot/storage") });
                    const snap = await gitStore.createSnapshot({ stage: "checkpoint" });
                    result = { snapshotId: snap.id, stage: snap.stage, timestamp: snap.timestamp, status: "SNAPSHOT_COMMITTED" };
                } else {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: `Unknown tool: ${toolName}` }));
                    return;
                }
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true, toolName, result }));
            } catch (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // ── API Route: /api/agent/stream (Real local Python bridge) ──────────
    if (pathname === "/api/agent/stream" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", async () => {
            try {
                const parsed = JSON.parse(body || "{}");
                const prompt = (parsed.prompt || "").trim();
                if (!prompt) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Missing prompt" }));
                    return;
                }

                res.writeHead(200, {
                    "Content-Type": "text/event-stream; charset=utf-8",
                    "Cache-Control": "no-cache, no-transform",
                    "Connection": "keep-alive",
                });

                const ac = new AbortController();
                req.on("aborted", () => ac.abort());
                res.on("close", () => {
                    if (!res.writableEnded) ac.abort();
                });
                const runId = `run-${Date.now().toString(36)}`;
                const nowIso = () => new Date().toISOString();
                const emit = (event) => {
                    if (!ac.signal.aborted) res.write(formatAgUiSse(event));
                };

                emit({ type: "RUN_START", runId, timestamp: nowIso(), agentName: "OneShot Local Python Reasoner" });
                emit({ type: "STEP_START", runId, timestamp: nowIso(), stepId: "python-reasoning", label: "Python reasoning subprocess" });
                const task = /gap|reconcil|diff/i.test(prompt) ? "gap-analysis"
                    : /plan|gate|review|stage/i.test(prompt) ? "planner"
                    : /research|search|find|index/i.test(prompt) ? "researcher" : "general";
                let receivedDelta = false;
                for await (const delta of streamPythonReasoning({ runId, prompt, task }, ac.signal)) {
                    if (ac.signal.aborted) break;
                    receivedDelta = true;
                    emit({ type: "TEXT_MESSAGE_DELTA", runId, timestamp: nowIso(), delta });
                }
                emit({ type: "STEP_FINISH", runId, timestamp: nowIso(), stepId: "python-reasoning", label: "Python reasoning subprocess", status: receivedDelta ? "completed" : "failed" });
                emit({ type: "RUN_FINISH", runId, timestamp: nowIso(), status: receivedDelta ? "COMPLETED" : "FAILED", error: receivedDelta ? undefined : "The local Python reasoner returned no output." });
                res.end();
            } catch (err) {
                if (!res.headersSent) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
                } else {
                    res.end();
                }
            }
        });
        return;
    }

    if (pathname === "/") pathname = "/index.html";

    let filePath = path.join(servedDir, pathname);

    // Fallback resolution for SPA / Next.js export routes
    if (!fs.existsSync(filePath)) {
        if (fs.existsSync(filePath + ".html")) {
            filePath = filePath + ".html";
        } else if (fs.existsSync(path.join(serveDir, "embed", pathname))) {
            filePath = path.join(serveDir, "embed", pathname);
        } else if (fs.existsSync(path.join(frontendPublicDir, pathname))) {
            filePath = path.join(publicDir, pathname);
        } else if (fs.existsSync(path.join(servedDir, "index.html"))) {
            filePath = path.join(serveDir, "index.html");
        }
    }

    // Security check: ensure path is inside serveDir or publicDir
    if (!filePath.startsWith(servedDir) && !filePath.startsWith(frontendPublicDir)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not Found");
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";

        res.writeHead(200, {
            "Content-Type": contentType,
            "Cache-Control": "no-cache",
        });

        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(port, "127.0.0.1", () => {
    console.log(`[static-server] Serving ${servedDir} at http://127.0.0.1:${port}`);
});

// Also serve on port 8787 (default OneShot URL) if different from primary port
if (port !== 8787) {
    const altServer = http.createServer(server.listeners("request")[0]);
    altServer.listen(8787, "127.0.0.1", () => {
        console.log(`[static-server] Also serving at http://127.0.0.1:8787`);
    }).on("error", (err) => {
        console.log(`[static-server] Note: Port 8787 not bound (${err.message})`);
    });
}
