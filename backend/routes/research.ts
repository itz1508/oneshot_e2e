import {
  researchSkill,
  designPlanningSkill,
  isResearchHandoffReady,
  canInvokeDesignPlanning,
  tavilySearchBackend,
} from "../../packages/agent-runtime/src/index.js";
import type { RouteHandler } from "./types.js";

export const handleResearchRoutes: RouteHandler = async (req, res, ctx) => {
  const { pathname, parseBody } = ctx;

  // Governed Research run — explicitly invoked, stops at READY_FOR_PLANNING.
  // Research never auto-invokes Design_Planning; it only produces a bundle.
  if (pathname === "/api/research/run" && req.method === "POST") {
    const body = await parseBody(req);
    const intent = (body.intent || "").trim();
    if (!intent) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Research intent is required" }));
      return true;
    }

    const researchModel = {
      provider: (body.model?.provider || "gemini") as "gemini",
      model: (body.model?.model || process.env.GEMINI_MODEL || "gemini-2.5-flash") as string,
    };
    const searchConfig = {
      enabled: body.search?.enabled === true,
      source: (body.search?.source || "tavily") as "tavily",
    };

    try {
      const phases: string[] = [];
      const result = await researchSkill.run({
        intent,
        model: researchModel,
        search: searchConfig,
        onPhase: (phase) => phases.push(phase),
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        runId: result.run.runId,
        phase: result.run.phase,
        stopped: result.stopped,
        handoffReady: isResearchHandoffReady(result.run),
        phases,
        bundle: result.run.bundle ?? null,
        issues: result.issues,
      }));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err?.message || "Research run failed" }));
    }
    return true;
  }

  // Design_Planning — explicitly invoked only. Never auto-triggered.
  // Ends at PRE_BUILD_REVIEWED; only a user approval reaches APPROVED_PLAN.
  if (pathname === "/api/design-planning/plan" && req.method === "POST") {
    const body = await parseBody(req);
    if (!canInvokeDesignPlanning(body.researchRun ?? null, body.explicitlyInvoked === true)) {
      const pendingHandoff = body.researchRun
        ? " Research has not reached READY_FOR_PLANNING."
        : " Design_Planning must be explicitly invoked (explicitlyInvoked=true).";
      res.writeHead(body.researchRun ? 409 : 400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: pendingHandoff.trim(),
        phase: body.researchRun?.phase ?? null,
      }));
      return true;
    }

    const intent = (body.intent || "").trim();
    if (!intent) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Planning intent is required" }));
      return true;
    }

    try {
      const phases: string[] = [];
      const result = await designPlanningSkill.plan({
        input: {
          userIntent: intent,
          repositoryState: (body.repositoryState || "").trim(),
          existingArchitecture: (body.existingArchitecture || "").trim(),
          existingPhaseReceipts: Array.isArray(body.existingPhaseReceipts)
            ? body.existingPhaseReceipts
            : [],
          existingBaselines: Array.isArray(body.existingBaselines)
            ? body.existingBaselines
            : [],
          researchBundle: body.researchBundle ?? undefined,
        },
        onPhase: (phase) => phases.push(phase),
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        planId: result.run.runId,
        phase: result.run.phase,
        auditId: result.run.auditId,
        stopped: result.stopped,
        phases,
        issues: result.issues,
      }));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err?.message || "Design_Planning failed" }));
    }
    return true;
  }

  // Standalone Tavily Research Search
  if (pathname === "/api/research/query" && req.method === "POST") {
    const body = await parseBody(req);
    const query = (body.query || "").trim();
    if (!query) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Query parameter is required" }));
      return true;
    }

    if (!tavilySearchBackend.isConfigured()) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "Research search is currently unavailable because TAVILY_API_KEY is not configured.",
      }));
      return true;
    }

    try {
      const response = await tavilySearchBackend.search(
        query,
        {
          depth: body.searchDepth === "advanced" ? "advanced" : "basic",
          maxResults: typeof body.maxResults === "number" ? body.maxResults : 5,
        },
        "user_standalone"
      );

      if (!Array.isArray(response.results)) {
        throw new Error("Tavily response is missing results array");
      }
      const results = response.results.map((result) => {
        if (!result || typeof result.title !== "string" || !result.title || typeof result.url !== "string" || !result.url || typeof result.content !== "string" || !result.content) {
          throw new Error("Tavily result is missing required title, url, or content");
        }
        return {
          title: result.title,
          url: result.url,
          content: result.content,
          ...(typeof result.score === "number" ? { score: result.score } : {}),
        };
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ query, results }));
      return true;
    } catch (tavilyErr: any) {
      console.error("[tavily] Live call failed:", tavilyErr?.message);
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "Research search is currently unavailable because the live provider request failed.",
      }));
      return true;
    }
  }

  return false;
};
