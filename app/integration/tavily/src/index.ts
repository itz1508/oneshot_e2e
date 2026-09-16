// Native Node Tavily SearchIntegration adapter (server-side only; never imported
// by a browser/Vite bundle). Uses the official @tavily/core JS SDK directly.
//
// Credential invariant: the only credential is the Tavily API key, passed to
// `tavily({ apiKey })` and therefore sent ONLY to api.tavily.com. It is never
// forwarded to a model provider, Gateway, telemetry, artifact, SSE event, error,
// or log. No model-provider key is required for any operation in this module.
import {
  tavily,
  type TavilyClient,
  type TavilySearchOptions,
  type TavilySearchResponse,
  type TavilyExtractOptions,
  type TavilyExtractResponse,
  type TavilyCrawlOptions,
  type TavilyCrawlResponse,
  type TavilyMapOptions,
  type TavilyMapResponse,
  type TavilyResearchOptions,
  type TavilyResearchResponse,
  type TavilyGetResearchResponse,
} from "@tavily/core";

export type {
  TavilyClient,
  TavilySearchOptions,
  TavilySearchResponse,
  TavilyExtractOptions,
  TavilyExtractResponse,
  TavilyCrawlOptions,
  TavilyCrawlResponse,
  TavilyMapOptions,
  TavilyMapResponse,
};

/** Core configuration: supply an already-constructed client OR an apiKey. */
export interface TavilyCoreOptions {
  /** Required unless `client` is supplied. Sent only to api.tavily.com. */
  apiKey?: string;
  /** Pre-built client (overrides apiKey when provided). */
  client?: TavilyClient;
  /** Optional override for api.tavily.com (testing/self-host only). */
  baseURL?: string;
  /** Timeout in SECONDS passed through to the Tavily SDK (valid range 10–180). */
  timeout?: number;
}

/** Structured Web Sources returned by research/polling operations. */
export interface TavilyWebSource {
  title: string;
  url: string;
}

/** Result of a completed (non-streamed) deep research poll. */
export interface TavilyResearchOutput {
  report: string | Record<string, unknown>;
  webSources: TavilyWebSource[];
  requestId: string;
  status: string;
}

export interface DeepResearchOptions extends TavilyResearchOptions {
  /** Millis to keep polling before giving up on a deep research request. */
  pollDeadlineMs?: number;
  /** Millis between status polls (default 1500). */
  pollIntervalMs?: number;
}

export class TavilyExtractTimeoutError extends Error {
  readonly code = "TAVILY_EXTRACT_TIMEOUT";
  readonly retryable = false;
  constructor() {
    super("Tavily extract exceeded the deadline");
    this.name = "TimeoutError";
  }
}

/** Trim trailing slashes from an optional base URL override. */
export function normalizeBaseUrl(baseUrl: string | undefined): string {
  return baseUrl ? baseUrl.replace(/\/+$/, "") : "";
}

function resolveClient(options: TavilyCoreOptions): TavilyClient {
  if (options.client) return options.client;
  const key = (options.apiKey || "").trim();
  if (!key) {
    throw new Error("Tavily apiKey is required (or pass a configured client)");
  }
  const base = normalizeBaseUrl(options.baseURL);
  return tavily({
    apiKey: key,
    ...(base ? { apiBaseURL: base } : {}),
  });
}

