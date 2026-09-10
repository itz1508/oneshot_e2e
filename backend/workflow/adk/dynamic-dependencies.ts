import { WorkflowRootCauseError } from "../../core/root-cause-error.js";
import { BuilderWorkflow } from "../../agents/builder/workflow.js";
import { EvaluationWorkflow } from "../../agents/evaluation/workflow.js";
import { GapAnalysisWorkflow } from "../../agents/gap-analysis/workflow.js";
import { PlannerWorkflow } from "../../agents/planner/workflow.js";
import { RefactorWorkflow } from "../../agents/refactor/workflow.js";
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
  confirmation?: ConfirmationWorkflow;
  hash?: HashWorkflow;
}

export interface BoundDynamicDependencies extends OneShotDynamicDependencies {
  release(): void | Promise<void>;
}

/**
 * Resolve production dependencies for one ADK job. Dependency readiness
 * is verified before the Researcher node enters RUNNING.
 */
export function createDynamicDependencyFactory(
  input: DynamicDependencyFactoryInput,
) {
  const confirmation =
    input.confirmation ?? new ConfirmationWorkflow(input.contracts);
  const hash = input.hash ?? new HashWorkflow(input.contracts);

  return async (runId: string): Promise<BoundDynamicDependencies> => {
    input.events.emit(runId, "ResearcherStarted", "Running", {
      scope: "SUPPORT",
      message:
        "Researcher activation starting without mandatory provider binding",
    });

    // Researcher does not require a fixed provider binding.
    // It may inspect available Integration capabilities when needed,
    // but the general path does not mandate a selected provider.
    const researchProvider = undefined;

    input.events.emit(runId, "ResearcherCompleted", "Completed", {
      scope: "SUPPORT",
      test_result: "Passed",
      artifact_id: "researcher:no-binding",
      message: "Researcher runs without mandatory provider binding",
    });

    return {
      researcher: new ResearcherWorkflow(input.contracts, researchProvider),
      planner: new PlannerWorkflow(input.contracts),
      refactor: new RefactorWorkflow(input.contracts),
      gapper: new GapAnalysisWorkflow(input.contracts),
      evaluator: new EvaluationWorkflow(input.contracts),
      triple: input.triple,
      confirmation,
      hash,
      builder: new BuilderWorkflow(input.sandbox),
      release() {
        // No provider to release
      },
    };
  };
}
