import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ResearchProvider } from "./provider.js";
import { FixtureResearchProvider } from "./tool/fixture-provider.js";
import { WorkflowRootCauseError } from "../../core/root-cause-error.js";
import { AdkGemmaResearchProvider } from "./provider/adk-gemma2/provider.js";
import { FeatherlessResearchProvider } from "./provider/featherless/provider.js";
import type { ProcessingEventBus } from "../../runtime/event-bus.js";

class MissingProductionResearchProvider implements ResearchProvider {
  async research(
    _prompt: Parameters<ResearchProvider["research"]>[0],
    runId: string,
  ): Promise<never> {
    throw new WorkflowRootCauseError({
      issue: "ResearchProvider is not configured",
      expected:
        "adk_gemma2, featherless, or a configured production ResearchProvider module",
      actual: "No supported production ResearchProvider was selected",
      evidence_ids: [],
      required_correction:
        "Select a supported provider or configure a module exporting createResearchProvider() or default ResearchProvider",
      recheck_target: runId,
    });
  }
}

/**
 * Resolve the appropriate research provider based on ONESHOT_MODE and
 * ONESHOT_RESEARCH_PROVIDER environment variables.
 *
 * Accepts an optional ProcessingEventBus to wire ADK-scoped event emission
 * through providers that support it.
 */
export async function resolveResearchProvider(
  projectRoot: string,
  events?: ProcessingEventBus,
): Promise<ResearchProvider> {
  const mode = (process.env.ONESHOT_MODE || "sample").toLowerCase();

  if (mode === "sample") {
    return new FixtureResearchProvider(
      resolve(projectRoot, "fixtures/product/complete-success-seed.json"),
    );
  }

  if (mode !== "production" && mode !== "test") {
    throw new Error(`Unknown ONESHOT_MODE ${mode}`);
  }

  const modulePath = process.env.ONESHOT_RESEARCH_PROVIDER_MODULE;
  const selected = (
    process.env.ONESHOT_RESEARCH_PROVIDER ||
    (modulePath ? "module" : "adk_gemma2")
  ).toLowerCase();

  if (selected === "adk_gemma2" || selected === "google_adk_gemma2") {
    const p = new AdkGemmaResearchProvider(projectRoot);
    if (events) p.attachEvents(events);
    return p;
  }

  if (selected === "featherless" || selected === "featherless_gemma4") {
    const p = new FeatherlessResearchProvider(projectRoot);
    if (events) p.attachEvents(events);
    return p;
  }

  if (!modulePath) return new MissingProductionResearchProvider();

  const mod = await import(
    pathToFileURL(resolve(projectRoot, modulePath)).href
  );
  const provider =
    typeof mod.createResearchProvider === "function"
      ? await mod.createResearchProvider()
      : mod.default;

  if (!provider || typeof provider.research !== "function") {
    throw new Error(
      "Configured ResearchProvider module does not implement research(prompt, runId)",
    );
  }

  if (events && (provider as ResearchProvider).attachEvents) {
    (provider as ResearchProvider).attachEvents!(events);
  }

  return provider as ResearchProvider;
}