/** Convert any thrown error to a redacted, non-secret message. */
export function redactTavilyError(
  error: unknown,
): { code: string; message: string; retryable: boolean } {
  if (error instanceof TavilyExtractTimeoutError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  const text = error instanceof Error ? error.message : String(error);
  return { code: "TAVILY_UPSTREAM_ERROR", message: text.slice(0, 300), retryable: false };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Standard Tavily search results -> `{ title, url }` provenance items. */
export function toWebSources(result: TavilySearchResponse): TavilyWebSource[] {
  return Array.isArray(result.results)
    ? result.results
        .filter((r) => typeof r.url === "string" && r.url.length > 0)
        .map((r) => ({ title: r.title || r.url, url: r.url }))
    : [];
}

class ResearchNotReady extends Error {
  readonly retryable = true;
  status: string;
  requestId: string;
  constructor(status: string, requestId: string) {
    super(`Tavily research status: ${status}`);
    this.name = "ResearchNotReady";
    this.status = status;
    this.requestId = requestId;
  }
}

async function researchCompleted(
  client: TavilyClient,
  requestId: string,
): Promise<TavilyGetResearchResponse> {
  // Poll getResearch until a terminal status. The SDK returns an incomplete
  // status variant while the request is still running server-side.
  const response = await client.getResearch(requestId);
  const status = String(response?.status ?? "");
  if (status === "completed") {
    return response as TavilyGetResearchResponse;
  }
  if (status.toLowerCase().includes("fail")) {
    throw new Error(`Tavily research request ${requestId} failed (status: ${status})`);
  }
  throw new ResearchNotReady(status, requestId);
}
/**
 * Non-streaming deep research. Calls `client.research({ stream: false })` to
 * obtain a requestId, then polls `getResearch` until the report and its
 * `{ title, url }` web sources are available. Returns the shape the
 * hybrid-research pipeline expects: `{ report, webSources }`.
 */
export async function tavilyResearch(
  input: string,
  options: TavilyCoreOptions & DeepResearchOptions = {},
): Promise<TavilyResearchOutput> {
  const client = resolveClient(options);
  const deadlineMs = options.pollDeadlineMs ?? 180000;
  const intervalMs = options.pollIntervalMs ?? 1500;
  const started = Date.now();

  const { pollDeadlineMs, pollIntervalMs, ...researchOptions } = options;
  const init = (await client.research(input, {
    ...researchOptions,
    stream: false,
    timeout: researchOptions.timeout,
  })) as TavilyResearchResponse;

  const requestId = init.requestId;
  if (!requestId) throw new Error("Tavily research did not return a requestId");

  while (Date.now() - started < deadlineMs) {
    try {
      const done = await researchCompleted(client, requestId);
      return {
        report: done.content,
        webSources: Array.isArray(done.sources)
          ? done.sources.map((s) => ({ title: s.title || s.url, url: s.url }))
          : [],
        requestId,
        status: done.status,
      };
    } catch (error) {
      if (!(error instanceof ResearchNotReady)) throw error;
      await sleep(intervalMs);
    }
  }
  throw new Error(`Tavily research ${requestId} did not complete within ${deadlineMs}ms`);
}

/** Async streaming deep research: emits decoded text chunks from the SSE stream. */
export async function* tavilyResearchStream(
  input: string,
  options: TavilyCoreOptions & TavilyResearchOptions = {},
): AsyncGenerator<string> {
  const client = resolveClient(options);
  const stream = (await client.research(input, {
    ...options,
    stream: true,
  })) as AsyncGenerator<Buffer, void, unknown>;
  for await (const chunk of stream) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    if (text) yield text;
  }
}
// Per-operation helpers covering the six §7.2 operations.
export function tavilySearch(
  query: string,
  options: TavilyCoreOptions & TavilySearchOptions = {},
): Promise<TavilySearchResponse> {
  const client = resolveClient(options);
  const { apiKey, client: _c, baseURL, ...searchOptions } = options;
  return client.search(query, searchOptions);
}

export function tavilyExtract(
  urls: string[],
  options: TavilyCoreOptions & TavilyExtractOptions = {},
): Promise<TavilyExtractResponse> {
  const client = resolveClient(options);
  const { apiKey, client: _c, baseURL, ...extractOptions } = options;
  return client.extract(urls, extractOptions);
}

export function tavilyCrawl(
  url: string,
  options: TavilyCoreOptions & TavilyCrawlOptions = {},
): Promise<TavilyCrawlResponse> {
  const client = resolveClient(options);
  const { apiKey, client: _c, baseURL, ...crawlOptions } = options;
  return client.crawl(url, crawlOptions);
}

export function tavilyMap(
  url: string,
  options: TavilyCoreOptions & TavilyMapOptions = {},
): Promise<TavilyMapResponse> {
  const client = resolveClient(options);
  const { apiKey, client: _c, baseURL, ...mapOptions } = options;
  return client.map(url, mapOptions);
}

/**
 * Alias for non-streaming deep research (Deep Research parity). Kept for callers
 * that expect a distinct `tavilyDeepResearch` export name.
 */
export const tavilyDeepResearch = tavilyResearch;