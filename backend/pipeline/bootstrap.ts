import { WorkflowRootCauseError } from "../core/root-cause-error.js";
import { BuilderWorkflow } from "../role/builder/workflow.js";
import { EvaluationWorkflow } from "../role/evaluation/workflow.js";
import { GapAnalysisWorkflow } from "../role/gap-analysis/workflow.js";
import { PlannerWorkflow } from "../role/planner/workflow.js";
import { RefactorWorkflow } from "../role/refactor/workflow.js";
import { resolveResearchProvider } from "../role/researcher/provider-resolver.js";
import { ResearcherWorkflow } from "../role/researcher/workflow.js";
import type { SandboxService } from "../sandbox/sandbox-service.js";
import type { CanonicalContractSkill } from "../skill/canonical-contract-skill.js";
import type { ProcessingEventBus } from "../runtime/event-bus.js";
import { RolePipeline } from "./role-pipeline.js";

export interface RolePipelineBootstrapInput {
  projectRoot: string;
  events: ProcessingEventBus;
  contracts: CanonicalContractSkill;
  sandbox: SandboxService;
}

/**
 * Register canonical Role factories without activating them.
 * Activation is explicit and happens only when the ADK workflow reaches a Role.
 */
export function createRolePipeline(input: RolePipelineBootstrapInput): RolePipeline {
  const { projectRoot, events, contracts, sandbox } = input;
  const pipeline = new RolePipeline(events);

  pipeline.register("Researcher", async (runId) => {
    events.emit(runId, "ProviderBinding:Researcher", "RUNNING", {
      scope: "SUPPORT",
      message: "resolve and probe ResearchProvider",
    });

    let provider;
    try {
      provider = await resolveResearchProvider(projectRoot, events);
      const readiness = await provider.ready(runId);
      if (!readiness.ready) {
        throw new WorkflowRootCauseError({
          issue: "Researcher provider binding is not ready",
          expected:
            "The explicitly selected ResearchProvider and all required model bindings pass readiness before Researcher runs",
          actual: readiness.detail || "provider readiness returned false",
          evidence_ids: readiness.models.map((model) => `model:${model}`),
          required_correction:
            "Correct provider/model configuration and activate Researcher again",
          recheck_target: runId,
        });
      }

      events.emit(runId, "ProviderBinding:Researcher", "COMPLETE", {
        scope: "SUPPORT",
        result: "PASSED",
        artifact_id: `provider:${readiness.provider}`,
        message: `models=${readiness.models.join(",") || "fixture"}`,
      });

      return {
        role_id: "Researcher" as const,
        runtime: new ResearcherWorkflow(provider, contracts),
        deactivate: () => provider?.close?.(),
      };
    } catch (error) {
      provider?.close?.();
      events.emit(runId, "ProviderBinding:Researcher", "COMPLETE", {
        scope: "SUPPORT",
        result: "ROOT_CAUSE",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  pipeline.register("Planner", () => ({
    role_id: "Planner" as const,
    runtime: new PlannerWorkflow(contracts),
  }));

  pipeline.register("Refactor", () => ({
    role_id: "Refactor" as const,
    runtime: new RefactorWorkflow(contracts),
  }));

  pipeline.register("GapAnalysis", () => ({
    role_id: "GapAnalysis" as const,
    runtime: new GapAnalysisWorkflow(contracts),
  }));

  pipeline.register("Evaluation", () => ({
    role_id: "Evaluation" as const,
    runtime: new EvaluationWorkflow(contracts),
  }));

  pipeline.register("Builder", () => ({
    role_id: "Builder" as const,
    runtime: new BuilderWorkflow(sandbox),
  }));

  return pipeline;
}
