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
  /** Capability groups this skill exposes for opt-in activation (P7.8). */
  groups?: SkillGroup[];
  /** Whether this skill is active by default. Must be false for opt-in skills. */
  default_active?: boolean;
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
  /** Underlying concrete skill runtime instance, when the factory wraps a class. */
  underlying?: unknown;
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

// ---------------------------------------------------------------------------
// Opt-in skill activation (P7.8 — Strands for Cosmos / dynamic skills)
// ---------------------------------------------------------------------------

/** Capability groups a skill can expose. */
export type SkillGroup =
  | "vision"
  | "generate"
  | "action"
  | "curate"
  | "deploy"
  | "evaluate"
  | "system";

/**
 * Conversation-scoped activation state. Unlike the runtime ActivationRecord,
 * this is purely about user consent to load a skill for a conversation/run.
 */
export interface SkillActivationState {
  skill_id: string;
  conversation_id: string;
  run_id?: string;
  groups: SkillGroup[];
  activated_at: string;
  activated_by: "user" | "system" | "builder";
}

/** In-memory store interface for conversation-scoped skill activation. */
export interface SkillActivationStore {
  get(
    skillId: string,
    conversationId: string,
  ): Promise<SkillActivationState | null>;
  set(state: SkillActivationState): Promise<void>;
  delete(skillId: string, conversationId: string): Promise<void>;
  list(conversationId: string): Promise<SkillActivationState[]>;
}

/** Binding returned by a skill implementation; only loaded when activated. */
export interface SkillRuntimeBinding {
  descriptor: SkillDescriptor;
  /** Whether the skill is available in the current deployment. */
  available: boolean;
  /** Tools to inject when the skill is active. */
  getTools(): Promise<
    Array<{
      name: string;
      group?: SkillGroup;
      handler(input: unknown): Promise<unknown>;
    }>
  >;
  /** Optional model surfaces exposed when the skill is active. */
  getModels?(): Promise<unknown[]>;
}

/** Minimal surface the loader needs from an activation gate. */
export interface SkillActivationGate {
  activate(
    descriptor: SkillDescriptor,
    conversationId: string,
    runId: string | undefined,
    groups: SkillGroup[],
    activatedBy: "user" | "system" | "builder",
  ): Promise<SkillActivationState>;
  deactivate(descriptor: SkillDescriptor, conversationId: string): Promise<void>;
  isActive(
    descriptor: SkillDescriptor,
    conversationId: string,
    runId?: string,
  ): Promise<boolean>;
  requireActive(
    descriptor: SkillDescriptor,
    conversationId: string,
    runId?: string,
  ): Promise<SkillActivationState>;
}

