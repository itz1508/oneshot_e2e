import type {
  ActivatedSkill,
  ActivationContext,
  ActivationRecord,
  SkillDescriptor,
  SkillRuntimeFactory,
} from "./types.js";

/**
 * Skill Registry — manages runtime factories and tracks active Skill states.
 */
export class SkillRegistry {
  private factories = new Map<string, SkillRuntimeFactory>();
  private activations = new Map<string, ActivationRecord[]>();
  private activeInstances = new Map<string, ActivatedSkill>();

  /** Register a runtime factory function for a specific skill_id. */
  registerFactory(skillId: string, factory: SkillRuntimeFactory): void {
    this.factories.set(skillId, factory);
  }

  /** Check if a runtime factory is registered for a skill_id. */
  hasFactory(skillId: string): boolean {
    return this.factories.has(skillId);
  }

  /** Retrieve the runtime factory for a skill_id. */
  getFactory(skillId: string): SkillRuntimeFactory | undefined {
    return this.factories.get(skillId);
  }

  /** Record a new Skill activation. */
  recordActivation(record: ActivationRecord, instance?: ActivatedSkill): void {
    const list = this.activations.get(record.skill_id) || [];
    list.push(record);
    this.activations.set(record.skill_id, list);

    if (instance) {
      this.activeInstances.set(record.activation_id, instance);
    }
  }

  /** Mark an activation as deactivated. */
  markDeactivated(activationId: string): void {
    for (const [_, list] of this.activations.entries()) {
      const rec = list.find((r) => r.activation_id === activationId);
      if (rec) {
        rec.state = "DEACTIVATED";
        rec.deactivated_at = new Date().toISOString();
      }
    }
    this.activeInstances.delete(activationId);
  }

  /** Retrieve all activation records for a skill_id. */
  getActivations(skillId?: string): ActivationRecord[] {
    if (skillId) {
      return this.activations.get(skillId) || [];
    }
    return Array.from(this.activations.values()).flat();
  }

  /** List all skill_ids that have registered runtime factories. */
  listRegisteredFactories(): string[] {
    return Array.from(this.factories.keys());
  }
}
