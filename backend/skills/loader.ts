/**
 * Load only active skills into an agent invocation.
 */
import type {
  SkillActivationGate,
  SkillActivationState,
  SkillRuntimeBinding,
} from "./types.js";

export interface SkillLoaderDeps {
  registry: Map<string, SkillRuntimeBinding>;
  gate: SkillActivationGate;
}

export class SkillLoader {
  constructor(private deps: SkillLoaderDeps) {}

  async load(
    conversationId: string,
    runId?: string,
  ): Promise<{
    tools: Array<{ name: string; handler(input: unknown): Promise<unknown> }>;
    models: unknown[];
    active: SkillActivationState[];
  }> {
    const tools: Array<{
      name: string;
      handler(input: unknown): Promise<unknown>;
    }> = [];
    const models: unknown[] = [];
    const active: SkillActivationState[] = [];

    for (const binding of this.deps.registry.values()) {
      if (!binding.available) continue;
      const isActive = await this.deps.gate.isActive(
        binding.descriptor,
        conversationId,
        runId,
      );
      if (!isActive) continue;
      const record = await this.deps.gate.requireActive(
        binding.descriptor,
        conversationId,
        runId,
      );
      active.push(record);
      const activeGroups = new Set(record.groups);
      const bindingTools = await binding.getTools();
      tools.push(
        ...bindingTools.filter(
          (t) => !t.group || activeGroups.has(t.group),
        ),
      );
      if (binding.getModels) {
        models.push(...(await binding.getModels()));
      }
    }

    return { tools, models, active };
  }
}
