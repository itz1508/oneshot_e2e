import { WorkflowRootCauseError } from "../core/root-cause-error.js";
import { BuilderWorkflow } from "../agents/builder/workflow.js";
import { EvaluationWorkflow } from "../agents/evaluation/workflow.js";
import { GapAnalysisWorkflow } from "../agents/gap-analysis/workflow.js";
import { PlannerWorkflow } from "../agents/planner/workflow.js";
import { RefactorWorkflow } from "../agents/refactor/workflow.js";
import { ResearcherWorkflow } from "../agents/researcher/workflow.js";
import type { SandboxService } from "../sandbox/sandbox-service.js";
import type { CanonicalContractSkill } from "../skills/canonical-contract-skill.js";
import type { ProcessingEventBus } from "../runtime/event-bus.js";
import { AgentPipeline } from "./agent-pipeline.js";

export interface AgentPipelineBootstrapInput {
  projectRoot: string;
  events: ProcessingEventBus;
  contracts: CanonicalContractSkill;
  sandbox: SandboxService;
}

/**
 * Register canonical Agent factories without activating them.
 * Activation is explicit and happens only when the ADK workflow reaches a Agent.
 */
export function createAgentPipeline(
  input: AgentPipelineBootstrapInput,
): AgentPipeline {
  const { projectRoot, events, contracts, sandbox } = input;
  const pipeline = new AgentPipeline(events);

  pipeline.register("Researcher", async (runId) => {
    events.emit(runId, "ResearcherStarted", "Running", {
      scope: "SUPPORT",
      message: "Researcher activation",
    });

    // Researcher does not require a fixed provider binding.
    // It may inspect available Integration capabilities when needed,
    // but the general path does not mandate a selected provider.
    const researchProvider = undefined;

    events.emit(runId, "ResearcherCompleted", "Completed", {
      scope: "SUPPORT",
      test_result: "Passed",
      artifact_id: "researcher:no-binding",
      message: "Researcher runs without mandatory provider binding",
    });

    return {
      agent_id: "Researcher" as const,
      runtime: new ResearcherWorkflow(contracts, researchProvider),
      deactivate: () => undefined,
    };
  });

  pipeline.register("Planner", () => ({
    agent_id: "Planner" as const,
    runtime: new PlannerWorkflow(contracts),
  }));

  pipeline.register("Refactor", () => ({
    agent_id: "Refactor" as const,
    runtime: new RefactorWorkflow(contracts),
  }));

  pipeline.register("GapAnalysis", () => ({
    agent_id: "GapAnalysis" as const,
    runtime: new GapAnalysisWorkflow(contracts),
  }));

  pipeline.register("Evaluation", () => ({
    agent_id: "Evaluation" as const,
    runtime: new EvaluationWorkflow(contracts),
  }));

  pipeline.register("Builder", () => ({
    agent_id: "Builder" as const,
    runtime: new BuilderWorkflow(sandbox),
  }));

  return pipeline;
}
