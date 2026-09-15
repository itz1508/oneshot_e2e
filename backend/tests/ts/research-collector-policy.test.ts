import test from "node:test";
import assert from "node:assert/strict";

import type { Prompt } from "../../contracts/schema/types.js";
import { ResearchEvidenceCollector } from "../../agents/researcher/tool/evidence/collector.js";
import type {
  TavilyRequest,
  TavilyRunner,
} from "../../agents/researcher/tool/tavily/bridge.js";
import {
  assertTavilyEvidence,
  EvidenceProvenance,
} from "../../integration/research/policy.js";

const prompt: Prompt = {
  prompt_id: "prompt:m12-collector",
  intent: "Research current evaluation practices",
  requested_outcome: "Collect evidence with clean provenance.",
  context: [{ context_id: "ctx:1", statement: "Prefer primary sources" }],
  research_direction: ["evaluation evidence"],
};

function withEnv(
  values: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
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

/** Records every op the Tavily adapter attempts — the observable in tests. */
function recordingRunner(): { runner: TavilyRunner; ops: string[] } {
  const ops: string[] = [];
  const runner: TavilyRunner = {
    async run<T>(request: TavilyRequest): Promise<T> {
      ops.push(request.op);
      if (request.op === "search") {
        return {
          request_id: "search-1",
          answer: "Answer",
          results: [
            {
              title: "Source",
              url: "https://example.com/source",
              content: "Content",
              score: 0.9,
            },
          ],
        } as T;
      }
      if (request.op === "extract") {
        return {
          request_id: "extract-1",
          results: [
            { url: "https://example.com/source", raw_content: "Extracted" },
          ],
        } as T;
      }
      throw new Error(`unexpected op: ${request.op}`);
    },
  };
  return { runner, ops };
}

test("collector: local-only mode makes ZERO Tavily requests", async () => {
  await withEnv(
    {
      ONESHOT_RESEARCH_MODE: "local-only",
      TAVILY_API_KEY: "test-key-not-a-secret",
      ONESHOT_TAVILY_MODE: "search-extract",
    },
    async () => {
      const { runner, ops } = recordingRunner();
      const collector = new ResearchEvidenceCollector(".", runner);
      const evidence = await collector.collect(prompt);
      assert.deepEqual(ops, [], "no Tavily request may be made in local-only mode");
      assert.ok(
        evidence.some((e) => e.provenance === EvidenceProvenance.RESEARCH_POLICY),
        "policy decision must be recorded as evidence",
      );
      assert.ok(
        evidence.some((e) => e.statement.includes("local-only")),
      );
    },
  );
});

test("collector: external mode fails clearly when Tavily unavailable", async () => {
  await withEnv(
    {
      ONESHOT_RESEARCH_MODE: "external",
      TAVILY_API_KEY: undefined,
      ONESHOT_TAVILY_REQUIRED: "true",
    },
    async () => {
      const { runner, ops } = recordingRunner();
      const collector = new ResearchEvidenceCollector(".", runner);
      await assert.rejects(() => collector.collect(prompt), /RESEARCH_EXTERNAL_UNAVAILABLE/);
      assert.deepEqual(ops, []);
    },
  );
});

test("collector: hybrid mode records local AND external evidence", async () => {
  await withEnv(
    {
      ONESHOT_RESEARCH_MODE: "hybrid",
      TAVILY_API_KEY: "test-key-not-a-secret",
      ONESHOT_TAVILY_MODE: "search-extract",
      TAVILY_EXTRACT_TOP_N: "1",
    },
    async () => {
      const { runner, ops } = recordingRunner();
      const collector = new ResearchEvidenceCollector(".", runner);
      const evidence = await collector.collect(prompt);
      assert.deepEqual(ops, ["search", "extract"]);
      const provs = evidence.map((e) => e.provenance);
      assert.ok(provs.includes(EvidenceProvenance.USER_PROMPT), "local evidence recorded");
      assert.ok(
        provs.some((p) => p.startsWith("tavily-search:")),
        "external search evidence recorded",
      );
      assert.ok(
        provs.some((p) => p.startsWith("tavily-extract:")),
        "external extract evidence recorded",
      );
    },
  );
});

test("collector: Search and Extract are independently observable", async () => {
  await withEnv(
    {
      ONESHOT_RESEARCH_MODE: "external",
      TAVILY_API_KEY: "test-key-not-a-secret",
      ONESHOT_TAVILY_MODE: "search",
    },
    async () => {
      const { runner, ops } = recordingRunner();
      const collector = new ResearchEvidenceCollector(".", runner);
      const evidence = await collector.collect(prompt);
      assert.deepEqual(ops, ["search"]);
      assert.ok(evidence.some((e) => e.provenance.startsWith("tavily-search:")));
      assert.ok(!evidence.some((e) => e.provenance.startsWith("tavily-extract:")));
    },
  );
});

test("collector: workspace files carry workspace-file provenance", async () => {
  await withEnv(
    {
      ONESHOT_RESEARCH_MODE: "local-only",
      TAVILY_API_KEY: undefined,
      ONESHOT_RESEARCH_EVIDENCE_FILES: "package.json",
    },
    async () => {
      const collector = new ResearchEvidenceCollector(process.cwd());
      const evidence = await collector.collect(prompt);
      const fileEvidence = evidence.find((e) => e.source.startsWith("file:"));
      assert.ok(fileEvidence, "file evidence recorded");
      assert.equal(fileEvidence.provenance, EvidenceProvenance.WORKSPACE_FILE);
    },
  );
});

test("collector: prompt-only evidence can never satisfy a Tavily assertion", async () => {
  await withEnv(
    { ONESHOT_RESEARCH_MODE: "local-only", TAVILY_API_KEY: undefined },
    async () => {
      const collector = new ResearchEvidenceCollector(".");
      const evidence = await collector.collect(prompt);
      assert.throws(() => assertTavilyEvidence(evidence));
    },
  );
});

test("collector: disabled mode (default, no key) makes no Tavily request", async () => {
  await withEnv(
    { ONESHOT_RESEARCH_MODE: undefined, TAVILY_API_KEY: undefined },
    async () => {
      const { runner, ops } = recordingRunner();
      const collector = new ResearchEvidenceCollector(".", runner);
      const evidence = await collector.collect(prompt);
      assert.deepEqual(ops, []);
      assert.ok(evidence.length > 0);
    },
  );
});
