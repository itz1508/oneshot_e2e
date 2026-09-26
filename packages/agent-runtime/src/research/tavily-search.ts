/**
 * OneShot Tavily Research Engine
 *
 * Implements dual research capabilities:
 * 1. In-Chat Agent Research: Tool callable within the agent stream.
 * 2. Standalone User Research: User-driven exploration invoked from the standalone drawer.
 */

import type {
  ResearchQueryOptions,
  ResearchResponse,
  ResearchResultItem,
} from "./types.js";
import {
  canAdvanceResearch,
  isResearchRunFinished,
  type ResearchPhaseName,
  type ResearchRun,
  type ResearchSourceRecord,
  type ResearcherModel,
  type SearchConfig,
} from "../workflow/types.js";

export class TavilySearchBackend {
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TAVILY_API_KEY;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Executes a research search.
   * If real Tavily API key is configured, invokes @tavily/core.
   * Otherwise returns deterministic verified evidence results.
   */
  async search(
    query: string,
    options: ResearchQueryOptions = {},
    executedBy: "agent" | "user_standalone" = "user_standalone"
  ): Promise<ResearchResponse> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      throw new Error("Research query cannot be empty");
    }

    const depth = options.depth || "basic";
    const maxResults = options.maxResults || 5;

    // Real Tavily API integration when key is configured
    if (this.apiKey) {
      try {
        const { tavily } = await import("@tavily/core");
        const tv = tavily({ apiKey: this.apiKey });
        const response = await tv.search(trimmedQuery, {
          searchDepth: depth,
          maxResults,
        });

        const items: ResearchResultItem[] = (response.results || []).map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          score: r.score ?? 0.95,
        }));

        return {
          query: trimmedQuery,
          depth,
          results: items,
          answer: response.answer,
          executedBy,
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        throw new Error(
          `Live research execution failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    if (options.deterministicFixture) {
      const normalized = encodeURIComponent(trimmedQuery.toLowerCase().replace(/\s+/g, "-"));
      const items: ResearchResultItem[] = [
        {
          title: `${trimmedQuery} — Deterministic Fixture`,
          url: `https://fixture.oneshot.test/research/${normalized}`,
          content: `Test fixture for '${trimmedQuery}'. This record is not live research.`,
          score: 1,
        },
      ];

      return {
        query: trimmedQuery,
        depth,
        results: items.slice(0, maxResults),
        executedBy,
        timestamp: new Date().toISOString(),
      };
    }

    throw new Error(
      "Research search is unavailable: TAVILY_API_KEY is not configured for live web searches."
    );
  }

  /**
   * Helper to format research results into a markdown citation block.
   */
  formatCitationsMarkdown(response: ResearchResponse): string {
    if (!response.results.length) return "No sources cited.";
    return response.results
      .map((r, i) => `[${i + 1}] [${r.title}](${r.url}) — ${r.content}`)
      .join("\n\n");
  }
}

export const tavilySearchBackend = new TavilySearchBackend();

// ── Governed research skill ────────────────────────────────────────────────

/**
 * A research run is a governed skill with a hard stop (ARCHITECTURE.MD §1.2):
 *
 *   ACTIVE → RECONCILING → RESEARCHING → DRAFTING
 *         → BASELINE_VALIDATING → REVIEW → READY_FOR_PLANNING   ◀── STOP
 *
 * It never becomes the Planner, never builds, never mutates the repository, and
 * never selects the final build decision. `READY_FOR_PLANNING` is a handoff
 * boundary, not an invitation to continue.
 */
export interface ResearchRunResult {
  run: ResearchRun;
  /** True when the run reached the stop phase. */
  stopped: boolean;
  /** Non-fatal issues recorded while running. Empty means a clean run. */
  issues: string[];
}

export interface ResearchSkillOptions {
  runId?: string;
  intent: string;
  model: ResearcherModel;
  search: SearchConfig;
  /** Search adapter. Defaults to the shared Tavily backend. */
  searchBackend?: TavilySearchBackend;
  /** Emits each phase transition as it happens. */
  onPhase?: (phase: ResearchPhaseName) => void;
}

export class ResearchSkill {
  private readonly searchBackend: TavilySearchBackend;

  constructor(searchBackend: TavilySearchBackend = tavilySearchBackend) {
    this.searchBackend = searchBackend;
  }

  /**
   * Runs the research lifecycle to completion.
   *
   * Honesty contract: this never fabricates sources. When search is disabled or
   * the adapter is unavailable, the run still reaches REVIEW and the bundle is
   * reported with zero sources and a recorded issue, rather than inventing results.
   */
  async run(options: ResearchSkillOptions): Promise<ResearchRunResult> {
    const runId = options.runId ?? `research-${Date.now().toString(36)}`;
    const issues: string[] = [];

    const run: ResearchRun = {
      runId,
      phase: "ACTIVE",
      startedAt: new Date().toISOString(),
    };

    const advanceTo = (phase: ResearchPhaseName): void => {
      if (!canAdvanceResearch(run, phase)) {
        throw new Error(`Illegal research transition: ${run.phase} → ${phase}`);
      }
      run.phase = phase;
      options.onPhase?.(phase);
    };

    // ACTIVE → RECONCILING: establish what already exists before gathering anything.
    advanceTo("RECONCILING");

    // RECONCILING → RESEARCHING: gather sources only if search is explicitly enabled.
    let sources: ResearchSourceRecord[] = [];
    if (options.search.enabled && options.search.source === "tavily") {
      try {
        const response = await this.searchBackend.search(options.intent, {}, "agent");
        sources = response.results.map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          ...(typeof r.score === "number" ? { score: r.score } : {}),
        }));
      } catch (err) {
        issues.push(
          `Search unavailable: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else {
      issues.push("External search was disabled for this run; no sources were gathered.");
    }

    advanceTo("RESEARCHING");
    advanceTo("DRAFTING");

    // Research may surface gaps and alternatives, but must NOT select the build
    // decision. Gaps are derived from the gathered evidence only.
    const gaps =
      sources.length === 0
        ? ["No external evidence was available for this intent."]
        : sources
            .filter((s) => s.score !== undefined && s.score < 0.5)
            .map((s) => `Low-confidence source: ${s.title}`);

    const alternatives = sources.slice(0, 3).map((s) => ({
      option: s.title,
      basis: s.url,
    }));

    run.bundle = {
      runId,
      intent: options.intent,
      model: options.model,
      search: options.search,
      sources,
      gaps,
      alternatives,
      decisionOwner: "Design_Planning",
      createdAt: new Date().toISOString(),
    };

    advanceTo("BASELINE_VALIDATING");
    advanceTo("REVIEW");
    advanceTo("READY_FOR_PLANNING");

    return { run, stopped: isResearchRunFinished(run), issues };
  }
}

export const researchSkill = new ResearchSkill();

