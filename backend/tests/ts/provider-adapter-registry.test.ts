import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProviderManager } from "../../runtime/provider-manager.js";
import { LocalFileSecretStore } from "../../runtime/provider-secret-store.js";
import { OpenAIModelProvider } from "../../role/researcher/provider/openai/provider.js";
import { AnthropicModelProvider } from "../../role/researcher/provider/anthropic/provider.js";
import { AdkGemmaResearchProvider } from "../../role/researcher/provider/adk-gemma2/provider.js";
import { RemoteChatResearchProvider } from "../../role/researcher/remote-chat-research-provider.js";
import { resolveProviderId } from "../../role/researcher/provider/registry.js";
import type { ModelResponse } from "../../role/researcher/provider/model-provider.js";
import type { ResearchProvider } from "../../role/researcher/provider.js";

async function mkdtempHelper(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "oneshot-adapter-"));
}

const PROVIDER_DRAFT = {
  summary: "Registry adapter draft for canonical handoff.",
  requirements: [
    "Generate the requested artifact through the canonical workflow.",
    "Expose concrete post-build verification evidence.",
  ],
  dependencies: [],
  plan_steps: [
    {
      description: "Prepare the requested artifact.",
      responsibility: "ProductImplementation",
      requirement_indexes: [0],
    },
    {
      description: "Verify the requested artifact.",
      responsibility: "CanonicalProof",
      requirement_indexes: [1],
    },
  ],
  success_meaning:
    "The provider-generated artifact is executed by Builder and verified by canonical hash proof.",
  success_criteria: [
    {
      statement: "Provider output reaches Builder.",
      measurement: "BuilderOutput step is present and executes successfully.",
      expected_result: "successful BuilderOutput execution",
      requirement_indexes: [0],
    },
    {
      statement: "Post-build proof matches confirmation proof.",
      measurement: "created and recomputed canonical hashes are equal.",
      expected_result: "equal hashes",
      requirement_indexes: [1],
    },
  ],
  deliverable: '{"kind":"registry-adapter-output","evidence_policy":"observed-only"}',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeManager(dir: string): ProviderManager {
  return new ProviderManager({
    projectRoot: process.cwd(),
    catalogPath: "backend/config/providers.json",
    runtimePaths: { root: dir, config: join(dir, "config") } as never,
    secretStore: new LocalFileSecretStore(join(dir, "secrets")),
  });
}

test("central aliases resolve to the normalized gemini identity", () => {
  assert.equal(resolveProviderId("google"), "gemini");
  assert.equal(resolveProviderId("adk_gemma2"), "gemini");
  assert.equal(resolveProviderId("openai"), "openai");
  assert.equal(resolveProviderId("anthropic"), "anthropic");
  assert.equal(resolveProviderId("featherless"), "featherless");
});

test("registry resolves openai, anthropic, and gemini catalog entries", async () => {
  const pm = makeManager(await mkdtempHelper());
  const openai = await pm.get("openai");
  assert.ok(openai && openai.adapter === "openai");
  const anthropic = await pm.get("anthropic");
  assert.ok(anthropic && anthropic.adapter === "anthropic");
  const gemini = await pm.get("gemini");
  assert.ok(gemini && gemini.adapter === "gemini");
});

test("google and adk_gemma2 aliases resolve to the gemini ADK implementation", async () => {
  const saved = [
    "GEMINI_DISTRIBUTION_MODEL",
    "GEMINI_RESEARCH_MODEL",
    "GEMINI_SYNTHESIS_MODEL",
  ].map((k) => [k, process.env[k]] as const);
  for (const [k] of saved) process.env[k] = `test-${k}`;
  try {
    const pm = makeManager(await mkdtempHelper());
    const status = await pm.getProviderStatus("adk_gemma2");
    assert.equal(status.providerId, "gemini");
    await pm.activate("google");
    assert.equal(pm.runtimeConfig().activeProvider, "gemini");
    for (const legacy of ["google", "adk_gemma2", "gemini"]) {
      const provider = await pm.resolveForRun(legacy);
      // All historical ids normalize to the same gemini ResearchProvider.
      assert.ok(provider instanceof RemoteChatResearchProvider, legacy);
    }
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("OpenAI model provider normalizes a mocked successful response", async () => {
  const provider = new OpenAIModelProvider({
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test-openai",
    timeoutSeconds: 5,
    maxOutputTokens: 64,
    fetchImpl: (async () =>
      jsonResponse({
        model: "gpt-4o-mini-2026-01",
        choices: [{ message: { content: JSON.stringify(PROVIDER_DRAFT) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })) as unknown as typeof fetch,
  });
  const response: ModelResponse = await provider.generate({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "produce the draft" }],
    responseFormat: "json",
    maxOutputTokens: 64,
  });
  assert.equal(response.provider, "openai");
  assert.equal(response.model, "gpt-4o-mini-2026-01");
  assert.equal(response.text, JSON.stringify(PROVIDER_DRAFT));
  assert.deepEqual(
    response.usage,
    { inputTokens: 10, outputTokens: 5 },
  );
  // Raw SDK response objects must not escape the adapter boundary.
  assert.ok(!("choices" in response) && !("data" in response));
  provider.close();
});

test("Anthropic model provider normalizes a mocked successful response", async () => {
  const provider = new AnthropicModelProvider({
    model: "claude-sonnet-4-5",
    baseUrl: "https://api.anthropic.com",
    apiKey: "ak-test-anthropic",
    timeoutSeconds: 5,
    maxOutputTokens: 64,
    fetchImpl: (async () =>
      jsonResponse({
        model: "claude-sonnet-4-5-2026",
        content: [{ type: "text", text: JSON.stringify(PROVIDER_DRAFT) }],
        usage: { input_tokens: 8, output_tokens: 4 },
      })) as unknown as typeof fetch,
  });
  const response: ModelResponse = await provider.generate({
    model: "claude-sonnet-4-5",
    messages: [
      { role: "system", content: "system instruction" },
      { role: "user", content: "produce the draft" },
    ],
    temperature: 0.2,
    responseFormat: "json",
  });
  assert.equal(response.provider, "anthropic");
  assert.equal(response.model, "claude-sonnet-4-5-2026");
  assert.equal(response.text, JSON.stringify(PROVIDER_DRAFT));
  provider.close();
});

test("BYOK key never appears in normalized responses, errors, or events", async () => {
  const secret = "sk-super-secret-key-123";
  const provider = new OpenAIModelProvider({
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    apiKey: secret,
    timeoutSeconds: 5,
    maxOutputTokens: 64,
    fetchImpl: (async () =>
      jsonResponse({ error: { message: "boom" } }, 500)) as unknown as typeof fetch,
  });
  const probe = await provider.testConnection();
  assert.equal(probe.ok, false);
  assert.ok(!JSON.stringify(probe).includes(secret));

  const events: unknown[] = [];
  const bus = { emit: (...args: unknown[]) => events.push(args) } as never;
  const researcher = new RemoteChatResearchProvider({
    projectRoot: process.cwd(),
    modelProvider: provider,
    model: "gpt-4o-mini",
    apiKey: secret,
    events: bus,
  });
  await assert.rejects(
    researcher.research(
      {
        prompt_id: "p",
        intent: "i",
        requested_outcome: "o",
        context: [],
        research_direction: [],
      },
      "run-leak",
    ),
    (error: Error) => {
      assert.ok(!JSON.stringify(error).includes(secret));
      return true;
    },
  );
  assert.ok(
    !JSON.stringify(events).includes(secret),
    "credential leaked into processing events",
  );
  researcher.close();
});

test("one shared canonical path: mocked responses from both providers yield valid ResearchDrafts with BuilderOutput steps", async () => {
  const factories = [
    () =>
      new OpenAIModelProvider({
        model: "gpt-4o-mini",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test-openai",
        timeoutSeconds: 5,
        maxOutputTokens: 512,
        fetchImpl: (async () =>
          jsonResponse({
            choices: [{ message: { content: JSON.stringify(PROVIDER_DRAFT) } }],
          })) as unknown as typeof fetch,
      }),
    () =>
      new AnthropicModelProvider({
        model: "claude-sonnet-4-5",
        baseUrl: "https://api.anthropic.com",
        apiKey: "ak-test-anthropic",
        timeoutSeconds: 5,
        maxOutputTokens: 512,
        fetchImpl: (async () =>
          jsonResponse({
            content: [{ type: "text", text: JSON.stringify(PROVIDER_DRAFT) }],
          })) as unknown as typeof fetch,
      }),
  ];
  for (const factory of factories) {
    const researcher = new RemoteChatResearchProvider({
      projectRoot: process.cwd(),
      modelProvider: factory(),
      model: "test-model",
    });
    const bundle = await researcher.research(
      {
        prompt_id: "p",
        intent: "i",
        requested_outcome: "o",
        context: [],
        research_direction: [],
      },
      "shared-path-run",
    );
    assert.equal(bundle.plan.plan_id, "plan:shared-path-run");
    assert.ok(
      bundle.plan.steps.some((s) => s.responsibility === "BuilderOutput"),
      "provider deliverable must ride the canonical plan",
    );
    researcher.close();
  }
});

test("malformed model output fails canonical validation regardless of provider", async () => {
  const cases: Array<[string, ResearchProvider]> = [
    [
      "openai",
      new RemoteChatResearchProvider({
        projectRoot: process.cwd(),
        modelProvider: new OpenAIModelProvider({
          model: "gpt-4o-mini",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test-openai",
          timeoutSeconds: 5,
          maxOutputTokens: 512,
          fetchImpl: (async () =>
            jsonResponse({
              choices: [
                { message: { content: "I cannot produce that artifact, sorry!" } },
              ],
            })) as unknown as typeof fetch,
        }),
        model: "gpt-4o-mini",
      }),
    ],
    [
      "anthropic",
      new RemoteChatResearchProvider({
        projectRoot: process.cwd(),
        modelProvider: new AnthropicModelProvider({
          model: "claude-sonnet-4-5",
          baseUrl: "https://api.anthropic.com",
          apiKey: "ak-test-anthropic",
          timeoutSeconds: 5,
          maxOutputTokens: 512,
          fetchImpl: (async () =>
            jsonResponse({
              content: [{ type: "text", text: '{"summary": "incomplete"}' }],
            })) as unknown as typeof fetch,
        }),
        model: "claude-sonnet-4-5",
      }),
    ],
  ];
  for (const [name, researcher] of cases) {
    await assert.rejects(
      researcher.research(
        {
          prompt_id: "p",
          intent: "i",
          requested_outcome: "o",
          context: [],
          research_direction: [],
        },
        `malformed-${name}`,
      ),
      /provider response was rejected/,
      name,
    );
    researcher.close?.();
  }
});

test("transient BYOK probe credentials are never persisted automatically", async () => {
  const tmp = await mkdtempHelper();
  const secretStore = new LocalFileSecretStore(join(tmp, "secrets"));

  // No network: the probe outcome is stubbed; the assertion target is the
  // ProviderManager credential lifecycle (transient → never persisted).
  class ProbeStubManager extends ProviderManager {
    protected override constructProvider(): ResearchProvider {
      return {
        async ready() {
          return {
            ready: true,
            provider: "openai",
            models: ["gpt-4o-mini"],
            detail: "probe verified",
          };
        },
      } as unknown as ResearchProvider;
    }
  }
  const pm = new ProbeStubManager({
    projectRoot: process.cwd(),
    catalogPath: "backend/config/providers.json",
    runtimePaths: { root: tmp, config: join(tmp, "config") } as never,
    secretStore,
  });
  await pm.test("openai", {
    providerId: "openai",
    credentialType: "api_key",
    value: "sk-transient-probe",
    createdAt: new Date().toISOString(),
  });
  assert.equal(await secretStore.has("openai"), false);
  assert.equal(await secretStore.has("gemini"), false);
});

test("probe failure categories normalize for the new adapters", async () => {
  const tmp = await mkdtempHelper();
  class AuthStubManager extends ProviderManager {
    protected override constructProvider(): ResearchProvider {
      return {
        async ready() {
          return {
            ready: false,
            provider: "openai",
            models: ["gpt-4o-mini"],
            detail: "PROVIDER_AUTH_FAILURE: openai request failed with HTTP 401",
          };
        },
      } as unknown as ResearchProvider;
    }
  }
  const auth = await new AuthStubManager({
    projectRoot: process.cwd(),
    runtimePaths: { root: tmp, config: join(tmp, "config") } as never,
  }).test("openai");
  assert.equal(auth.category, "PROVIDER_AUTH_FAILURE");

  class ModelStubManager extends ProviderManager {
    protected override constructProvider(): ResearchProvider {
      return {
        async ready() {
          return {
            ready: false,
            provider: "anthropic",
            models: ["claude-sonnet-4-5"],
            detail:
              "PROVIDER_MODEL_FAILURE: configured model claude-sonnet-4-5 was not returned by the live Anthropic models endpoint",
          };
        },
      } as unknown as ResearchProvider;
    }
  }
  const model = await new ModelStubManager({
    projectRoot: process.cwd(),
    runtimePaths: { root: tmp, config: join(tmp, "config") } as never,
  }).test("anthropic");
  assert.equal(model.category, "PROVIDER_MODEL_FAILURE");

  class NetworkStubManager extends ProviderManager {
    protected override constructProvider(): ResearchProvider {
      return {
        async ready() {
          throw new Error(
            "PROVIDER_NETWORK_FAILURE: fetch failed: getaddrinfo ENOTFOUND api.openai.com",
          );
        },
      } as unknown as ResearchProvider;
    }
  }
  const network = await new NetworkStubManager({
    projectRoot: process.cwd(),
    runtimePaths: { root: tmp, config: join(tmp, "config") } as never,
  }).test("openai");
  assert.equal(network.category, "PROVIDER_NETWORK_FAILURE");
  assert.equal(network.retryable, true);
});

test("adapter close is clean across the registry", async () => {
  const saved = [
    "GEMINI_DISTRIBUTION_MODEL",
    "GEMINI_RESEARCH_MODEL",
    "GEMINI_SYNTHESIS_MODEL",
  ].map((k) => [k, process.env[k]] as const);
  for (const [k] of saved) process.env[k] = `test-${k}`;
  try {
    const pm = makeManager(await mkdtempHelper());
    for (const id of ["gemini", "openai", "anthropic"]) {
      const provider = await pm.resolveForRun(id);
      assert.doesNotThrow(() => provider.close?.(), id);
    }
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
