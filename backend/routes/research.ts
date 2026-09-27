import { tavilySearchBackend } from "../../packages/agent-runtime/src/index.js";
import { ResearchService } from "../services/research-service.js";
import { sendJson, sendError } from "./helpers.js";
import type { RouteHandler } from "./types.js";

export const handleResearchRoutes: RouteHandler = async (req, res, ctx) => {
  const { pathname, parseBody } = ctx;

  // Governed Research run — explicitly invoked, stops at READY_FOR_PLANNING.
  // Research never auto-invokes Design_Planning; it only produces a bundle.
  if (pathname === "/api/research/run" && req.method === "POST") {
    const body = await parseBody(req);
    const result = await ResearchService.executeGovernedResearch({
      intent: body.intent,
      model: body.model,
      search: body.search,
      source: body.source,
    });

    if (!result.ok) {
      return sendError(res, result.status, result.error || "Research run failed");
    }

    return sendJson(res, 200, result.data);
  }

  // Design_Planning — explicitly invoked only. Never auto-triggered.
  // Ends at PRE_BUILD_REVIEWED; only a user approval reaches APPROVED_PLAN.
  if (pathname === "/api/design-planning/plan" && req.method === "POST") {
    const body = await parseBody(req);
    const result = await ResearchService.executeDesignPlanning({
      intent: body.intent,
      researchRun: body.researchRun,
      explicitlyInvoked: body.explicitlyInvoked,
      repositoryState: body.repositoryState,
      existingArchitecture: body.existingArchitecture,
      existingPhaseReceipts: body.existingPhaseReceipts,
      existingBaselines: body.existingBaselines,
      researchBundle: body.researchBundle,
    });

    if (!result.ok) {
      return sendError(
        res,
        result.status,
        result.error || "Design_Planning failed",
        result.phase !== undefined ? { phase: result.phase } : undefined
      );
    }

    return sendJson(res, 200, result.data);
  }

  // Standalone Tavily Research Search
  if (pathname === "/api/research/query" && req.method === "POST") {
    const body = await parseBody(req);
    const query = (body.query || "").trim();
    if (!query) {
      return sendError(res, 400, "Query parameter is required");
    }

    if (!tavilySearchBackend.isConfigured()) {
      return sendError(
        res,
        503,
        "Research search is currently unavailable because TAVILY_API_KEY is not configured."
      );
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
        if (
          !result ||
          typeof result.title !== "string" ||
          !result.title ||
          typeof result.url !== "string" ||
          !result.url ||
          typeof result.content !== "string" ||
          !result.content
        ) {
          throw new Error("Tavily result is missing required title, url, or content");
        }
        return {
          title: result.title,
          url: result.url,
          content: result.content,
          ...(typeof result.score === "number" ? { score: result.score } : {}),
        };
      });

      return sendJson(res, 200, { query, results });
    } catch (tavilyErr: any) {
      console.error("[tavily] Live call failed:", tavilyErr?.message);
      return sendError(
        res,
        503,
        "Research search is currently unavailable because the live provider request failed."
      );
    }
  }

  return false;
};
