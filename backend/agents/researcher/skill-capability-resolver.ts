/**
 * Resolve multimodal capabilities (vision, generate, action) from the set of
 * conversation-activated skills.
 */
import type { SkillActivationState, SkillGroup, SkillRuntimeBinding } from "../../skills/types.js";

export interface ResolvedCapabilities {
  vision: boolean;
  generate: boolean;
  action: boolean;
  groups: SkillGroup[];
}

export function resolveCapabilities(
  bindings: SkillRuntimeBinding[],
  activations: SkillActivationState[],
): ResolvedCapabilities {
  const activeIds = new Set(activations.map((a) => a.skill_id));
  const groups = new Set<SkillGroup>();

  for (const binding of bindings) {
    if (!binding.available) continue;
    if (!activeIds.has(binding.descriptor.skill_id)) continue;
    for (const g of binding.descriptor.groups ?? []) {
      groups.add(g);
    }
  }

  return {
    vision: groups.has("vision"),
    generate: groups.has("generate"),
    action: groups.has("action"),
    groups: Array.from(groups),
  };
}
