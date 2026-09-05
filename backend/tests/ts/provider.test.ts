import test from "node:test";
import assert from "node:assert/strict";
import { resolveResearchProvider } from "../../role/researcher/provider-resolver.js";
import { FixtureResearchProvider } from "../../role/researcher/tool/fixture-provider.js";
import { AdkGemmaResearchProvider } from "../../role/researcher/provider/adk-gemma2/provider.js";
import { FeatherlessResearchProvider } from "../../role/researcher/provider/featherless/provider.js";

test("ResearchProvider resolution separates sample, unconfigured production, and explicit remote providers", async () => {
  const saved = {
    mode: process.env.ONESHOT_MODE,
    provider: process.env.ONESHOT_RESEARCH_PROVIDER,
    module: process.env.ONESHOT_RESEARCH_PROVIDER_MODULE,
  };
  try {
    process.env.ONESHOT_MODE = "sample";
    delete process.env.ONESHOT_RESEARCH_PROVIDER;
    delete process.env.ONESHOT_RESEARCH_PROVIDER_MODULE;
    assert.ok(
      (await resolveResearchProvider(process.cwd())) instanceof
        FixtureResearchProvider,
    );

    // Production must not silently choose a model/provider. Binding is explicit.
    process.env.ONESHOT_MODE = "production";
    delete process.env.ONESHOT_RESEARCH_PROVIDER;
    const unconfigured = await resolveResearchProvider(process.cwd());
    const readiness = await unconfigured.ready("provider-test");
    assert.equal(readiness.ready, false);
    assert.equal(readiness.provider, "unconfigured");
    assert.match(readiness.detail || "", /not configured/i);
    unconfigured.close?.();

    process.env.ONESHOT_RESEARCH_PROVIDER = "featherless";
    const remote = await resolveResearchProvider(process.cwd());
    assert.ok(remote instanceof FeatherlessResearchProvider);
    remote.close?.();
  } finally {
    const names = {
      mode: "ONESHOT_MODE",
      provider: "ONESHOT_RESEARCH_PROVIDER",
      module: "ONESHOT_RESEARCH_PROVIDER_MODULE",
    } as const;
    for (const [key, value] of Object.entries(saved)) {
      const name = names[key as keyof typeof names];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
