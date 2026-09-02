import { InMemorySessionService, Runner } from "@google/adk";
import type {
  HashProof,
  Prompt,
  RootCause,
  RunSnapshot,
} from "../contract/types.js";
import { WorkflowInformationRequiredError } from "../core/information-required-error.js";
import { WorkflowRootCauseError } from "../core/root-cause-error.js";
import type { HelpRequest } from "../intent/types.js";
import type { BuilderWorkflow } from "../role/builder/workflow.js";
import type { EvaluationWorkflow } from "../role/evaluation/workflow.js";
import type { GapAnalysisWorkflow } from "../role/gap-analysis/workflow.js";
import type { PlannerWorkflow } from "../role/planner/workflow.js";
import type { RefactorWorkflow } from "../role/refactor/workflow.js";
import type { ResearcherWorkflow } from "../role/researcher/workflow.js";
import type { ConfirmationWorkflow } from "../workflow/confirmation.js";
import { createOneShotRootAgent } from "../workflow/adk/root-agent.js";
import { ADK_STATE } from "../workflow/adk/state.js";
import type { HashWorkflow } from "../workflow/hash.js";
import type { TripleValidationWorkflow } from "../workflow/triple-validation.js";
import type { ArtifactStore } from "./artifact-store.js";
import type { ProcessingEventBus } from "./event-bus.js";
import type { RunRepository } from "./run-repository.js";

const APP_NAME = "oneshot-canonical-workflow";

/**
 * External runtime facade for the canonical OneShot workflow.
 *
 * Google ADK owns stage composition and ordering. OneShot's existing EventBus,
 * ArtifactStore, and RunRepository remain the durable product evidence path;
 * ADK session state is invocation-scoped orchestration state only.
 */
export class WorkflowRuntime {
  private readonly sessionService: InMemorySessionService;
  private readonly runner: Runner;

  constructor(
    private events: ProcessingEventBus,
    private runs: RunRepository,
    readonly store: ArtifactStore,
    researcher: ResearcherWorkflow,
    planner: PlannerWorkflow,
    refactor: RefactorWorkflow,
    gapper: GapAnalysisWorkflow,
    evaluator: EvaluationWorkflow,
    triple: TripleValidationWorkflow,
    confirmation: ConfirmationWorkflow,
    hash: HashWorkflow,
    builder: BuilderWorkflow,
  ) {
    const rootAgent = createOneShotRootAgent({
      researcher,
      planner,
      refactor,
      gapper,
      evaluator,
      triple,
      confirmation,
      hash,
      builder,
      effects: {
        event: (runId, processor, state, data = {}) =>
          this.ev(runId, processor, state, data),
        save: (runId, name, value) => this.save(runId, name, value),
        finishPassed: (runId, proof) => {
          this.finishPassed(runId, proof);
        },
        finishRoot: (runId, rootCause, proof) => {
          this.finishRoot(runId, rootCause, proof);
        },
      },
    });

    this.sessionService = new InMemorySessionService();
    this.runner = new Runner({
      appName: APP_NAME,
      agent: rootAgent,
      sessionService: this.sessionService,
    });
  }

  private ev(
    runId: string,
    processor: string,
    state: "PENDING" | "RUNNING" | "COMPLETE",
    data: Parameters<ProcessingEventBus["emit"]>[3] = {},
  ): void {
    this.events.emit(runId, processor, state, data);
  }

  private async save(
    runId: string,
    name: string,
    value: unknown,
  ): Promise<string> {
    const path = await this.store.save(runId, name, value);
    this.runs.artifact(runId, name, path);
    return path;
  }

  private finishRoot(
    runId: string,
    rootCause: RootCause,
    proof?: HashProof,
    helpRequest?: HelpRequest,
  ): RunSnapshot {
    const current = this.runs.require(runId);
    if (current.result) return current;

    if (helpRequest) {
      this.ev(runId, "HelpRequest", "RUNNING", { scope: "SUPPORT" });
      this.ev(runId, "HelpRequest", "COMPLETE", {
        scope: "SUPPORT",
        result: "ROOT_CAUSE",
        artifact_id: helpRequest.request_id,
        message: helpRequest.question,
      });
    }

    this.ev(runId, "Done", "RUNNING");
    this.ev(runId, "Done", "COMPLETE", {
      result: "ROOT_CAUSE",
      message: rootCause.actual,
    });
    return this.runs.finish(
      runId,
      "ROOT_CAUSE",
      proof,
      rootCause,
      helpRequest,
    );
  }

  private finishPassed(runId: string, proof: HashProof): RunSnapshot {
    const current = this.runs.require(runId);
    if (current.result) return current;

    this.ev(runId, "Done", "RUNNING");
    this.ev(runId, "Done", "COMPLETE", {
      result: "PASSED",
      artifact_id: proof.created_hash,
    });
    return this.runs.finish(runId, "PASSED", proof);
  }

  /** Execute one complete canonical workflow invocation through Google ADK. */
  async run(runId: string, prompt: Prompt): Promise<RunSnapshot> {
    const order = [
      "Researcher",
      "Planner",
      "Refactor",
      "GapAnalysis",
      "Evaluation",
      "SchemaValidation",
      "FixtureValidation",
      "GoalValidation",
      "TripleValidation",
      "Confirmed",
      "CreateHash",
      "Builder",
      "Hash",
      "Done",
    ];
    for (const processor of order) this.ev(runId, processor, "PENDING");

    try {
      const session = await this.sessionService.createSession({
        appName: APP_NAME,
        userId: runId,
        sessionId: runId,
        state: {
          [ADK_STATE.runId]: runId,
          [ADK_STATE.prompt]: prompt,
        },
      });

      for await (const _event of this.runner.runAsync({
        userId: runId,
        sessionId: session.id,
        newMessage: {
          role: "user",
          parts: [{ text: `Execute OneShot job ${runId}` }],
        },
      })) {
        // ADK owns orchestration. Deterministic stage adapters emit canonical
        // OneShot events and artifacts through the existing durable services.
      }

      const snapshot = this.runs.require(runId);
      if (!snapshot.result) {
        throw new Error("ADK workflow completed without a terminal OneShot result");
      }
      return snapshot;
    } catch (error) {
      const current = this.runs.require(runId);
      if (current.result) return current;

      const rootCause: RootCause =
        error instanceof WorkflowRootCauseError
          ? error.rootCause
          : {
              issue: "Workflow execution failed",
              expected: "Canonical ADK workflow reaches DONE",
              actual: error instanceof Error ? error.message : String(error),
              evidence_ids: [],
              required_correction:
                "Correct the reported execution or contract failure",
              recheck_target: runId,
            };

      return this.finishRoot(
        runId,
        rootCause,
        undefined,
        error instanceof WorkflowInformationRequiredError
          ? error.helpRequest
          : undefined,
      );
    }
  }
}
