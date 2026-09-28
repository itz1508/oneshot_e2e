import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import {
  readImageAttachmentTool,
  tavilySearchBackend,
} from "../../packages/agent-runtime/src/index.js";
import { WorkflowService } from "../services/workflow-service.js";
import { sendJson, sendError } from "./helpers.js";
import type { RouteHandler } from "./types.js";

export const handleFixtureRoutes: RouteHandler = async (req, res, ctx) => {
  const { pathname, parseBody, validateRealFixture, workflowEngine, sessionLedger, todoManager, gitStorage, port } = ctx;

  // Repository Contract Fixtures Discovery & State
  if (pathname === "/api/fixtures" && req.method === "GET") {
    const fixturesDir = path.resolve(process.cwd(), "app/fixtures");
    try {
      const files = await fs.readdir(fixturesDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));
      const fixturesList = [];
      for (const file of jsonFiles) {
        const relPath = `app/fixtures/${file}`;
        const absPath = path.join(fixturesDir, file);
        const buf = await fs.readFile(absPath);
        const hash = `sha256:${crypto.createHash("sha256").update(buf).digest("hex")}`;
        let parsed: any = {};
        try {
          parsed = JSON.parse(buf.toString("utf-8"));
        } catch {}
        fixturesList.push({
          id: parsed.fixture_id || file.replace(".json", ""),
          fixture_id: parsed.fixture_id || file.replace(".json", ""),
          name: parsed.name || parsed.description || file,
          file: relPath,
          path: relPath,
          description: parsed.description || "",
          version: parsed.version || "1.0.0",
          hash,
          byteLength: buf.length,
          targetFinding: parsed.targetFinding || "INVARIANT-OK",
          partitions: parsed.partitions || ["/workspace/", "/scratch/", "/memories/", "/artifacts/"],
          prompt: parsed.prompt || `Audit and verify ${file} contract integrity`,
        });
      }
      return sendJson(res, 200, { ok: true, fixtures: fixturesList });
    } catch (err: any) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  // Contract Fixture Validation Endpoint
  if (pathname === "/api/fixture/validate" && req.method === "POST") {
    const body = await parseBody(req);
    const valRes = await validateRealFixture({
      fixture_id: body.fixture_id,
      sessionId: body.sessionId || (req.headers["x-session-id"] as string) || "session-local",
      path: body.path,
      expectedHash: body.expectedHash,
    });
    return sendJson(res, valRes.ok ? 200 : 422, valRes);
  }

  // Tool Execution Endpoints
  if ((pathname === "/api/tools/execute" || pathname === "/api/tool/execute") && req.method === "POST") {
    const body = await parseBody(req);
    const { toolName, input } = body;
    let result: any;

    if (toolName === "workflow_transition") {
      const transitionRes = WorkflowService.transitionStage(workflowEngine, input?.targetStage);
      if (!transitionRes.ok && transitionRes.status === 400) {
        return sendError(res, 400, transitionRes.error!, { received: transitionRes.received });
      }

      sessionLedger.recordAuditHook("on_stage_transition", {
        targetStage: input?.targetStage,
        result: transitionRes.result,
      });

      if (transitionRes.ok) {
        todoManager.updateSubtaskState("skill-plan", "t3", "done");
        todoManager.updateSubtaskState("skill-plan", "t4", "active");
      }

      if (!transitionRes.ok) {
        return sendJson(res, 409, {
          success: false,
          toolName: "workflow_transition",
          fromStage: transitionRes.result?.fromStage,
          toStage: transitionRes.result?.toStage,
          error: transitionRes.result?.error,
        });
      }

      result = {
        fromStage: transitionRes.result?.fromStage,
        toStage: transitionRes.result?.toStage,
        detail: `STAGE_TRANSITION_SUCCESS: Moved from ${transitionRes.result?.fromStage} to ${transitionRes.result?.toStage}`,
      };
    } else if (toolName === "workflow_gate_status") {
      const currentGate2 = workflowEngine.getGate2();
      const latestCheckpoint = sessionLedger.getAllCheckpoints().at(-1);
      result = {
        workflowStage: workflowEngine.getCurrentStage(),
        gate1Status: workflowEngine.getGate1().status,
        gate2Status: currentGate2.status,
        confirmedPackageCore: currentGate2.packageHash || null,
        restorePoint: latestCheckpoint?.restoreId || null,
      };
    } else if (toolName === "tavily_search") {
      if (!tavilySearchBackend.isConfigured()) {
        return sendJson(res, 503, {
          success: false,
          toolName: "tavily_search",
          error: "Research search is currently unavailable because TAVILY_API_KEY is not configured.",
        });
      }
      result = await tavilySearchBackend.search(input?.query || "OneShot architecture");
    } else if (toolName === "git_snapshot") {
      const snap = await gitStorage.createSnapshot({ stage: "checkpoint" });
      result = { snapshotId: snap.id, stage: snap.stage, timestamp: snap.timestamp, status: "SNAPSHOT_COMMITTED" };
    } else if (toolName === "validate_fixtures") {
      const valRes = await validateRealFixture({
        fixture_id: input?.fixture_id,
        sessionId: (input?.sessionId as string) || (req.headers["x-session-id"] as string) || "session-local",
        path: input?.path,
        expectedHash: input?.expectedHash,
      });
      result = {
        success: valRes.ok,
        fixture_id: valRes.fixture_id,
        session_id: valRes.session_id,
        path: valRes.path,
        status: valRes.status,
        actualHash: valRes.actualHash,
        expectedHash: valRes.expectedHash,
        auditTrail: valRes.auditTrail,
      };
    } else {
      return sendError(res, 400, `Unknown tool: ${toolName}`);
    }

    return sendJson(res, 200, { success: true, toolName, result });
  }

  return false;
};
