import { SkillLoader } from "../../skills/loader.js";
import type { SkillActivationGate, SkillRuntimeBinding } from "../../skills/types.js";

export interface BuilderSkillLoaderConfig {
  registry: Map<string, SkillRuntimeBinding>;
  gate: SkillActivationGate;
}

export function createBuilderSkillLoader(config: BuilderSkillLoaderConfig): SkillLoader {
  return new SkillLoader({
    registry: config.registry,
    gate: config.gate,
  });
}
