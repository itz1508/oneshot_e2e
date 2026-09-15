import test from "node:test";
import assert from "node:assert/strict";

import {
  decideResearchPolicy,
  assertTavilyEvidence,
  EvidenceProvenance,
  resolveRequestedResearchMode,
  ResearchPolicyError,
} from "../../integration/research/policy.js";

function withEnv(
  values: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
): Promise<void> {
  const before = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(values)) {
    before.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  return Promise.resolve(fn()).finally(() => {
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

test("policy: disabled never allows external", () => {
  for (const externalConfigured of [false, true]) {
    const d = decideResearchPolicy({
      requested: "disabled",
      externalConfigured,
    });
    assert.equal(d.externalAllowed, false);
    assert.equal(d.externalRequired, false);
  }
});

test("policy: local-only makes no Tavily request regardless of key", () => {
  const d = decideResearchPolicy({
    requested: "local-only",
    externalConfigured: true,
  });
  assert.equal(d.mode, "local-only");
  assert.equal(d.externalAllowed, false);
});

test("policy: external fails closed when Tavily unavailable", () => {
  assert.throws(
    () =>
      decideResearchPolicy({
        requested: "external",
        externalConfigured: false,
      }),
    (error: unknown) =>
      error instanceof ResearchPolicyError &&
      error.code === "RESEARCH_EXTERNAL_UNAVAILABLE",
  );
});

test("policy: external allowed only when configured", () => {
  const d = decideResearchPolicy({
    requested: "external",
    externalConfigured: true,
  });
  assert.equal(d.externalAllowed, true);
  assert.equal(d.externalRequired, true);
});

test("policy: hybrid with Tavily records local AND external evidence", () => {
  const d = decideResearchPolicy({
    requested: "hybrid",
    externalConfigured: true,
  });
  assert.equal(d.externalAllowed, true);
  assert.equal(d.externalRequired, false, "hybrid also allows workspace evidence");
});

test("policy: hybrid without Tavily degrades to workspace evidence only", () => {
  const d = decideResearchPolicy({
    requested: "hybrid",
    externalConfigured: false,
  });
  assert.equal(d.mode, "hybrid");
  assert.equal(d.externalAllowed, false);
});

test("provenance: only tavily-prefixed evidence satisfies a Tavily assertion", () => {
  assert.doesNotThrow(() =>
    assertTavilyEvidence([
      { provenance: "tavily-search:req1:https://example.com" },
      { provenance: "user-prompt" },
    ]),
  );
  assert.doesNotThrow(() =>
    assertTavilyEvidence([{ provenance: "tavily-extract:req1:https://example.com" }]),
  );
});

test("provenance: prompt-only and workspace evidence can NEVER satisfy Tavily", () => {
  const promptOnly = [
    { provenance: EvidenceProvenance.USER_PROMPT },
    { provenance: EvidenceProvenance.USER_PROMPT_CONTEXT },
    { provenance: EvidenceProvenance.WORKSPACE_FILE },
    { provenance: EvidenceProvenance.PROVIDER_SYNTHESIS },
  ];
  assert.throws(
    () => assertTavilyEvidence(promptOnly),
    (error: unknown) =>
      error instanceof ResearchPolicyError &&
      error.code === "RESEARCH_ASSERTION_UNSATISFIED",
  );
});

test("mode resolution: explicit ONESHOT_RESEARCH_MODE wins", async () => {
  await withEnv({ ONESHOT_RESEARCH_MODE: "local-only" }, async () => {
    assert.equal(resolveRequestedResearchMode(), "local-only");
  });
  await withEnv({ ONESHOT_RESEARCH_MODE: "hybrid" }, async () => {
    assert.equal(resolveRequestedResearchMode(), "hybrid");
  });
});

test("mode resolution: default derived from Tavily availability (preserved)", async () => {
  await withEnv(
    { ONESHOT_RESEARCH_MODE: undefined, TAVILY_API_KEY: "k" },
    async () => {
      assert.equal(resolveRequestedResearchMode(), "external");
    },
  );
  await withEnv(
    { ONESHOT_RESEARCH_MODE: undefined, TAVILY_API_KEY: undefined },
    async () => {
      assert.equal(resolveRequestedResearchMode(), "disabled");
    },
  );
});
