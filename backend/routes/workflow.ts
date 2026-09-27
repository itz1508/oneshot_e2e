import { OneShotWorkflowEngine } from "../../packages/agent-runtime/src/index.js";
import type { RouteHandler } from "./types.js";

export const handleWorkflowRoutes: RouteHandler = async (req, res, ctx) => {
  const { pathname, parseBody, workflowEngine, sessionLedger, todoManager, sessions } = ctx;

  // Workflow Stages & Status
  if (pathname === "/api/pipeline/stages" && req.method === "GET") {
    const gate1 = workflowEngine.getGate1();
    const gate2 = workflowEngine.getGate2();
    const currentStage = workflowEngine.getCurrentStage();

    const ENGINE_ORDER = ["research", "planning", "gap_analysis", "evaluation", "builder"];
    const currentIndex = ENGINE_ORDER.indexOf(currentStage);

    const ENGINE_FOR: Record<string, string | null> = {
      research: "research",
      planning: "planning",
      gap: "gap_analysis",
      evaluation: "evaluation",
      build: "builder",
      refactor: null,
    };

    const statusFor = (displayId: string): string => {
      const engineStage = ENGINE_FOR[displayId];
      if (engineStage === null) return "waiting";
      const index = ENGINE_ORDER.indexOf(engineStage);
      if (index === currentIndex) return "active";
      return index < currentIndex ? "completed" : "waiting";
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      currentStage,
      stages: [
        { id: "research", name: "Research & Explore", status: statusFor("research"), kind: "run", todos: ["Understand user prompt requirements", "Formulate search queries", "Index primary documentation sources"] },
        { id: "review", name: "Gate 1: Research Review", status: gate1.status === "CONFIRMED" ? "confirmed" : "pending", kind: "pause", todos: ["Present findings and evidence", "Obtain human confirmation before planner"] },
        { id: "planning", name: "Plan Architecture", status: statusFor("planning"), kind: "run", todos: ["Validate schema contracts", "Verify partition boundaries", "Generate atomic plan package"] },
        { id: "refactor", name: "Refactor Strategy", status: statusFor("refactor"), kind: "run", todos: ["Audit imports and caller graph", "Preserve public exports"] },
        { id: "gap", name: "Gap Analysis", status: statusFor("gap"), kind: "run", todos: ["Reconcile active code against source of truth", "Enforce invariant contracts"] },
        { id: "evaluation", name: "Evaluation & Tests", status: statusFor("evaluation"), kind: "run", todos: ["Execute unit tests", "Run browser E2E verification"] },
        { id: "build_ready", name: "Gate 2: Build Ready", status: gate2.status === "CONFIRMED" ? "confirmed" : "waiting", kind: "pause", todos: ["Hash confirmed core representation", "Obtain human authorization for build"] },
        { id: "build", name: "Builder & Output", status: statusFor("build"), kind: "run", todos: ["Apply certified patches", "Verify static export bundle"] },
      ],
    }));
    return true;
  }

  // Human Invariant Gate Confirmation
  if ((pathname === "/api/pipeline/gate/confirm" || pathname === "/api/gate/confirm") && req.method === "POST") {
    const body = await parseBody(req);
    const gateId = body.gateId ?? "gate-1";

    if (gateId !== "gate-1" && gateId !== "gate-2") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "Unknown gate. Expected 'gate-1' or 'gate-2'.",
        received: gateId,
      }));
      return true;
    }

    if (gateId === "gate-2" && (body.packageCore === undefined || body.packageCore === null)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "Gate 2 confirmation requires a 'packageCore' object to bind the SHA-256 hash.",
      }));
      return true;
    }

    const confirmed =
      gateId === "gate-1"
        ? workflowEngine.confirmGate1("user")
        : workflowEngine.confirmGate2(body.packageCore, "user");

    sessionLedger.recordAuditHook("on_gate_check", {
      gateId: confirmed.gateId,
      status: confirmed.status,
      confirmedAt: confirmed.confirmedAt,
      packageHash: confirmed.packageHash,
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      gateId: confirmed.gateId,
      name: confirmed.name,
      status: confirmed.status,
      confirmedAt: confirmed.confirmedAt,
      confirmedBy: confirmed.confirmedBy,
      packageHash: confirmed.packageHash ?? null,
    }));
    return true;
  }

  // Active-Only Hierarchical Todo Chain
  if (pathname === "/api/todos/active" && req.method === "GET") {
    const snapshot = todoManager.getSnapshot();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(snapshot));
    return true;
  }

  // Live Execution Telemetry
  if (pathname === "/api/telemetry" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      tokens: 1420,
      tokensPerSecond: 64.2,
      stepLatencyMs: 380,
      toolCalls: sessionLedger.getAuditHookLogs().length,
      uptimeSeconds: Math.round(process.uptime()),
    }));
    return true;
  }

  // Session checkpoints
  if (pathname === "/api/session/checkpoints" && req.method === "GET") {
    const checkpoints = sessionLedger.getAllCheckpoints();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ checkpoints }));
    return true;
  }

  if (pathname === "/api/session/restore" && req.method === "POST") {
    const body = await parseBody(req);
    const restoreId = body.restoreId;
    if (typeof restoreId !== "string" || !restoreId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "restoreId is required" }));
      return true;
    }
    const restoreRes = sessionLedger.restoreToCheckpoint(restoreId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      restored: restoreRes.success,
      restoreId,
      checkpoint: restoreRes.checkpoint,
      timestamp: new Date().toISOString(),
      auditLogs: sessionLedger.getAuditHookLogs(),
    }));
    return true;
  }

  if (pathname === "/api/session/fork" && req.method === "POST") {
    const body = await parseBody(req);
    const originMessageId = body.messageId || "msg-001";
    const forkResult = sessionLedger.forkBranch(originMessageId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(forkResult));
    return true;
  }

  if (pathname === "/api/session/new" && req.method === "POST") {
    const newEngine = new OneShotWorkflowEngine();
    Object.assign(workflowEngine, newEngine);
    const sessionId = `session-${Date.now().toString().slice(-4)}`;
    sessions.set(sessionId, { id: sessionId, title: "New chat", messages: [] });
    sessionLedger.recordAuditHook("on_stage_transition", {
      action: "session_created",
      sessionId,
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      sessionId,
      stage: workflowEngine.getCurrentStage(),
      timestamp: new Date().toISOString(),
    }));
    return true;
  }

  if (pathname === "/api/session/clear" && req.method === "POST") {
    const newEngine = new OneShotWorkflowEngine();
    Object.assign(workflowEngine, newEngine);
    const body = await parseBody(req);
    const sessionId = body.sessionId || sessionLedger.getActiveSessionId();
    if (sessionId && sessions.has(sessionId)) {
      sessions.get(sessionId)!.messages = [];
    }
    sessionLedger.recordAuditHook("on_stage_transition", {
      action: "history_cleared",
      sessionId,
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      cleared: true,
      sessionId,
      timestamp: new Date().toISOString(),
    }));
    return true;
  }

  if (pathname === "/api/session/audit-logs" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      logs: sessionLedger.getAuditHookLogs(),
    }));
    return true;
  }

  return false;
};
