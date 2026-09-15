/**
 * Lazy construction of the ResearcherHandlerContext for M13 server wiring.
 * Constructs the router and runtime resolver only when researcher routes
 * are first accessed, avoiding startup cost when researcher routes are
 * unused.
 */
import type { ResearcherHandlerContext } from "./researcher-handlers.js";
import { createRouter } from "../integration/routing/router.js";
import { createProviderRegistry } from "../integration/provider/registry.js";
import { createEndpointRegistry } from "../integration/endpoint/registry.js";
import { createModelRegistry } from "../integration/model/registry.js";
import { createCapabilityRegistry } from "../integration/capability/registry.js";
import { createRuntimeRegistry } from "../integration/runtime/registry.js";
import { createRuntimeCompatibilityResolver } from "../integration/routing/runtime-compatibility.js";
import { ollamaPreset } from "../integration/provider/presets/ollama.js";
import { groqPreset } from "../integration/provider/presets/groq.js";
import { openaiPreset } from "../integration/provider/presets/openai.js";
import { FakeRuntime } from "../integration/runtime/fake-runtime.js";
import { DEFAULT_ROUTING_POLICY } from "../integration/core/policy.js";
import type { RunRepository } from "../runtime/run-repository.js";
import type { ProcessingEventBus } from "../runtime/event-bus.js";
import type { ArtifactStore } from "../runtime/artifact-store.js";
import type { CredentialPolicy } from "../security/credential-policy.js";
import type { ResearcherWorkflow } from "../agents/researcher/workflow.js";

let cached: ResearcherHandlerContext | undefined;

export function getResearcherContext(opts: {
  runs: RunRepository;
  events: ProcessingEventBus;
  store: ArtifactStore;
  researcher: ResearcherWorkflow;
  credentialPolicy: CredentialPolicy;
}): ResearcherHandlerContext {
  if (cached) return cached;

  const providers = createProviderRegistry([ollamaPreset, groqPreset, openaiPreset]);
  const endpoints = createEndpointRegistry();
  const models = createModelRegistry();
  const capabilities = createCapabilityRegistry();
  const runtimes = createRuntimeRegistry();
  const compatibility = createRuntimeCompatibilityResolver();

  // Register a fake runtime descriptor for the vertical slice.
  const fake = new FakeRuntime();
  runtimes.add({
    runtimeId: fake.runtimeId,
    displayName: "Fake Runtime (M13 vertical slice)",
    supportedTransports: ["openai-chat"],
  });

  const router = createRouter({
    providers, endpoints, models, capabilities, runtimes, compatibility,
  });

  const runtimeResolver = (id: string) => id === fake.runtimeId ? fake : undefined;

  cached = {
    runs: opts.runs,
    store: opts.store,
    events: opts.events,
    researcher: opts.researcher,
    router,
    routingPolicy: DEFAULT_ROUTING_POLICY,
    runtimeResolver,
    credentialPolicy: opts.credentialPolicy,
  };
  return cached;
}

