import { CanonicalContractSkill } from "./canonical-contract-skill.js";
import { TaskRuntimeSkill } from "./task-runtime-skill.js";
import { IntentCollectionSkill } from "./intent-collection-skill.js";
import { SandboxRuntimeSkill } from "./sandbox-skill.js";
import { InitSkill } from "./init-skill.js";
import { SkillCatalog } from "./catalog.js";
import { SkillRegistry } from "./registry.js";
import { SkillResolver } from "./resolver.js";
import { SkillActivationEngine } from "./activation.js";
import type { ActivatedSkill, ActivationContext, SkillDescriptor } from "./types.js";

/**
 * Bootstrap and configure the standard OneShot Reusable Skill subsystem.
 */
export function createSkillSystem(catalog = new SkillCatalog()): {
  catalog: SkillCatalog;
  registry: SkillRegistry;
  resolver: SkillResolver;
  activation: SkillActivationEngine;
} {
  const registry = new SkillRegistry();
  const resolver = new SkillResolver(catalog);
  const activation = new SkillActivationEngine(resolver, registry, catalog);

  // 1. oneshot-canonical-contracts factory
  registry.registerFactory(
    "oneshot-canonical-contracts",
    async (desc: SkillDescriptor, ctx: ActivationContext): Promise<ActivatedSkill> => {
      if (!ctx.bridge) {
        throw new Error("Canonical contracts skill requires PythonBridge in ActivationContext");
      }
      const skill = new CanonicalContractSkill(ctx.bridge, catalog);
      return {
        skill_id: desc.skill_id,
        descriptor: desc,
        activated_at: new Date().toISOString(),
        caller_id: ctx.caller_id,
        async invoke<T>(tool: string, input: unknown): Promise<T> {
          return await skill.invoke<T>(tool, input);
        },
        definitions() {
          return skill.definitions();
        },
        async deactivate() {},
      };
    },
  );

  // 2. oneshot-task-runtime factory
  registry.registerFactory(
    "oneshot-task-runtime",
    async (desc: SkillDescriptor, ctx: ActivationContext): Promise<ActivatedSkill> => {
      const task = ctx.services?.task as any;
      const runs = ctx.services?.runs as any;
      const skill = new TaskRuntimeSkill(task, runs, catalog);
      return {
        skill_id: desc.skill_id,
        descriptor: desc,
        activated_at: new Date().toISOString(),
        caller_id: ctx.caller_id,
        async invoke<T>(tool: string, input: unknown): Promise<T> {
          return await skill.invoke<T>(tool, input);
        },
        definitions() {
          return skill.definitions();
        },
        async deactivate() {},
      };
    },
  );

  // 3. oneshot-intent-collection factory
  registry.registerFactory(
    "oneshot-intent-collection",
    async (desc: SkillDescriptor, ctx: ActivationContext): Promise<ActivatedSkill> => {
      const intent = ctx.services?.intent as any;
      const skill = new IntentCollectionSkill(intent);
      return {
        skill_id: desc.skill_id,
        descriptor: desc,
        activated_at: new Date().toISOString(),
        caller_id: ctx.caller_id,
        async invoke<T>(tool: string, input: unknown): Promise<T> {
          return await skill.invoke<T>(tool, input);
        },
        definitions() {
          return skill.definitions();
        },
        async deactivate() {},
      };
    },
  );

  // 4. oneshot-sandbox-runtime factory
  registry.registerFactory(
    "oneshot-sandbox-runtime",
    async (desc: SkillDescriptor, ctx: ActivationContext): Promise<ActivatedSkill> => {
      const sandbox = ctx.services?.sandbox as any;
      const contracts = ctx.services?.contracts as any;
      const skill = new SandboxRuntimeSkill(sandbox, contracts);
      return {
        skill_id: desc.skill_id,
        descriptor: desc,
        activated_at: new Date().toISOString(),
        caller_id: ctx.caller_id,
        async invoke<T>(tool: string, input: unknown): Promise<T> {
          return await skill.invoke<T>(tool, input);
        },
        definitions() {
          return skill.definitions();
        },
        async deactivate() {},
      };
    },
  );

  // 5. oneshot-init factory
  registry.registerFactory(
    "oneshot-init",
    async (desc: SkillDescriptor, ctx: ActivationContext): Promise<ActivatedSkill> => {
      const skill = new InitSkill();
      return {
        skill_id: desc.skill_id,
        descriptor: desc,
        activated_at: new Date().toISOString(),
        caller_id: ctx.caller_id,
        async invoke<T>(tool: string, input: unknown): Promise<T> {
          return await skill.invoke<T>(tool, input);
        },
        definitions() {
          return skill.definitions();
        },
        async deactivate() {},
      };
    },
  );

  return {
    catalog,
    registry,
    resolver,
    activation,
  };
}
