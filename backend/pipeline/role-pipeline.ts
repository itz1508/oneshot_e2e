import { WorkflowRootCauseError } from "../core/root-cause-error.js";
import type { BuilderWorkflow } from "../role/builder/workflow.js";
import type { EvaluationWorkflow } from "../role/evaluation/workflow.js";
import type { GapAnalysisWorkflow } from "../role/gap-analysis/workflow.js";
import type { PlannerWorkflow } from "../role/planner/workflow.js";
import type { RefactorWorkflow } from "../role/refactor/workflow.js";
import type { ResearcherWorkflow } from "../role/researcher/workflow.js";
import type { ProcessingEventBus } from "../runtime/event-bus.js";

export interface RoleRuntimeMap {
  Researcher: ResearcherWorkflow;
  Planner: PlannerWorkflow;
  Refactor: RefactorWorkflow;
  GapAnalysis: GapAnalysisWorkflow;
  Evaluation: EvaluationWorkflow;
  Builder: BuilderWorkflow;
}

export type RoleId = keyof RoleRuntimeMap;

export interface ActivatedRole<K extends RoleId = RoleId> {
  role_id: K;
  runtime: RoleRuntimeMap[K];
  deactivate?: () => void | Promise<void>;
}

type RoleFactory<K extends RoleId> = (
  runId: string,
) => ActivatedRole<K> | Promise<ActivatedRole<K>>;

type AnyRoleFactory = (
  runId: string,
) => ActivatedRole | Promise<ActivatedRole>;

/**
 * Explicit OneShot Role activation/binding pipeline.
 *
 * Bootstrap registers factories only. A Role is not runnable until the
 * canonical ADK stage explicitly activates it for the current run. This keeps
 * Role identity, dependency binding, and execution as separate responsibilities.
 */
export class RolePipeline {
  private factories = new Map<RoleId, AnyRoleFactory>();
  private active = new Map<string, Map<RoleId, ActivatedRole>>();

  constructor(private events?: ProcessingEventBus) {}

  register<K extends RoleId>(roleId: K, factory: RoleFactory<K>): void {
    if (this.factories.has(roleId)) {
      throw new Error(`Role factory already registered: ${roleId}`);
    }
    this.factories.set(roleId, factory as AnyRoleFactory);
  }

  isRegistered(roleId: RoleId): boolean {
    return this.factories.has(roleId);
  }

  isActive(runId: string, roleId: RoleId): boolean {
    return this.active.get(runId)?.has(roleId) ?? false;
  }

  async activate<K extends RoleId>(
    runId: string,
    roleId: K,
  ): Promise<RoleRuntimeMap[K]> {
    const existing = this.active.get(runId)?.get(roleId) as
      | ActivatedRole<K>
      | undefined;
    if (existing) return existing.runtime;

    const factory = this.factories.get(roleId);
    if (!factory) {
      throw new WorkflowRootCauseError({
        issue: "Role is not registered in the OneShot pipeline",
        expected: `${roleId} has a registered activation factory`,
        actual: `No activation factory registered for ${roleId}`,
        evidence_ids: [`role:${roleId}`],
        required_correction: `Register ${roleId} before workflow execution`,
        recheck_target: runId,
      });
    }

    const processor = `RoleBinding:${roleId}`;
    this.events?.emit(runId, processor, "RUNNING", {
      scope: "SUPPORT",
      message: `activate ${roleId}`,
    });

    try {
      const activated = (await factory(runId)) as ActivatedRole<K>;
      if (
        !activated ||
        activated.role_id !== roleId ||
        !activated.runtime
      ) {
        throw new Error(`Activation factory returned an invalid ${roleId} binding`);
      }

      const roles = this.active.get(runId) ?? new Map<RoleId, ActivatedRole>();
      roles.set(roleId, activated as ActivatedRole);
      this.active.set(runId, roles);

      this.events?.emit(runId, processor, "COMPLETE", {
        scope: "SUPPORT",
        result: "PASSED",
        artifact_id: `role:${roleId}`,
        message: `${roleId} activated and bound`,
      });
      return activated.runtime;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.events?.emit(runId, processor, "COMPLETE", {
        scope: "SUPPORT",
        result: "ROOT_CAUSE",
        message,
      });

      if (error instanceof WorkflowRootCauseError) throw error;
      throw new WorkflowRootCauseError({
        issue: `${roleId} Role activation failed`,
        expected: `${roleId} resolves, binds its required dependencies, and becomes runnable`,
        actual: message,
        evidence_ids: [`role:${roleId}`],
        required_correction: `Correct the ${roleId} pipeline binding before execution`,
        recheck_target: runId,
      });
    }
  }

  require<K extends RoleId>(runId: string, roleId: K): RoleRuntimeMap[K] {
    const activated = this.active.get(runId)?.get(roleId) as
      | ActivatedRole<K>
      | undefined;
    if (!activated) {
      throw new WorkflowRootCauseError({
        issue: "Attempted to execute an inactive Role",
        expected: `${roleId} is explicitly activated before invocation`,
        actual: `${roleId} is not active for ${runId}`,
        evidence_ids: [`role:${roleId}`],
        required_correction: `Activate ${roleId} through RolePipeline before invoking it`,
        recheck_target: runId,
      });
    }
    return activated.runtime;
  }

  async release(runId: string): Promise<void> {
    const roles = this.active.get(runId);
    if (!roles) return;

    for (const activated of [...roles.values()].reverse()) {
      await activated.deactivate?.();
    }
    this.active.delete(runId);
  }
}
