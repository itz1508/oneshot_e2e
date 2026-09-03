import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { resolveResearchProvider } from "../../role/researcher/provider-resolver.js";
import { AdkGemmaResearchProvider } from "../../role/researcher/provider/adk-gemma2/provider.js";
import { harness, prompt } from "./harness.js";

test("Google ADK + Gemma provider boundary executes canonical chain in deterministic adapter mode", async () => {
  const saved = {
    mode: process.env.ONESHOT_MODE,
    provider: process.env.ONESHOT_RESEARCH_PROVIDER,
    draft: process.env.ONESHOT_ADK_TEST_DRAFT_FILE,
    parallel: process.env.GEMMA2_NUM_PARALLEL,
  };
  process.env.ONESHOT_MODE = "production";
  process.env.ONESHOT_RESEARCH_PROVIDER = "adk_gemma2";
  process.env.ONESHOT_ADK_TEST_DRAFT_FILE =
    "app/fixtures/provider/adk-research-draft.json";
  process.env.GEMMA2_NUM_PARALLEL = "2";
  const p = await resolveResearchProvider(process.cwd());
  assert.ok(p instanceof AdkGemmaResearchProvider);
  const h = await harness("adk-gemma-provider", p);
  const runId = "adk-gemma-provider";
  h.runs.create(runId);
  try {
    const out = await h.runtime.run(runId, prompt(runId));
    assert.equal(out.result, "PASSED");
    assert.equal(out.hash_proof?.equal, true);
    const research = await h.store.load<any>(runId, "researcher");
    assert.match(research.evidence[0].source, /google-adk:gemma2:9b/);
    assert.equal(research.requirement_ids.length, 2);
    const plan = await h.store.load<any>(runId, "plan.researcher");
    assert.equal(
      plan.dependencies[0].required_by[0],
      research.requirement_ids[1],
    );
    const schema = await h.store.load<any>(runId, "schema");
    assert.match(schema.schema_document.$id, /urn:oneshot:research-schema:/);
    const fixture = await h.store.load<any>(runId, "fixture");
    assert.ok(fixture.plan_assertions.length > 1);
    assert.ok(
      research.evidence.some((e: any) =>
        String(e.provenance).includes("user-prompt"),
      ),
    );
    assert.equal(
      out.events.find((e) => e.processor === "Done" && e.state === "COMPLETE")
        ?.result,
      "PASSED",
    );
  } finally {
    p.close?.();
    h.bridge.close();
    for (const [k, v] of Object.entries(saved)) {
      const name =
        k === "mode"
          ? "ONESHOT_MODE"
          : k === "provider"
            ? "ONESHOT_RESEARCH_PROVIDER"
            : k === "draft"
              ? "ONESHOT_ADK_TEST_DRAFT_FILE"
              : "GEMMA2_NUM_PARALLEL";
      if (v === undefined) delete process.env[name];
      else process.env[name] = v;
    }
  }
});
