import { z } from "zod";
import { realpath, readFile } from "node:fs/promises";
import { resolve, isAbsolute, relative } from "node:path";
import { FunctionTool } from "../../../app/integration/strands/src/index.js";
import { tavilySearch, tavilyExtract } from "../../../app/integration/tavily/src/index.js";
import { toStrandsFunctionTool, type OneShotToolDefinition } from "./tool/neutral-tool-converter.js";

export interface EvidenceItem {
  source: string;
  statement: string;
  provenance: string;
}

export interface ResearchEvidenceRecorder {
  add(item: EvidenceItem): void;
  list(): EvidenceItem[];
}

export function createEvidenceRecorder(): ResearchEvidenceRecorder {
  const items: EvidenceItem[] = [];
  return {
    add(item: EvidenceItem) {
      items.push(item);
    },
    list() {
      return [...items];
    },
  };
}

async function resolveSafeFile(projectRoot: string, relativePath: string): Promise<string> {
  if (isAbsolute(relativePath)) {
    throw new Error("Absolute paths are not allowed");
  }
  const realRoot = await realpath(projectRoot);
  const candidate = resolve(realRoot, relativePath);
  const lexicalRel = relative(realRoot, candidate);
  if (
    lexicalRel === ".." ||
    lexicalRel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(lexicalRel)
  ) {
    throw new Error("Path escapes project root");
  }
  let realCandidate = candidate;
  try {
    realCandidate = await realpath(candidate);
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
  const rel = relative(realRoot, realCandidate);
  if (
    rel === ".." ||
    rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(rel)
  ) {
    throw new Error("Path escapes project root");
  }
  return realCandidate;
}

function safeWellFormed(s: string): string {
  return typeof s.toWellFormed === "function"
    ? s.toWellFormed()
    : s.replace(/[\uD800-\uDFFF]/g, "");
}

const WorkspaceReadInput = z.object({
  relativePath: z.string().min(1),
});

/**
 * Capability 1: Workspace Evidence Inspector
 */
export function createWorkspaceEvidenceTool(
  projectRoot: string,
  recorder?: ResearchEvidenceRecorder,
): FunctionTool {
  return new FunctionTool({
    name: "workspace_read_file",
    description: "Read a local project file to inspect codebase architecture, manifests, or current behavior.",
    inputSchema: {
      type: "object",
      properties: {
        relativePath: { type: "string", description: "Relative file path from project root" },
      },
      required: ["relativePath"],
    },
    callback: async (rawInput: unknown) => {
      const parsed = WorkspaceReadInput.safeParse(rawInput);
      if (!parsed.success) {
        return `Invalid input: ${parsed.error.message}`;
      }
      const { relativePath } = parsed.data;
      try {
        const safePath = await resolveSafeFile(projectRoot, relativePath);
        const content = await readFile(safePath, "utf-8");
        const snippet = safeWellFormed(content.slice(0, 10000));
        recorder?.add({
          source: `workspace:${relativePath}`,
          statement: snippet.slice(0, 2000),
          provenance: "workspace-file",
        });
        return snippet;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("escapes project root") || msg.includes("Absolute paths")) {
          return `Forbidden: Path '${relativePath}' escapes project root.`;
        }
        return `Failed to read file: ${msg}`;
      }
    },
  });
}

export type FactListener = (fact: {
  type: string;
  timestamp: string;
  stage?: string;
  source?: string;
  operation?: string;
  metadata?: Record<string, unknown>;
}) => void;

const TavilyToolInput = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().positive().optional(),
});

/**
 * Capability 2: Tavily Search & Extract Tool
 */
export function createTavilyResearchTool(
  apiKey?: string,
  onFact?: FactListener,
  recorder?: ResearchEvidenceRecorder,
): FunctionTool {
  const key = (apiKey !== undefined ? apiKey : (process.env.TAVILY_API_KEY || "")).trim();

  return new FunctionTool({
    name: "tavily_search_extract",
    description: "Search the web and extract grounded external documentation and technical references.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        maxResults: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
    callback: async (rawInput: unknown) => {
      const parsed = TavilyToolInput.safeParse(rawInput);
      if (!parsed.success) {
        return `Invalid input: ${parsed.error.message}`;
      }
      const { query, maxResults } = parsed.data;
      if (!key) {
        return "Tavily API key not configured; skipping external web research.";
      }

      onFact?.({
        type: "tavilyToolInvoked",
        timestamp: new Date().toISOString(),
        stage: "Researcher",
        source: "Strands:FunctionTool",
        operation: "tavily_search_extract",
        metadata: { queryLength: query.length, maxResults: maxResults || 5 },
      });

      try {
        const searchResult = await tavilySearch(query, {
          apiKey: key,
          searchDepth: "advanced",
          maxResults: maxResults || 5,
          includeAnswer: true,
        });

        const resultsCount = searchResult.results?.length || 0;
        onFact?.({
          type: "tavilyApiResponded",
          timestamp: new Date().toISOString(),
          stage: "Researcher",
          source: "api.tavily.com",
          operation: "tavilySearch",
          metadata: {
            resultsCount,
            hasAnswer: Boolean(searchResult.answer),
            requestId: searchResult.requestId || "verified",
          },
        });

        for (const res of (searchResult.results || []).slice(0, 3)) {
          recorder?.add({
            source: res.url || "tavily:search",
            statement: safeWellFormed((res.content || res.title || "Tavily search result").slice(0, 2000)),
            provenance: "tavily-search",
          });
        }

        const urls = ((searchResult.results || []) as Array<{ url?: string }>)
          .map((r: { url?: string }) => r.url)
          .filter((u: string | undefined): u is string => Boolean(u))
          .slice(0, Math.min(maxResults || 3, 3));

        let extractSection = "";
        if (urls.length > 0) {
          try {
            const extracted = await tavilyExtract(urls, {
              apiKey: key,
              query,
            });
            for (const ext of (extracted.results || []) as Array<{ url?: string; rawContent?: string }>) {
              if (ext.rawContent) {
                recorder?.add({
                  source: ext.url || "tavily:extract",
                  statement: safeWellFormed(ext.rawContent.slice(0, 2000)),
                  provenance: "tavily-extract",
                });
              }
            }
            if (extracted.results && extracted.results.length > 0) {
              extractSection = `\n\nExtracted Grounding:\n` + (extracted.results as Array<{ url?: string; rawContent?: string }>)
                .map((e: { url?: string; rawContent?: string }) => `URL: ${e.url}\n${(e.rawContent || "").slice(0, 1500)}`)
                .join("\n---\n");
            }
          } catch {
            // Extraction is optional enrichment on top of search
          }
        }

        const formatted = ((searchResult.results || []) as Array<{ title?: string; url?: string; content?: string }>)
          .map((r: { title?: string; url?: string; content?: string }, i: number) => `[Source ${i + 1}]: ${r.title}\nURL: ${r.url}\n${(r.content || "").slice(0, 2000)}`)
          .join("\n\n---\n\n");

        return (formatted + extractSection) || "No search results returned.";
      } catch (err: unknown) {
        return `Tavily research failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

export { toStrandsFunctionTool, type OneShotToolDefinition } from "./tool/neutral-tool-converter.js";

/**
 * Build Strands `FunctionTool`s from neutral `OneShotToolDefinition`s (M9).
 * Lets the Researcher describe tools provider-agnostically; the conversion to
 * Strands `FunctionTool` happens here, preserving the validation contract.
 */
export function createToolsFromNeutral(
  defs: readonly OneShotToolDefinition[],
): FunctionTool[] {
  return defs.map(toStrandsFunctionTool);
}
