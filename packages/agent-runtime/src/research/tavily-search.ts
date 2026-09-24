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

