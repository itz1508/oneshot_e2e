import { OneShotWorkflowEngine } from "../../packages/agent-runtime/src/index.js";
import { WorkflowService } from "../services/workflow-service.js";
import { sendJson, sendError } from "./helpers.js";
import type { RouteHandler } from "./types.js";

export const handleWorkflowRoutes: RouteHandler = async (req, res, ctx) => {
  const { pathname, parseBody, workflowEngine, sessionLedger, todoManager, sessions } = ctx;

  // Workflow Stages & Status
  if (pathname === "/api/pipeline/stages" && req.method === "GET") {
    const stagesPayload = WorkflowService.getPipelineStages(workflowEngine);
    return sendJson(res, 200, stagesPayload);
  }

  // Human Invariant Gate Confirmation
  if ((pathname === "/api/pipeline/gate/confirm" || pathname === "/api/gate/confirm") && req.method === "POST") {
    const body = await parseBody(req);
    const gateResult = WorkflowService.confirmGate(
      workflowEngine,
      sessionLedger,
      body.gateId,
      body.packageCore
    );

    if (!gateResult.ok) {
      return sendError(
        res,
        gateResult.status,
        gateResult.error!,
        gateResult.received !== undefined ? { received: gateResult.received } : undefined
      );
    }

    return sendJson(res, 200, gateResult.result);
  }

  // Active-Only Hierarchical Todo Chain
  if (pathname === "/api/todos/active" && req.method === "GET") {
    const snapshot = todoManager.getSnapshot();
    return sendJson(res, 200, snapshot);
  }

  // Live Execution Telemetry
  if (pathname === "/api/telemetry" && req.method === "GET") {
    return sendJson(res, 200, {
      tokens: 1420,
      tokensPerSecond: 64.2,
      stepLatencyMs: 380,
      toolCalls: sessionLedger.getAuditHookLogs().length,
      uptimeSeconds: Math.round(process.uptime()),
    });
  }

  // Session checkpoints
  if (pathname === "/api/session/checkpoints" && req.method === "GET") {
    const checkpoints = sessionLedger.getAllCheckpoints();
    return sendJson(res, 200, { checkpoints });
  }

  if (pathname === "/api/session/restore" && req.method === "POST") {
    const body = await parseBody(req);
    const restoreId = body.restoreId;
    if (typeof restoreId !== "string" || !restoreId) {
      return sendError(res, 400, "restoreId is required");
    }
    const restoreRes = sessionLedger.restoreToCheckpoint(restoreId);
    return sendJson(res, 200, {
      restored: restoreRes.success,
      restoreId,
      checkpoint: restoreRes.checkpoint,
      timestamp: new Date().toISOString(),
      auditLogs: sessionLedger.getAuditHookLogs(),
    });
  }

  if (pathname === "/api/session/fork" && req.method === "POST") {
    const body = await parseBody(req);
    const originMessageId = body.messageId || "msg-001";
    const forkResult = sessionLedger.forkBranch(originMessageId);
    return sendJson(res, 200, forkResult);
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
    return sendJson(res, 200, {
      ok: true,
      sessionId,
      stage: workflowEngine.getCurrentStage(),
      timestamp: new Date().toISOString(),
    });
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
    return sendJson(res, 200, {
      ok: true,
      cleared: true,
      sessionId,
      timestamp: new Date().toISOString(),
    });
  }

  if (pathname === "/api/session/audit-logs" && req.method === "GET") {
    return sendJson(res, 200, {
      logs: sessionLedger.getAuditHookLogs(),
    });
  }

  return false;
};
