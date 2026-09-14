import test from "node:test";
import assert from "node:assert/strict";
import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";
import { harness, prompt } from "./harness.js";
import {
  createConfiguredStrandsModel,
  ResearcherWorkflow,
} from "../../agents/researcher/workflow.js";
import { resolveProviderConfiguration } from "../../integration/provider-discovery.js";
import { OpenAIModel } from "../../../app/integration/strands/src/index.js";
import { CanonicalContractSkill } from "../../skills/canonical-contract-skill.js";

test("Strands Researcher Live: external inference and ResearchBundle generation", async (t) => {
  const providerConfig = resolveProviderConfiguration();
  const liveEnabled = process.env.ONESHOT_LIVE_TEST === "true" || Boolean(providerConfig.baseUrl && providerConfig.apiKey);

  if (!liveEnabled) {
    t.skip("Live Strands test skipped: no provider credentials configured and ONESHOT_LIVE_TEST is not active");
    return;
  }

  // Fails when provider credential is unavailable
  assert.ok(
    providerConfig.baseUrl && providerConfig.apiKey,
    "Provider baseURL and apiKey are required for live Strands inference",
  );

  // 1. Resolve real live provider model (performs authenticated GET /models)
  const strandsModel = await createConfiguredStrandsModel();
  assert.ok(strandsModel, "Expected createConfiguredStrandsModel to return real OpenAIModel instance");
  assert.ok(
    strandsModel instanceof OpenAIModel,
    "Model must be an authentic Strands OpenAIModel instance (no mocks/stubs)",
  );

  // 2. Instantiate real harness with real contracts and real strandsModel
  const h = await harness("researcher-strands-live", strandsModel);
  const jobId = `job-live-strands-${Date.now()}`;
  const testPrompt: Prompt = prompt(jobId);

  try {
    // 3. Execute inference - external call to model provider
    const bundle: ResearchBundle = await h.researcher.run(testPrompt, jobId);

    // 4. Assert non-deterministic real output
    assert.ok(bundle, "Researcher must produce a ResearchBundle");
    assert.equal(bundle.prompt.prompt_id, `prompt:${jobId}`);
    assert.equal(bundle.researcher.prompt_id, bundle.prompt.prompt_id);
    assert.ok(bundle.researcher.evidence.length > 0, "Grounded evidence must be recorded");
    assert.ok(bundle.researcher.success_definition.success_criteria_ids.length > 0);
    assert.ok(bundle.plan.plan_id.startsWith("plan:"));
    assert.ok(bundle.goal.goal_id.startsWith("goal:"));
    assert.ok(bundle.schema_artifact.schema_id.startsWith("schema:"));
  } finally {
    h.close();
  }
});
