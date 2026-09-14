/**
 * Conversation-scoped opt-in skill activation gate.
 *
 * A skill is never loaded into an agent invocation unless it has been explicitly
 * activated for the current conversation. Cross-conversation activations are
 * rejected; run-scoped activations must match the run id.
 */
import type {
  SkillActivationState,
  SkillActivationStore,
  SkillDescriptor,
  SkillGroup,
} from "./types.js";

export class SkillConversationActivationGate {
  constructor(private store: SkillActivationStore) {}

  async activate(
    descriptor: SkillDescriptor,
    conversationId: string,
    runId: string | undefined,
    groups: SkillGroup[],
    activatedBy: "user" | "system" | "builder" = "user",
  ): Promise<SkillActivationState> {
    const validGroups = descriptor.groups ?? [];
    const invalid = groups.filter((g) => !validGroups.includes(g));
    if (invalid.length > 0) {
      throw new Error(
        `Invalid groups for ${descriptor.skill_id}: ${invalid.join(", ")}`,
      );
    }

    const state: SkillActivationState = {
      skill_id: descriptor.skill_id,
      conversation_id: conversationId,
      run_id: runId,
      groups,
      activated_at: new Date().toISOString(),
      activated_by: activatedBy,
    };

    await this.store.set(state);
    return state;
  }

  async deactivate(
    descriptor: SkillDescriptor,
    conversationId: string,
  ): Promise<void> {
    await this.store.delete(descriptor.skill_id, conversationId);
  }

  async isActive(
    descriptor: SkillDescriptor,
    conversationId: string,
    runId?: string,
  ): Promise<boolean> {
    const record = await this.store.get(descriptor.skill_id, conversationId);
    if (!record) return false;
    if (record.run_id && record.run_id !== runId) return false;
    return true;
  }

  async requireActive(
    descriptor: SkillDescriptor,
    conversationId: string,
    runId?: string,
  ): Promise<SkillActivationState> {
    const record = await this.store.get(descriptor.skill_id, conversationId);
    if (!record) {
      throw new Error(
        `SKILL_NOT_ACTIVE: ${descriptor.skill_id} must be activated before use`,
      );
    }
    if (record.run_id && record.run_id !== runId) {
      throw new Error("SKILL_ACTIVATION_RUN_MISMATCH");
    }
    return record;
  }
}

/** Simple in-memory activation store for single-process and test use. */
export class InMemorySkillActivationStore implements SkillActivationStore {
  private records = new Map<string, SkillActivationState>();

  private key(skillId: string, conversationId: string): string {
    return `${skillId}:${conversationId}`;
  }

  async get(
    skillId: string,
    conversationId: string,
  ): Promise<SkillActivationState | null> {
    return this.records.get(this.key(skillId, conversationId)) || null;
  }

  async set(state: SkillActivationState): Promise<void> {
    this.records.set(this.key(state.skill_id, state.conversation_id), state);
  }

  async delete(skillId: string, conversationId: string): Promise<void> {
    this.records.delete(this.key(skillId, conversationId));
  }

  async list(conversationId: string): Promise<SkillActivationState[]> {
    return Array.from(this.records.values()).filter(
      (r) => r.conversation_id === conversationId,
    );
  }
}
