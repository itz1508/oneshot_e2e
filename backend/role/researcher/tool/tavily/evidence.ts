import type { Prompt } from "../../../../contracts/schema/types.js";
import {
  TavilyPythonRunner,
  type TavilyRunner,
} from "./bridge.js";

export interface TavilyEvidence {
  source: string;
  statement: string;
  provenance: string;
}

type TavilyMode = "off" | "search" | "search-extract" | "research-stream";

type SearchResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
};

type SearchResponse = {
  answer?: string;
  results?: SearchResult[];
  request_id?: string;
};

type ExtractResult = {
  url?: string;
  raw_content?: string;
};

type ExtractResponse = {
  results?: ExtractResult[];
  failed_results?: unknown[];
  request_id?: string;
};

type ResearchStreamResponse = {
  report?: string;
  progress?: Array<Record<string, unknown>>;
};

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
  return (process.env.TAVILY_API_KEY || "").trim() ? "search-extract" : "off";
}

function compactQuery(prompt: Prompt): string {
  return [
    prompt.intent,
    prompt.requested_outcome,
    ...prompt.research_direction,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function clip(value: unknown): string {
  const max = positiveInt(process.env.ONESHOT_TAVILY_MAX_EVIDENCE_BYTES, 12000);
  return typeof value === "string" ? value.slice(0, max) : "";
}

export interface TavilyCollectorOptions {
  /** Explicit enablement — false disables collection entirely. */
  enabled?: boolean;
  /** BYOK key resolved server-side; overrides the environment variable. */
  apiKey?: string;
  searchDepth?: "basic" | "advanced";
  maxResults?: number;
}

export class TavilyEvidenceCollector {
  private runner: TavilyRunner;

  constructor(
    private projectRoot: string,
    runner?: TavilyRunner,
    private options: TavilyCollectorOptions = {},
  ) {
    // The default Python runner receives the BYOK key so the worker process
    // gets it via its environment without mutating the server process env.
    this.runner =
      runner ??
      new TavilyPythonRunner(projectRoot, undefined, options.apiKey);
  }

  /**
   * Enablement precedence: explicit option (from runtime config / BYOK flow)
   * wins; otherwise the historical environment-based mode applies.
   */
  private resolveMode(): TavilyMode {
    if (this.options.enabled === false) return "off";
    const configured = modeFromEnvironment();
    if (this.options.enabled === true && configured === "off") {
      return "search-extract";
    }
    return configured;
  }

  async collect(prompt: Prompt): Promise<TavilyEvidence[]> {
    const mode = this.resolveMode();
    if (mode === "off") return [];
    const apiKey =
      this.options.apiKey ?? (process.env.TAVILY_API_KEY || "").trim();
    if (!apiKey) {
      throw new Error(`Tavily API key is required when web research is enabled`);
    }

    const query = compactQuery(prompt);
    if (!query) return [];

    if (mode === "research-stream") {
      const model = (process.env.TAVILY_RESEARCH_MODEL || "mini").trim();
      if (!new Set(["mini", "pro", "auto"]).has(model)) {
        throw new Error(`unsupported TAVILY_RESEARCH_MODEL: ${model}`);
      }
      const response = await this.runner.run<ResearchStreamResponse>({
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
      this.options.searchDepth ??
      ((process.env.TAVILY_SEARCH_DEPTH || "advanced").trim() === "basic"
        ? "basic"
        : "advanced");
    const maxResults = Math.min(
      20,
      this.options.maxResults ??
        positiveInt(process.env.TAVILY_MAX_RESULTS, 5),
    );
    const search = await this.runner.run<SearchResponse>({
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

    const results = Array.isArray(search.results) ? search.results : [];
    for (const result of results) {
      const url = typeof result.url === "string" ? result.url : "";
      const content = clip(result.content);
      if (!url || !content) continue;
      evidence.push({
        source: url,
        statement: [result.title, content].filter(Boolean).join("\n"),
        provenance: `tavily-search:${requestId}:${url}`,
      });
    }

    if (mode !== "search-extract") return evidence;

    const extractTopN = Math.min(
      20,
      positiveInt(process.env.TAVILY_EXTRACT_TOP_N, 3),
    );
    const urls = results
      .map((result) => result.url)
      .filter((url): url is string => typeof url === "string" && url.length > 0)
      .slice(0, extractTopN);
    if (!urls.length) return evidence;

    const extract = await this.runner.run<ExtractResponse>({
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
    for (const result of Array.isArray(extract.results) ? extract.results : []) {
      const url = typeof result.url === "string" ? result.url : "";
      const content = clip(result.raw_content);
      if (!url || !content) continue;
      evidence.push({
        source: `tavily-extract:${url}`,
        statement: content,
        provenance: `tavily-extract:${extractRequestId}:${url}`,
      });
    }

    return evidence;
  }
}
