import { executePythonReasoning } from "../python-runtime.js";
import { WorkflowService } from "../services/workflow-service.js";
import { ProviderService } from "../services/provider-service.js";
import { ResearchService } from "../services/research-service.js";
import { sendJson, sendError } from "./helpers.js";
import type { RouteHandler } from "./types.js";

export const handleV2Routes: RouteHandler = async (req, res, ctx) => {
  const {
    pathname,
    parseBody,
    workflowEngine,
    sessionLedger,
    todoManager,
    sessions,
    providerConfigs,
    isConfiguredKey,
    validateRealFixture,
    getProviderRegistry,
  } = ctx;

  if (pathname.startsWith("/api/v2/") && req.method === "POST") {
    const operation = pathname.slice("/api/v2/".length).trim();
    const body = await parseBody(req);
    const sessionId = (req.headers["x-session-id"] as string) || body.sessionId || "default";

    // Operation 1: getStatus
    if (operation === "getStatus") {
      return sendJson(res, 200, {
        ok: true,
        operation: "getStatus",
        status: "healthy",
        currentStage: workflowEngine.getCurrentStage(),
        gate1: workflowEngine.getGate1(),
        gate2: workflowEngine.getGate2(),
        providers: getProviderRegistry(),
        activeSessions: sessions.size,
      });
    }

    // Operation 2: promptAgent (Unified Reasoning & Agent Invocation)
    if (operation === "promptAgent") {
      const prompt = body.prompt || body.goal || "";
      if (!prompt) {
        return sendError(res, 400, "prompt is required");
      }
      const runId = body.runId || `run_act_${Date.now().toString(36)}`;
      const pyRes = await executePythonReasoning({
        runId,
        prompt,
        task: body.task || "general",
        constraints: body.constraints || [],
        evidence: body.evidence || [],
      });
      return sendJson(res, 200, {
        ok: true,
        operation: "promptAgent",
        runId,
        response: pyRes,
      });
    }

    // Operation 3: executeTool
    if (operation === "executeTool") {
      const toolName = body.toolName;
      const input = body.input || {};
      if (toolName === "validate_fixtures") {
        const valRes = await validateRealFixture({
          fixture_id: input?.fixture_id,
          sessionId: input?.sessionId || sessionId,
          path: input?.path,
          expectedHash: input?.expectedHash,
        });
        return sendJson(res, valRes.ok ? 200 : 422, {
          ok: valRes.ok,
          operation: "executeTool",
          toolName,
          result: {
            success: valRes.ok,
            fixture_id: valRes.fixture_id,
            session_id: valRes.session_id,
            path: valRes.path,
            status: valRes.status,
            actualHash: valRes.actualHash,
            expectedHash: valRes.expectedHash,
          },
        });
      }
      if (toolName === "workflow_gate_status") {
        return sendJson(res, 200, {
          ok: true,
          operation: "executeTool",
          toolName,
          result: {
            workflowStage: workflowEngine.getCurrentStage(),
            gate1Status: workflowEngine.getGate1().status,
            gate2Status: workflowEngine.getGate2().status,
          },
        });
      }
      return sendError(res, 400, `Unsupported tool action: ${toolName}`);
    }

    // Operation 4: configureProvider
    if (operation === "configureProvider") {
      const { provider, apiKey, model } = body;
      const configRes = await ProviderService.configureProvider({
        provider,
        apiKey,
        model,
        sessionId,
        providerConfigs,
        isConfiguredKey,
        persistEnv: false,
      });

      if (!configRes.ok) {
        return sendError(res, configRes.status, configRes.error || "Configuration failed");
      }

      return sendJson(res, 200, {
        ok: true,
        operation: "configureProvider",
        configured: configRes.result!.configured,
        sessionId: configRes.result!.sessionId,
        provider: configRes.result!.provider,
        model: configRes.result!.model,
      });
    }

    // Operation 5: switchProvider
    if (operation === "switchProvider") {
      const { provider, model, apiKey, baseUrl } = body;
      const switchRes = ProviderService.switchProvider({
        provider,
        model,
        apiKey,
        baseUrl,
        sessionId,
        providerConfigs,
      });

      if (!switchRes.ok) {
        return sendError(res, switchRes.status, switchRes.error || "Switch failed");
      }

      return sendJson(res, 200, {
        ok: true,
        operation: "switchProvider",
        success: switchRes.result!.success,
        sessionId: switchRes.result!.sessionId,
        provider: switchRes.result!.provider,
        model: switchRes.result!.model,
      });
    }

    // Operation 6: transitionStage
    if (operation === "transitionStage") {
      const transitionRes = WorkflowService.transitionStage(workflowEngine, body.targetStage);
      if (!transitionRes.ok && transitionRes.status === 400) {
        return sendJson(res, 400, {
          ok: false,
          operation: "transitionStage",
          error: transitionRes.error,
          received: transitionRes.received,
        });
      }

      return sendJson(res, 200, {
        ok: transitionRes.ok,
        operation: "transitionStage",
        fromStage: transitionRes.result?.fromStage,
        toStage: transitionRes.result?.toStage,
        error: transitionRes.result?.error,
      });
    }

    // Operation 7: validateFixtures
    if (operation === "validateFixtures") {
      const valRes = await validateRealFixture({
        fixture_id: body.fixture_id,
        sessionId: body.sessionId || sessionId,
        path: body.path,
        expectedHash: body.expectedHash,
      });
      return sendJson(res, valRes.ok ? 200 : 422, {
        ok: valRes.ok,
        operation: "validateFixtures",
        fixture_id: valRes.fixture_id,
        session_id: valRes.session_id,
        path: valRes.path,
        status: valRes.status,
        actualHash: valRes.actualHash,
        expectedHash: valRes.expectedHash,
        auditTrail: valRes.auditTrail,
        metadata: valRes.metadata,
      });
    }

    // Operation 8: exportBundle (Portable Snapshot Extraction)
    if (operation === "exportBundle") {
      const bundle = await WorkflowService.exportBundle(workflowEngine, sessionLedger, todoManager);
      return sendJson(res, 200, {
        ok: true,
        operation: "exportBundle",
        item: bundle,
      });
    }

    // Operation 9: importBundle (Portable Snapshot Ingestion)
    if (operation === "importBundle") {
      const bundleData = body.bundleData || body.item || body;
      if (!bundleData) {
        return sendError(res, 400, "bundleData is required");
      }

      const imported = WorkflowService.importBundle(workflowEngine, bundleData, sessionId);
      return sendJson(res, 200, {
        ok: true,
        operation: "importBundle",
        item: imported,
      });
    }

    // Operation 10: executeResearch (Governed Research Run via Action API v2)
    if (operation === "executeResearch") {
      const intent = (body.intent || "").trim();
      if (!intent) {
        return sendError(res, 400, "intent is required for executeResearch");
      }

      const researchModel = {
        provider: body.model?.provider,
        model: body.model?.model,
      };

      const result = await ResearchService.executeGovernedResearch({
        intent,
        model: researchModel,
        search: body.search,
        source: body.source,
      });

      if (!result.ok) {
        return sendError(res, result.status, result.error || "Research execution failed");
      }

      return sendJson(res, 200, {
        ok: true,
        operation: "executeResearch",
        runId: result.data!.runId,
        phase: result.data!.phase,
        stopped: result.data!.stopped,
        handoffReady: result.data!.handoffReady,
        phases: result.data!.phases,
        bundle: result.data!.bundle,
        issues: result.data!.issues,
        sessionId,
      });
    }

    return sendError(res, 404, `Unknown Action API operation: ${operation}`);
  }

  return false;
};
