import type { ProcessingEventBus } from "../runtime/event-bus.js";
import { getRuntimePaths } from "../runtime/runtime-config.js";
import type { ModelProvider } from "./model-provider.js";
import { ProviderManager } from "./manager.js";

/**
 * Resolve the currently captured model transport for Researcher activation.
 * Sample mode returns no provider: deterministic sample behavior belongs to
 * Researcher, not Provider Configuration.
 */
export async function resolveModelProvider(
  projectRoot: string,
  events?: ProcessingEventBus,
): Promise<ModelProvider | undefined> {
  const manager = new ProviderManager({
    projectRoot,
    events,
    runtimePaths: getRuntimePaths(projectRoot),
  });
  const captured = manager.captureForRun();
  return manager.resolveForRun(captured.id, captured);
}
