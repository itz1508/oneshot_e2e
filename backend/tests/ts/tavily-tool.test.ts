import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProviderManager } from "../../runtime/provider-manager.js";
import { LocalFileSecretStore } from "../../runtime/provider-secret-store.js";
import {
  TavilyEvidenceCollector,
  type TavilyCollectorOptions,
} from "../../role/researcher/tool/tavily/evidence.js";
import type {
  TavilyRequest,
  TavilyRunner,
} from "../../role/researcher/tool/tavily/bridge.js";
import type { Prompt } from "../../contracts/schema/types.js";

const TAVILY_KEY = "tvly-byok-secret-9876543210";

const prompt: Prompt = {
  prompt_id: "prompt:tavily-tool-test",
  intent: "Research current software evaluation practices",
  requested_outcome: "Collect authoritative current evidence.",
  context: [],
  research_direction: ["evaluation evidence"],
};

function makeCollector(
  runner: TavilyRunner,
  options: TavilyCollectorOptions = {},
): TavilyEvidenceCollector {
  return new TavilyEvidenceCollector(join(tmpdir(), "oneshot-tavily"), runner, options);
}

test("Tavily disabled means no Tavily request executes at all", async () => {
  let calls = 0;
  const runner: TavilyRunner = {
    async run() {
      calls += 1;
      return {};
    },
  } as unknown as TavilyRunner;
  const collector = makeCollector(runner, { enabled: false, apiKey: TAVILY_KEY });
  const evidence = await collector.collect(prompt);
  assert.deepEqual(evidence, []);
  assert.equal(calls, 0, "disabled Tavily must not perform any request");
});

test("Tavily enabled enriches evidence through the runner without leaking the BYOK key", async () => {
  const requests: TavilyRequest[] = [];
  const runner: TavilyRunner = {
    async run(request: TavilyRequest) {
      requests.push(request);
      return {
        answer: "Authoritative current evidence summary.",
        results: [
          { title: "Source", url: "https://example.com/src", content: "content" },
        ],
        request_id: "req-1",
      };
    },
  } as unknown as TavilyRunner;
  const collector = makeCollector(runner, {
    enabled: true,
    apiKey: TAVILY_KEY,
    searchDepth: "basic",
    maxResults: 3,
  });
  const evidence = await collector.collect(prompt);
  assert.ok(evidence.length > 0, "evidence must be enriched when enabled");
  assert.ok(
    !JSON.stringify(evidence).includes(TAVILY_KEY),
    "BYOK key leaked into evidence",
  );
  const search = requests[0] as Extract<typeof requests[number], { op: "search" }>;
  assert.equal(search.op, "search");
  assert.equal(search.search_depth, "basic");
  assert.equal(search.max_results, 3);
});

test("enabled Tavily without a key fails visibly and never echoes secrets", async () => {
  const runner: TavilyRunner = {
    async run() {
      throw new Error("worker should not be reached");
    },
  };
  const collector = makeCollector(runner, { enabled: true });
  await assert.rejects(
    collector.collect(prompt),
    (error: Error) => {
      assert.match(error.message, /Tavily API key is required/);
      assert.ok(!error.message.includes(TAVILY_KEY));
      return true;
    },
  );
});

test("Tavily is a research TOOL: it is not part of the model provider registry", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "oneshot-tavily-tool-"));
  const pm = new ProviderManager({
    projectRoot: process.cwd(),
    catalogPath: "backend/config/providers.json",
    runtimePaths: { root: tmp, config: join(tmp, "config") } as never,
    secretStore: new LocalFileSecretStore(join(tmp, "secrets")),
  });
  const ids = (await pm.list()).map((p) => p.id);
  assert.ok(!ids.includes("tavily"), "tavily must not be a model provider");
  // The tool credential boundary is separate and tavily-scoped.
  await assert.rejects(
    () => pm.setToolCredential("openai", {
      providerId: "openai",
      credentialType: "api_key",
      value: "sk-x",
      createdAt: new Date().toISOString(),
    }),
    /Unknown research tool/,
  );
});

test("Tavily tool credentials stay server-side and never persist automatically from a probe", async () => {
  const tmp = await mkdtempHelper();
  const secretStore = new LocalFileSecretStore(join(tmp, "secrets"));
  const pm = new ProviderManager({
    projectRoot: process.cwd(),
    catalogPath: "backend/config/providers.json",
    runtimePaths: { root: tmp, config: join(tmp, "config") } as never,
    secretStore,
  });
  await pm.setToolCredential("tavily", {
    providerId: "tavily",
    credentialType: "api_key",
    value: TAVILY_KEY,
    createdAt: new Date().toISOString(),
  });
  const stored = await pm.getToolCredential("tavily");
  assert.equal(stored?.value, TAVILY_KEY);
  // Stored tool credentials are server-side only: never in catalog/status.
  const statuses = JSON.stringify(await pm.listProviderStatus());
  assert.ok(!statuses.includes(TAVILY_KEY));
});

async function mkdtempHelper(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "oneshot-tavily-tool-"));
}