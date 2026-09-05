import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  ResearchProvider,
  ResearchProviderReadiness,
} from "./provider.js";
import { FixtureResearchProvider } from "./tool/fixture-provider.js";
import { WorkflowRootCauseError } from "../../core/root-cause-error.js";
import { AdkGemmaResearchProvider } from "./provider/adk-gemma2/provider.js";
import { FeatherlessResearchProvider } from "./provider/featherless/provider.js";
import type { ProcessingEventBus } from "../../runtime/event-bus.js";

function resolveSeedFixture(projectRoot: string): string {
  const p1 = resolve(projectRoot, "app/fixtures/product/complete-success-seed.json");
  if (existsSync(p1)) return p1;
  const p2 = resolve(projectRoot, "fixtures/product/complete-success-seed.json");
  if (existsSync(p2)) return p2;
  return p1;
}

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
        "An explicitly selected adk_gemma2, featherless, or custom production ResearchProvider",
      actual: "No production ResearchProvider was selected",
      evidence_ids: [],
      required_correction:
        "Set ONESHOT_RESEARCH_PROVIDER or configure ONESHOT_RESEARCH_PROVIDER_MODULE",
      recheck_target: runId,
    });
  }
}

/** Resolve the provider requested by the Researcher Role activation pipeline. */
export async function resolveResearchProvider(
  projectRoot: string,
  events?: ProcessingEventBus,
): Promise<ResearchProvider> {
  const mode = (process.env.ONESHOT_MODE || "sample").toLowerCase();

  if (mode === "sample") {
    return new FixtureResearchProvider(
      resolveSeedFixture(projectRoot),
    );
  }

  if (mode !== "production" && mode !== "test") {
    throw new Error(`Unknown ONESHOT_MODE ${mode}`);
  }

  const modulePath = process.env.ONESHOT_RESEARCH_PROVIDER_MODULE;
  const selected = (
    process.env.ONESHOT_RESEARCH_PROVIDER ||
    (modulePath ? "module" : "")
  ).toLowerCase();

  if (!selected) return new MissingProductionResearchProvider();

  if (selected === "adk_gemma2" || selected === "google_adk_gemma2") {
    const provider = new AdkGemmaResearchProvider(projectRoot);
    if (events) provider.attachEvents(events);
    return provider;
  }

  if (selected === "featherless" || selected === "featherless_gemma4") {
    const provider = new FeatherlessResearchProvider(projectRoot);
    if (events) provider.attachEvents(events);
    return provider;
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

  if (events && (provider as ResearchProvider).attachEvents) {
    (provider as ResearchProvider).attachEvents!(events);
  }

  return provider as ResearchProvider;
}
