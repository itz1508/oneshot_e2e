import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  ResearchProvider,
  ResearchProviderReadiness,
} from "./provider.js";
import { WorkflowRootCauseError } from "../../../backend/core/root-cause-error.js";
import type { ProcessingEventBus } from "../../../backend/runtime/event-bus.js";
import { ProviderManager } from "./provider-manager.js";
import { getRuntimePaths } from "../../../backend/runtime/runtime-config.js";
import { FeatherlessResearchProvider } from "./provider/featherless/provider.js";
import {
  fixtureProviderFor,
  PROVIDER_ADAPTERS,
} from "./provider/shared/registry.js";

class MissingProductionResearchProvider implements ResearchProvider {
  async ready(_runId: string): Promise<ResearchProviderReadiness> {
    return {
      ready: false,
      provider: "unconfigured",
      models: [],
      detail: "ONESHOT_RESEARCH_PROVIDER is not configured",
    };
  }

  async research(
    _prompt: Parameters<ResearchProvider["research"]>[0],
    runId: string,
  ): Promise<never> {
    throw new WorkflowRootCauseError({
      issue: "ResearchProvider is not configured",
      expected:
        "An explicitly selected openai, anthropic, gemini, or custom production ResearchProvider",
      actual: "No production ResearchProvider was selected",
      evidence_ids: [],
      required_correction:
        "Set ONESHOT_RESEARCH_PROVIDER or configure ONESHOT_RESEARCH_PROVIDER_MODULE",
      recheck_target: runId,
    });
  }
}

/** Attach the event bus when the resolved provider supports it. */
function withEvents(
  provider: ResearchProvider,
  events?: ProcessingEventBus,
): ResearchProvider {
  if (events) provider.attachEvents?.(events);
  return provider;
}

/** Resolve the provider requested by the Researcher Agent activation pipeline. */
export async function resolveResearchProvider(
  projectRoot: string,
  events?: ProcessingEventBus,
): Promise<ResearchProvider> {
  const mode = (process.env.ONESHOT_MODE || "production").toLowerCase();

  if (mode === "sample") {
    return fixtureProviderFor(projectRoot);
  }

  if (mode !== "production" && mode !== "test") {
    throw new Error(`Unknown ONESHOT_MODE ${mode}`);
  }

  // The normal Agent pipeline shares the web-managed source of truth.
  // Environment-selected adapters are only a compatibility/test entrypoint.
  if (mode !== "test" && process.env.ONESHOT_LEGACY_PROVIDER_ENABLED !== "true") {
    return new ProviderManager({ projectRoot, events, runtimePaths: getRuntimePaths(projectRoot) }).createProvider();
  }

  const modulePath = process.env.ONESHOT_RESEARCH_PROVIDER_MODULE;
  const selected = (
    process.env.ONESHOT_RESEARCH_PROVIDER ||
    (modulePath ? "module" : "")
  ).toLowerCase();

  if (!selected) return new MissingProductionResearchProvider();

  if (selected === "featherless" || selected === "featherless_gemma4") {
    return withEvents(new FeatherlessResearchProvider(projectRoot), events);
  }

  const adapter = PROVIDER_ADAPTERS[selected === "google" ? "gemini" : selected];
  if (adapter) {
    return withEvents(adapter.createDefault(projectRoot), events);
  }

  if (!modulePath) return new MissingProductionResearchProvider();

  const mod = await import(
    pathToFileURL(resolve(projectRoot, modulePath)).href
  );
  const provider =
    typeof mod.createResearchProvider === "function"
      ? await mod.createResearchProvider()
      : mod.default;

  if (
    !provider ||
    typeof provider.research !== "function" ||
    typeof provider.ready !== "function"
  ) {
    throw new Error(
      "Configured ResearchProvider module must implement ready(runId) and research(prompt, runId)",
    );
  }

  return withEvents(provider as ResearchProvider, events);
}
