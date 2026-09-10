import { ToolRegistry } from "../../../tool/registry.js";
import type {
  ModelGenerateRequest,
  ModelProvider,
} from "../../../provider/model-provider.js";

/**
 * Researcher tool boundary over a model transport.
 * The provider can generate text; it cannot perform Researcher work or return
 * OneShot Researcher artifacts.
 */
export function researcherTools(provider: ModelProvider) {
  const registry = new ToolRegistry();
  registry.register<ModelGenerateRequest, string>(
    {
      name: "generate_text",
      description: "Generate model text for a Researcher-owned instruction.",
    },
    (request) => provider.generate(request),
  );
  return registry;
}
