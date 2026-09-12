import type { Prompt } from "../../../../contracts/schema/types.js";
import { resolveCapabilityProvider } from "../../../../integration/runtime.js";
import type { TavilyRunner, TavilyRequest } from "./bridge.js";

export interface TavilyEvidence {
  source: string;
  statement: string;
  provenance: string;
}

type TavilyMode = "off" | "search" | "search-extract" | "research-stream";

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function modeFromEnvironment(): TavilyMode {
  const configured = (process.env.ONESHOT_TAVILY_MODE || "")
    .trim()
    .toLowerCase();
  if (
    configured === "off" ||
    configured === "search" ||
    configured === "search-extract" ||
    configured === "research-stream"
  ) {
    return configured;
  }
  return "search-extract";
}

function compactQuery(prompt: Prompt): string {
  return [prompt.intent, prompt.requested_outcome, ...prompt.research_direction]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function clip(value: unknown): string {
  const max = positiveInt(process.env.ONESHOT_TAVILY_MAX_EVIDENCE_BYTES, 12000);
  return typeof value === "string" ? value.slice(0, max).trim() : "";
}

/**
 * Unified Tavily evidence collector executing through the generic
 * integration runtime via the resolved "web.search" capability (@tavily/core),
 * with optional runner override for deterministic unit test doubles.
 */
export class TavilyEvidenceCollector {
  constructor(
    private projectRoot: string,
    private runner?: TavilyRunner,
  ) {}

  async collect(prompt: Prompt): Promise<TavilyEvidence[]> {
    const mode = modeFromEnvironment();
    if (mode === "off") return [];

    const query = compactQuery(prompt);
    if (!query) return [];

    // Path A: Test runner double supplied explicitly
    if (this.runner) {
      if (!(process.env.TAVILY_API_KEY || "").trim()) return [];

      if (mode === "research-stream") {
        const model = (process.env.TAVILY_RESEARCH_MODEL || "mini").trim();
        const response = await this.runner.run<{ report?: string }>({
          op: "research_stream",
          query,
          model: model as "mini" | "pro" | "auto",
          citation_format: "numbered",
        });
        const report = clip(response.report);
        return report
          ? [
              {
                source: `tavily:research:${prompt.prompt_id}`,
                statement: report,
                provenance: `tavily-research-stream:${model}`,
              },
            ]
          : [];
      }

      const searchDepth =
        (process.env.TAVILY_SEARCH_DEPTH || "advanced").trim() === "basic"
          ? "basic"
          : "advanced";
      const maxResults = Math.min(
        20,
        positiveInt(process.env.TAVILY_MAX_RESULTS, 5),
      );
      const search = await this.runner.run<{
        answer?: string;
        results?: Array<{ title?: string; url?: string; content?: string }>;
        request_id?: string;
      }>({
        op: "search",
        query,
        include_answer: "advanced",
        search_depth: searchDepth,
        max_results: maxResults,
      });

      const evidence: TavilyEvidence[] = [];
      const requestId = search.request_id || "unknown";
      const answer = clip(search.answer);
      if (answer) {
        evidence.push({
          source: `tavily:answer:${requestId}`,
          statement: answer,
          provenance: `tavily-search-answer:${requestId}`,
        });
      }

      for (const result of search.results || []) {
        const url = typeof result.url === "string" ? result.url.trim() : "";
        const content = clip(result.content);
        const title = typeof result.title === "string" ? result.title.trim() : "";
        const statement = [title, content].filter(Boolean).join("\n").trim();
        if (!url || !statement) continue;
        evidence.push({
          source: url,
          statement,
          provenance: `tavily-search:${requestId}:${url}`,
        });
      }

      if (mode === "search-extract") {
        const extractTopN = Math.min(
          20,
          positiveInt(process.env.TAVILY_EXTRACT_TOP_N, 3),
        );
        const urls = (search.results || [])
          .map((r) => r.url)
          .filter((u): u is string => typeof u === "string" && u.length > 0)
          .slice(0, extractTopN);

        if (urls.length) {
          const extract = await this.runner.run<{
            results?: Array<{ url?: string; raw_content?: string }>;
            request_id?: string;
          }>({
            op: "extract",
            urls,
            query,
            extract_depth:
              (process.env.TAVILY_EXTRACT_DEPTH || "basic").trim() === "advanced"
                ? "advanced"
                : "basic",
            format: "markdown",
          });
          const extractRequestId = extract.request_id || requestId;
          for (const item of extract.results || []) {
            const url = typeof item.url === "string" ? item.url.trim() : "";
            const content = clip(item.raw_content);
            if (!url || !content) continue;
            evidence.push({
              source: `tavily-extract:${url}`,
              statement: content,
              provenance: `tavily-extract:${extractRequestId}:${url}`,
            });
          }
        }
      }

      return evidence;
    }

    // Path B: Production runtime via generic web.search capability
    const active = await resolveCapabilityProvider(
      this.projectRoot,
      "web.search",
    );
    if (!active || active.id !== "tavily" || !active.provider) {
      return [];
    }

    const client = active.provider as {
      search: (q: string, opts?: Record<string, unknown>) => Promise<any>;
      extract?: (urls: string[], opts?: Record<string, unknown>) => Promise<any>;
    };

    const searchDepth =
      (process.env.TAVILY_SEARCH_DEPTH || "advanced").trim() === "basic"
        ? "basic"
        : "advanced";
    const maxResults = Math.min(
      20,
      positiveInt(process.env.TAVILY_MAX_RESULTS, 5),
    );

    const search = await client.search(query, {
      searchDepth,
      maxResults,
      includeAnswer: true,
    });

    const evidence: TavilyEvidence[] = [];
    const answer = clip(search?.answer);
    if (answer) {
      evidence.push({
        source: `tavily:answer:${prompt.prompt_id}`,
        statement: answer,
        provenance: `tavily-search-answer:${prompt.prompt_id}`,
      });
    }

    const results = Array.isArray(search?.results) ? search.results : [];
    for (const result of results) {
      const url = typeof result.url === "string" ? result.url.trim() : "";
      const content = clip(result.content);
      const title = typeof result.title === "string" ? result.title.trim() : "";
      const statement = [title, content].filter(Boolean).join("\n").trim();
      if (!url || !statement) continue;
      evidence.push({
        source: url,
        statement,
        provenance: `tavily-search:${url}`,
      });
    }

    if (mode === "search-extract" && typeof client.extract === "function") {
      const extractTopN = Math.min(
        20,
        positiveInt(process.env.TAVILY_EXTRACT_TOP_N, 3),
      );
      const urls = results
        .map((r: any) => (typeof r.url === "string" ? r.url.trim() : ""))
        .filter((u: string): u is string => u.length > 0)
        .slice(0, extractTopN);

      if (urls.length) {
        try {
          const extract = await client.extract(urls);
          for (const item of Array.isArray(extract?.results)
            ? extract.results
            : []) {
            const url = typeof item.url === "string" ? item.url.trim() : "";
            const content = clip(item.rawContent || item.raw_content);
            if (!url || !content) continue;
            evidence.push({
              source: `tavily-extract:${url}`,
              statement: content,
              provenance: `tavily-extract:${url}`,
            });
          }
        } catch (e) {
          const detail = e instanceof Error ? e.message : String(e);
          console.warn(`[Researcher:Tavily] optional extract error: ${detail}`);
        }
      }
    }

    return evidence;
  }
}
