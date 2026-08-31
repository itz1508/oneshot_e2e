import type { PythonBridge } from "../validation/python-bridge.js";
import type { ProcessingEventBus } from "../runtime/event-bus.js";

/** Runtime execution environment for a Skill. */
export type SkillRuntimeType = "typescript" | "python" | "process" | "custom";

/** Declarative metadata describing a reusable Skill capability. */
export interface SkillDescriptor {
  skill_id: string;
  name: string;
  version?: string;
  path: string;
  capabilities: string[];
  responsibilities: string[];
  tools: readonly string[];
  runtime_type?: SkillRuntimeType;
  allowed_operations?: string[];
  forbidden_operations?: string[];
}

/** Query parameters for resolving a Skill capability. */
export interface SkillResolutionQuery {
  skill_id?: string;
  capability?: string;
  tool?: string;
}

/** Result of an exact Skill resolution attempt. */
export interface SkillResolutionResult {
  resolved: boolean;
  skill_id?: string;
  descriptor?: SkillDescriptor;
  reason?: string;
}

/** Context passed when activating a Skill for a caller. */
export interface ActivationContext {
  caller_id: string;
  bridge?: PythonBridge;
  events?: ProcessingEventBus;
  services?: Record<string, unknown>;
  environment?: Record<string, string>;
}

/** Active Skill handle with callable tool interface. */
export interface ActivatedSkill {
  skill_id: string;
  descriptor: SkillDescriptor;
  activated_at: string;
  caller_id: string;
  invoke<T = unknown>(tool: string, input: unknown): Promise<T>;
  definitions(): Array<{ name: string; description: string }>;
  deactivate(): Promise<void>;
}

/** Record of an active or historical Skill activation. */
export interface ActivationRecord {
  activation_id: string;
  skill_id: string;
  caller_id: string;
  activated_at: string;
  deactivated_at?: string;
  state: "ACTIVE" | "DEACTIVATED";
}

/** Factory function signature for instantiating a Skill runtime. */
export type SkillRuntimeFactory = (
  descriptor: SkillDescriptor,
  ctx: ActivationContext,
) => Promise<ActivatedSkill> | ActivatedSkill;
