import { randomUUID } from "node:crypto";
import type { SkillCatalog } from "./catalog.js";
import type { SkillRegistry } from "./registry.js";
import type { SkillResolver } from "./resolver.js";
import type {
  ActivatedSkill,
  ActivationContext,
  ActivationRecord,
  SkillDescriptor,
  SkillResolutionQuery,
} from "./types.js";

/**
 * Skill Activation Engine — binds resolved reusable Skill capabilities to
 * caller execution contexts and active Tool surfaces.
 */
export class SkillActivationEngine {
  constructor(
    private resolver: SkillResolver,
    private registry: SkillRegistry,
    private catalog: SkillCatalog,
  ) {}

  /**
   * Activate a Skill by exact query (skill_id, capability, or tool).
   *
   * Lifecycle:
   * 1. Exact resolution against catalog.
   * 2. Factory lookup in registry.
   * 3. Instantiation and binding.
   * 4. Activation tracking in registry.
   */
  async activate(
    query: SkillResolutionQuery,
    ctx: ActivationContext,
  ): Promise<ActivatedSkill> {
    const resolution = this.resolver.resolveExact(query);
    if (!resolution.resolved || !resolution.descriptor) {
      throw new Error(
        `Skill activation failed: ${resolution.reason || "capability not found"}`,
      );
    }

    const descriptor = resolution.descriptor;
    const activationId = `act:${descriptor.skill_id}:${randomUUID()}`;
    const activatedAt = new Date().toISOString();

    const factory = this.registry.getFactory(descriptor.skill_id);
    let instance: ActivatedSkill;

    if (factory) {
      instance = await factory(descriptor, ctx);
    } else {
      // Default activated wrapper for declarative/custom skills without a registered factory
      instance = {
        skill_id: descriptor.skill_id,
        descriptor,
        activated_at: activatedAt,
        caller_id: ctx.caller_id,
        async invoke<T>(_tool: string, _input: unknown): Promise<T> {
          throw new Error(
            `Skill '${descriptor.skill_id}' has no registered execution runtime factory`,
          );
        },
        definitions() {
          return descriptor.tools.map((t) => ({
            name: t,
            description: `${descriptor.skill_id}:${t}`,
          }));
        },
        async deactivate() {},
      };
    }

    const activationRecord: ActivationRecord = {
      activation_id: activationId,
      skill_id: descriptor.skill_id,
      caller_id: ctx.caller_id,
      activated_at: activatedAt,
      state: "ACTIVE",
    };

    // Wrap deactivate to ensure state transition in registry
    const originalDeactivate = instance.deactivate.bind(instance);
    instance.deactivate = async () => {
      await originalDeactivate();
      this.registry.markDeactivated(activationId);
    };

    this.registry.recordActivation(activationRecord, instance);

    return instance;
  }
}
