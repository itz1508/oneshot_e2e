import path from "node:path";
import fs from "node:fs/promises";
import { executePythonReasoning } from "../python-runtime.js";
import { researchSkill, isResearchHandoffReady } from "../../packages/agent-runtime/src/index.js";
import type { WorkflowStage } from "../../packages/agent-runtime/src/index.js";
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
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        operation: "getStatus",
        status: "healthy",
        currentStage: workflowEngine.getCurrentStage(),
        gate1: workflowEngine.getGate1(),
        gate2: workflowEngine.getGate2(),
        providers: getProviderRegistry(),
        activeSessions: sessions.size,
      }));
      return true;
    }

    // Operation 2: promptAgent (Unified Reasoning & Agent Invocation)
    if (operation === "promptAgent") {
      const prompt = body.prompt || body.goal || "";
      if (!prompt) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "prompt is required" }));
        return true;
      }
      const runId = body.runId || `run_act_${Date.now().toString(36)}`;
      const pyRes = await executePythonReasoning({
        runId,
        prompt,
        task: body.task || "general",
        constraints: body.constraints || [],
        evidence: body.evidence || [],
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        operation: "promptAgent",
        runId,
        response: pyRes,
      }));
      return true;
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
        res.writeHead(valRes.ok ? 200 : 422, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
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
        }));
        return true;
      }
      if (toolName === "workflow_gate_status") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: true,
          operation: "executeTool",
          toolName,
          result: {
            workflowStage: workflowEngine.getCurrentStage(),
            gate1Status: workflowEngine.getGate1().status,
            gate2Status: workflowEngine.getGate2().status,
          },
        }));
        return true;
      }
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Unsupported tool action: ${toolName}` }));
      return true;
    }

    // Operation 4: configureProvider
    if (operation === "configureProvider") {
      const { provider, apiKey, model } = body;
      const validProviders = ["gemini", "openai", "mistral", "tavily", "nebius"];
      if (!validProviders.includes(provider) || !isConfiguredKey(apiKey)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `provider must be one of ${validProviders.join(", ")} and apiKey must be configured` }));
        return true;
      }
      const keyMap: Record<string, string> = {
        gemini: "GEMINI_API_KEY",
        openai: "OPENAI_API_KEY",
        mistral: "MISTRAL_API_KEY",
        tavily: "TAVILY_API_KEY",
        nebius: "NEBIUS_API_KEY",
      };
      const modelMap: Record<string, string> = {
        gemini: "GEMINI_MODEL",
        openai: "OPENAI_MODEL",
        mistral: "MISTRAL_MODEL",
      };
      const envVar = keyMap[provider];
      if (envVar && apiKey) process.env[envVar] = apiKey.trim();
      const modelVar = modelMap[provider];
      if (modelVar && model) process.env[modelVar] = model.trim();

      providerConfigs.set(sessionId, { provider, apiKey, model });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        operation: "configureProvider",
        configured: true,
        sessionId,
        provider,
        model: model || `(default for ${provider})`,
      }));
      return true;
    }

    // Operation 5: switchProvider
    if (operation === "switchProvider") {
      const { provider, model, apiKey, baseUrl } = body;
      const valid = ["gemini", "openai", "mistral", "nebius", "ollama"];
      if (!valid.includes(provider)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Invalid provider. Valid: ${valid.join(", ")}` }));
        return true;
      }
      providerConfigs.set(sessionId, { provider, model, apiKey, baseUrl });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        operation: "switchProvider",
        success: true,
        sessionId,
        provider,
        model: model || `(default for ${provider})`,
      }));
      return true;
    }

    // Operation 6: transitionStage
    if (operation === "transitionStage") {
      const VALID_TARGETS = ["research", "planning", "gap_analysis", "evaluation", "builder"] as const;
      const requested = body.targetStage;
      if (typeof requested !== "string" || !VALID_TARGETS.includes(requested as (typeof VALID_TARGETS)[number])) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: false,
          operation: "transitionStage",
          error: `transitionStage requires targetStage. Valid: ${VALID_TARGETS.join(", ")}.`,
          received: requested ?? null,
        }));
        return true;
      }
      const targetStage = requested as WorkflowStage;
      const transitionRes = workflowEngine.transitionTo(targetStage);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: transitionRes.success,
        operation: "transitionStage",
        fromStage: transitionRes.fromStage,
        toStage: transitionRes.toStage,
        error: transitionRes.error,
      }));
      return true;
    }

    // Operation 7: validateFixtures
    if (operation === "validateFixtures") {
      const valRes = await validateRealFixture({
        fixture_id: body.fixture_id,
        sessionId: body.sessionId || sessionId,
        path: body.path,
        expectedHash: body.expectedHash,
      });
      res.writeHead(valRes.ok ? 200 : 422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
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
      }));
      return true;
    }

    // Operation 8: exportBundle (Portable Snapshot Extraction)
    if (operation === "exportBundle") {
      let manifestData: any = null;
      try {
        const manifestPath = path.resolve(process.cwd(), "app/manifest.json");
        const raw = await fs.readFile(manifestPath, "utf-8");
        manifestData = JSON.parse(raw);
      } catch {
        manifestData = { version: "1.3.0", files: 0, commit: "local" };
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        operation: "exportBundle",
        item: {
          version: "1.3.0",
          exportedAt: new Date().toISOString(),
          name: "OneShot E2E Bundle",
          manifest: manifestData,
          workflow: {
            currentStage: workflowEngine.getCurrentStage(),
            gate1: workflowEngine.getGate1(),
            gate2: workflowEngine.getGate2(),
          },
          items: {
            checkpoints: sessionLedger.getAllCheckpoints?.() || [],
            todos: todoManager.getActiveOnlySnapshot?.() || [],
          },
        },
      }));
      return true;
    }

    // Operation 9: importBundle (Portable Snapshot Ingestion)
    if (operation === "importBundle") {
      const bundleData = body.bundleData || body.item || body;
      if (!bundleData) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "bundleData is required" }));
        return true;
      }

      if (bundleData.workflow?.currentStage) {
        workflowEngine.transitionTo(bundleData.workflow.currentStage);
      }

      const checkpointsCount = bundleData.items?.checkpoints?.length || 0;
      const todosCount = bundleData.items?.todos?.length || 0;

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        operation: "importBundle",
        item: {
          id: sessionId,
          restoredStage: workflowEngine.getCurrentStage(),
          checkpointCount: checkpointsCount,
          todoCount: todosCount,
          manifestVersion: bundleData.manifest?.version || "1.3.0",
        },
      }));
      return true;
    }

    // Operation 10: executeResearch (Governed Research Run via Action API v2)
    if (operation === "executeResearch") {
      const intent = (body.intent || "").trim();
      if (!intent) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "intent is required for executeResearch" }));
        return true;
      }

      const phases: string[] = [];
      const researchModel = {
        provider: (body.model?.provider || "gemini") as "gemini",
        model: (body.model?.model || process.env.GEMINI_MODEL || "gemini-2.5-flash") as string,
      };
      const searchConfig = {
        enabled: body.search === true || (typeof body.search === "object" && body.search?.enabled === true),
        source: (body.source || (typeof body.search === "object" && body.search?.source) || "tavily") as "tavily",
      };

      try {
        const result = await researchSkill.run({
          intent,
          model: researchModel,
          search: searchConfig,
          onPhase: (phase) => phases.push(phase),
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: true,
          operation: "executeResearch",
          runId: result.run.runId,
          phase: result.run.phase,
          stopped: result.stopped,
          handoffReady: isResearchHandoffReady(result.run),
          phases,
          bundle: result.run.bundle ?? null,
          issues: result.issues,
          sessionId,
        }));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err?.message || "Research execution failed" }));
      }
      return true;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Unknown Action API operation: ${operation}` }));
    return true;
  }

  return false;
};
