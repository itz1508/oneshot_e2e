import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import {
  generateImageTool,
  captureScreenshotTool,
  readImageAttachmentTool,
  tavilySearchBackend,
  type WorkflowStage,
} from "../../packages/agent-runtime/src/index.js";
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
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, fixtures: fixturesList }));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return true;
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
    res.writeHead(valRes.ok ? 200 : 422, { "Content-Type": "application/json" });
    res.end(JSON.stringify(valRes));
    return true;
  }

  // Tool Execution Endpoints
  if ((pathname === "/api/tools/execute" || pathname === "/api/tool/execute") && req.method === "POST") {
    const body = await parseBody(req);
    const { toolName, input } = body;
    let result: any;

    if (toolName === "generate_image") {
      result = await generateImageTool.invoke(input || { prompt: "Modern agent dashboard mockup", style: "ui-mockup" });
    } else if (toolName === "capture_screenshot") {
      result = await captureScreenshotTool.invoke(input || { url: `http://localhost:${port}` });
    } else if (toolName === "read_image_attachment") {
      result = await readImageAttachmentTool.invoke(input);
    } else if (toolName === "workflow_transition") {
      const VALID_TARGETS = ["research", "planning", "gap_analysis", "evaluation", "builder"] as const;
      const requested = input?.targetStage;
      if (typeof requested !== "string" || !VALID_TARGETS.includes(requested as (typeof VALID_TARGETS)[number])) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: `workflow_transition requires targetStage. Valid: ${VALID_TARGETS.join(", ")}.`,
          received: requested ?? null,
        }));
        return true;
      }
      const targetStage = requested as WorkflowStage;
      const transitionRes = workflowEngine.transitionTo(targetStage);
      sessionLedger.recordAuditHook("on_stage_transition", {
        targetStage,
        result: transitionRes,
      });
      if (transitionRes.success) {
        todoManager.updateSubtaskState("skill-plan", "t3", "done");
        todoManager.updateSubtaskState("skill-plan", "t4", "active");
      }
      if (!transitionRes.success) {
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: false,
          toolName: "workflow_transition",
          fromStage: transitionRes.fromStage,
          toStage: transitionRes.toStage,
          error: transitionRes.error,
        }));
        return true;
      }
      result = {
        fromStage: transitionRes.fromStage,
        toStage: transitionRes.toStage,
        detail: `STAGE_TRANSITION_SUCCESS: Moved from ${transitionRes.fromStage} to ${transitionRes.toStage}`,
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
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: false,
          toolName: "tavily_search",
          error: "Research search is currently unavailable because TAVILY_API_KEY is not configured.",
        }));
        return true;
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
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Unknown tool: ${toolName}` }));
      return true;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, toolName, result }));
    return true;
  }

  return false;
};
