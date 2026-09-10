import { WorkflowRootCauseError } from "../../core/root-cause-error.js";
import { BuilderWorkflow } from "../../agents/builder/workflow.js";
import { EvaluationWorkflow } from "../../agents/evaluation/workflow.js";
import { GapAnalysisWorkflow } from "../../agents/gap-analysis/workflow.js";
import { PlannerWorkflow } from "../../agents/planner/workflow.js";
import { RefactorWorkflow } from "../../agents/refactor/workflow.js";
import type { ModelProvider } from "../../provider/model-provider.js";
import { ResearcherWorkflow } from "../../agents/researcher/workflow.js";
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
  /** Model transport only. Undefined is permitted only for deterministic sample mode. */
  provider: ModelProvider | undefined;
  confirmation?: ConfirmationWorkflow;
  hash?: HashWorkflow;
}

export interface BoundDynamicDependencies extends OneShotDynamicDependencies {
  release(): void | Promise<void>;
}

/** Bind a model transport before the backend Researcher role runs. */
export function createDynamicDependencyFactory(
  input: DynamicDependencyFactoryInput,
) {
  const confirmation =
    input.confirmation ?? new ConfirmationWorkflow(input.contracts);
  const hash = input.hash ?? new HashWorkflow(input.contracts);

  return async (runId: string): Promise<BoundDynamicDependencies> => {
    input.events.emit(runId, "ProviderBinding:Researcher", "Running", {
      scope: "SUPPORT",
      message: "resolve model transport before Researcher",
    });

    const provider = input.provider;
    try {
      if (provider) {
        const readiness = await provider.ready(runId);
        if (!readiness.ready) {
          throw new WorkflowRootCauseError({
            issue: "Researcher model provider binding is not ready",
            expected:
              "Configured model provider is ready before ctx.runNode(Researcher)",
            actual: readiness.detail || "provider readiness returned false",
            evidence_ids: readiness.models.map((model) => `model:${model}`),
            required_correction:
              "Correct provider/model configuration and retry the same job",
            recheck_target: runId,
          });
        }
        input.events.emit(runId, "ProviderBinding:Researcher", "Completed", {
          scope: "SUPPORT",
          test_result: "Passed",
          artifact_id: `provider:${readiness.provider}`,
          message: `models=${readiness.models.join(",")}`,
        });
      } else {
        input.events.emit(runId, "ProviderBinding:Researcher", "Completed", {
          scope: "SUPPORT",
          test_result: "Passed",
          artifact_id: "researcher:sample-mode",
          message: "deterministic Researcher sample mode; no model provider",
        });
      }

      return {
        researcher: new ResearcherWorkflow(
          provider,
          input.contracts,
          input.projectRoot,
        ),
        planner: new PlannerWorkflow(input.contracts),
        refactor: new RefactorWorkflow(input.contracts),
        gapper: new GapAnalysisWorkflow(input.contracts),
        evaluator: new EvaluationWorkflow(input.contracts),
        triple: input.triple,
        confirmation,
        hash,
        builder: new BuilderWorkflow(input.sandbox),
        release() {
          provider?.close?.();
        },
      };
    } catch (error) {
      provider?.close?.();
      input.events.emit(runId, "ProviderBinding:Researcher", "Completed", {
        scope: "SUPPORT",
        test_result: "Failed",
        issue_type: "Root Cause",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}
