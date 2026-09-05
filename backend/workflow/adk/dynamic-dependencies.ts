import { WorkflowRootCauseError } from "../../core/root-cause-error.js";
import { BuilderWorkflow } from "../../role/builder/workflow.js";
import { EvaluationWorkflow } from "../../role/evaluation/workflow.js";
import { GapAnalysisWorkflow } from "../../role/gap-analysis/workflow.js";
import { PlannerWorkflow } from "../../role/planner/workflow.js";
import { RefactorWorkflow } from "../../role/refactor/workflow.js";
import type { ResearchProvider } from "../../role/researcher/provider.js";
import { ResearcherWorkflow } from "../../role/researcher/workflow.js";
import type { SandboxService } from "../../sandbox/sandbox-service.js";
import type { CanonicalContractSkill } from "../../skills/canonical-contract-skill.js";
import type { ProcessingEventBus } from "../../runtime/event-bus.js";
import { ConfirmationWorkflow } from "../confirmation.js";
import { HashWorkflow } from "../hash.js";
import type { TripleValidationWorkflow } from "../triple-validation.js";
import type { OneShotDynamicDependencies } from "./dynamic-root-agent.js";

export interface DynamicDependencyFactoryInput {
  projectRoot: string;
  events: ProcessingEventBus;
  contracts: CanonicalContractSkill;
  sandbox: SandboxService;
  triple: TripleValidationWorkflow;
  provider: ResearchProvider;
  confirmation?: ConfirmationWorkflow;
  hash?: HashWorkflow;
}

export interface BoundDynamicDependencies extends OneShotDynamicDependencies {
  release(): void | Promise<void>;
}

/**
 * Resolve production dependencies for one ADK job. ResearchProvider readiness
 * is proved before the Researcher node is allowed to enter RUNNING.
 */
export function createDynamicDependencyFactory(input: DynamicDependencyFactoryInput) {
  const confirmation = input.confirmation ?? new ConfirmationWorkflow(input.contracts);
  const hash = input.hash ?? new HashWorkflow(input.contracts);

  return async (runId: string): Promise<BoundDynamicDependencies> => {
    input.events.emit(runId, "ProviderBinding:Researcher", "RUNNING", {
      scope: "SUPPORT",
      message: "resolve provider and prove model readiness before ADK Researcher node",
    });

    let provider: ResearchProvider | undefined;
    try {
      provider = input.provider;
      const readiness = await provider.ready(runId);
      if (!readiness.ready) {
        throw new WorkflowRootCauseError({
          issue: "Researcher provider binding is not ready",
          expected: "Configured ResearchProvider and required model bindings are ready before ctx.runNode(Researcher)",
          actual: readiness.detail || "provider readiness returned false",
          evidence_ids: readiness.models.map((model) => `model:${model}`),
          required_correction: "Correct provider/model configuration and retry the same job",
          recheck_target: runId,
        });
      }

      input.events.emit(runId, "ProviderBinding:Researcher", "COMPLETE", {
        scope: "SUPPORT",
        result: "PASSED",
        artifact_id: `provider:${readiness.provider}`,
        message: `models=${readiness.models.join(",") || "fixture"}`,
      });

      const boundProvider = provider;
      return {
        researcher: new ResearcherWorkflow(boundProvider, input.contracts),
        planner: new PlannerWorkflow(input.contracts),
        refactor: new RefactorWorkflow(input.contracts),
        gapper: new GapAnalysisWorkflow(input.contracts),
        evaluator: new EvaluationWorkflow(input.contracts),
        triple: input.triple,
        confirmation,
        hash,
        builder: new BuilderWorkflow(input.sandbox),
        release() {
          boundProvider.close?.();
        },
      };
    } catch (error) {
      provider?.close?.();
      input.events.emit(runId, "ProviderBinding:Researcher", "COMPLETE", {
        scope: "SUPPORT",
        result: "ROOT_CAUSE",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}
