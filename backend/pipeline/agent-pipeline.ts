import { WorkflowRootCauseError } from "../core/root-cause-error.js";
import type { BuilderWorkflow } from "../agents/builder/workflow.js";
import type { EvaluationWorkflow } from "../agents/evaluation/workflow.js";
import type { GapAnalysisWorkflow } from "../agents/gap-analysis/workflow.js";
import type { PlannerWorkflow } from "../agents/planner/workflow.js";
import type { RefactorWorkflow } from "../agents/refactor/workflow.js";
import type { ResearcherWorkflow } from "../agents/researcher/workflow.js";
import type { ProcessingEventBus } from "../runtime/event-bus.js";

export interface AgentRuntimeMap {
  Researcher: ResearcherWorkflow;
  Planner: PlannerWorkflow;
  Refactor: RefactorWorkflow;
  GapAnalysis: GapAnalysisWorkflow;
  Evaluation: EvaluationWorkflow;
  Builder: BuilderWorkflow;
}

export type AgentId = keyof AgentRuntimeMap;

export interface ActivatedAgent<K extends AgentId = AgentId> {
  agent_id: K;
  runtime: AgentRuntimeMap[K];
  deactivate?: () => void | Promise<void>;
}

type AgentFactory<K extends AgentId> = (
  runId: string,
) => ActivatedAgent<K> | Promise<ActivatedAgent<K>>;

type AnyAgentFactory = (
  runId: string,
) => ActivatedAgent | Promise<ActivatedAgent>;

/**
 * Explicit OneShot Agent activation/binding pipeline.
 *
 * Bootstrap registers factories only. A Agent is not runnable until the
 * canonical ADK stage explicitly activates it for the current run. This keeps
 * Agent identity, dependency binding, and execution as separate responsibilities.
 */
export class AgentPipeline {
  private factories = new Map<AgentId, AnyAgentFactory>();
  private active = new Map<string, Map<AgentId, ActivatedAgent>>();

  constructor(private events?: ProcessingEventBus) {}

  register<K extends AgentId>(agentId: K, factory: AgentFactory<K>): void {
    if (this.factories.has(agentId)) {
      throw new Error(`Agent factory already registered: ${agentId}`);
    }
    this.factories.set(agentId, factory as AnyAgentFactory);
  }

  isRegistered(agentId: AgentId): boolean {
    return this.factories.has(agentId);
  }

  isActive(runId: string, agentId: AgentId): boolean {
    return this.active.get(runId)?.has(agentId) ?? false;
  }

  async activate<K extends AgentId>(
    runId: string,
    agentId: K,
  ): Promise<AgentRuntimeMap[K]> {
    const existing = this.active.get(runId)?.get(agentId) as
      | ActivatedAgent<K>
      | undefined;
    if (existing) return existing.runtime;

    const factory = this.factories.get(agentId);
    if (!factory) {
      throw new WorkflowRootCauseError({
        issue: "Agent is not registered in the OneShot pipeline",
        expected: `${agentId} has a registered activation factory`,
        actual: `No activation factory registered for ${agentId}`,
        evidence_ids: [`agent:${agentId}`],
        required_correction: `Register ${agentId} before workflow execution`,
        recheck_target: runId,
      });
    }

    const processor = `RoleBinding:${agentId}`;
    this.events?.emit(runId, processor, "Running", {
      scope: "SUPPORT",
      message: `activate ${agentId}`,
    });

    try {
      const activated = (await factory(runId)) as ActivatedAgent<K>;
      if (!activated || activated.agent_id !== agentId || !activated.runtime) {
        throw new Error(
          `Activation factory returned an invalid ${agentId} binding`,
        );
      }

      const agents =
        this.active.get(runId) ?? new Map<AgentId, ActivatedAgent>();
      agents.set(agentId, activated as ActivatedAgent);
      this.active.set(runId, agents);

      this.events?.emit(runId, processor, "Completed", {
        scope: "SUPPORT",
        test_result: "Passed",
        artifact_id: `agent:${agentId}`,
        message: `${agentId} activated and bound`,
      });
      return activated.runtime;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.events?.emit(runId, processor, "Completed", {
        scope: "SUPPORT",
        test_result: "Failed",
        issue_type: "Root Cause",
        message,
      });

      if (error instanceof WorkflowRootCauseError) throw error;
      throw new WorkflowRootCauseError({
        issue: `${agentId} Agent activation failed`,
        expected: `${agentId} resolves, binds its required dependencies, and becomes runnable`,
        actual: message,
        evidence_ids: [`agent:${agentId}`],
        required_correction: `Correct the ${agentId} pipeline binding before execution`,
        recheck_target: runId,
      });
    }
  }

  require<K extends AgentId>(runId: string, agentId: K): AgentRuntimeMap[K] {
    const activated = this.active.get(runId)?.get(agentId) as
      | ActivatedAgent<K>
      | undefined;
    if (!activated) {
      throw new WorkflowRootCauseError({
        issue: "Attempted to execute an inactive Agent",
        expected: `${agentId} is explicitly activated before invocation`,
        actual: `${agentId} is not active for ${runId}`,
        evidence_ids: [`agent:${agentId}`],
        required_correction: `Activate ${agentId} through AgentPipeline before invoking it`,
        recheck_target: runId,
      });
    }
    return activated.runtime;
  }

  async release(runId: string): Promise<void> {
    const agents = this.active.get(runId);
    if (!agents) return;

    for (const activated of [...agents.values()].reverse()) {
      await activated.deactivate?.();
    }
    this.active.delete(runId);
  }
}
