import test from "node:test";
import assert from "node:assert/strict";

import type { Prompt } from "../backend/contract/types.js";
import {
  TavilyEvidenceCollector,
} from "../backend/role/researcher/tool/tavily/evidence.js";
import type {
  TavilyRequest,
  TavilyRunner,
} from "../backend/role/researcher/tool/tavily/bridge.js";

const prompt: Prompt = {
  prompt_id: "prompt:tavily-test",
  intent: "Research current software evaluation practices",
  requested_outcome:
    "Collect authoritative current evidence and preserve source provenance for a production software LLM judge.",
  context: [],
  research_direction: ["evaluation evidence", "software quality"],
};

function withEnv(values: Record<string, string | undefined>, fn: () => Promise<void>) {
  const before = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(values)) {
    before.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  return fn().finally(() => {
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

test("Tavily search-extract uses concise search then extracts known URLs", async () => {
  await withEnv(
    {
      TAVILY_API_KEY: "test-key-not-a-secret",
      ONESHOT_TAVILY_MODE: "search-extract",
      TAVILY_SEARCH_DEPTH: "advanced",
      TAVILY_MAX_RESULTS: "5",
      TAVILY_EXTRACT_TOP_N: "1",
    },
    async () => {
      const requests: TavilyRequest[] = [];
      const runner: TavilyRunner = {
        async run<T>(request: TavilyRequest): Promise<T> {
          requests.push(request);
          if (request.op === "search") {
            return {
              request_id: "search-request-1",
              answer: "Synthesized search answer",
              results: [
                {
                  title: "Authoritative source",
                  url: "https://example.com/source",
                  content: "Observed source snippet",
                  score: 0.99,
                },
              ],
            } as T;
          }
          if (request.op === "extract") {
            return {
              request_id: "extract-request-1",
              results: [
                {
                  url: "https://example.com/source",
                  raw_content: "Extracted authoritative source content",
                },
              ],
            } as T;
          }
          throw new Error(`unexpected operation: ${request.op}`);
        },
      };

      const evidence = await new TavilyEvidenceCollector(".", runner).collect(
        prompt,
      );

      assert.equal(requests.length, 2);
      assert.equal(requests[0].op, "search");
      if (requests[0].op === "search") {
        assert.ok(requests[0].query.length <= 400);
        assert.equal(requests[0].include_answer, "advanced");
        assert.equal(requests[0].search_depth, "advanced");
      }
      assert.equal(requests[1].op, "extract");
      if (requests[1].op === "extract") {
        assert.deepEqual(requests[1].urls, ["https://example.com/source"]);
      }
      assert.ok(
        evidence.some((item) => item.provenance.startsWith("tavily-search:")),
      );
      assert.ok(
        evidence.some((item) => item.provenance.startsWith("tavily-extract:")),
      );
    },
  );
});

test("Tavily research-stream returns streamed report as Researcher evidence", async () => {
  await withEnv(
    {
      TAVILY_API_KEY: "test-key-not-a-secret",
      ONESHOT_TAVILY_MODE: "research-stream",
      TAVILY_RESEARCH_MODEL: "mini",
    },
    async () => {
      const requests: TavilyRequest[] = [];
      const runner: TavilyRunner = {
        async run<T>(request: TavilyRequest): Promise<T> {
          requests.push(request);
          return {
            report: "Cited multi-source research report",
            progress: [
              { type: "research_plan", step: "Find authoritative sources" },
              { type: "research", step: "Compare current evidence" },
            ],
          } as T;
        },
      };

      const evidence = await new TavilyEvidenceCollector(".", runner).collect(
        prompt,
      );

      assert.equal(requests.length, 1);
      assert.equal(requests[0].op, "research_stream");
      assert.equal(evidence.length, 1);
      assert.equal(evidence[0].statement, "Cited multi-source research report");
      assert.equal(evidence[0].provenance, "tavily-research-stream:mini");
    },
  );
});

test("Tavily remains disabled when no key or mode is configured", async () => {
  await withEnv(
    {
      TAVILY_API_KEY: undefined,
      ONESHOT_TAVILY_MODE: undefined,
    },
    async () => {
      let calls = 0;
      const runner: TavilyRunner = {
        async run<T>(): Promise<T> {
          calls += 1;
          throw new Error("runner must not be called");
        },
      };
      const evidence = await new TavilyEvidenceCollector(".", runner).collect(
        prompt,
      );
      assert.deepEqual(evidence, []);
      assert.equal(calls, 0);
    },
  );
});
