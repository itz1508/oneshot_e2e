import type {
  HashProof,
  Prompt,
  RootCause,
  RunSnapshot,
  TripleValidation,
} from "../contracts/schema/types.js";
import { WorkflowInformationRequiredError } from "../core/information-required-error.js";
import { WorkflowRootCauseError } from "../core/root-cause-error.js";
import type { HelpRequest } from "../intent/types.js";
import type { ArtifactStore } from "./artifact-store.js";
import type { ProcessingEventBus } from "./event-bus.js";
import type { RunRepository } from "./run-repository.js";
import { PlanReviewService } from "./plan-review.js";
import { BuildReviewService } from "./build-review.js";
import { validationFeedback } from "../agents/gap-analysis/tool/validation-feedback.js";
import type { ResearcherWorkflow } from "../agents/researcher/workflow.js";
import type { PlannerWorkflow } from "../agents/planner/workflow.js";
import type { RefactorWorkflow } from "../agents/refactor/workflow.js";
import type { GapAnalysisWorkflow } from "../agents/gap-analysis/workflow.js";
import type { EvaluationWorkflow } from "../agents/evaluation/workflow.js";
import type { BuilderWorkflow } from "../agents/builder/workflow.js";
import type { ConfirmationWorkflow } from "../workflow/confirmation.js";
import type { HashWorkflow } from "../workflow/hash.js";
import type { TripleValidationWorkflow } from "../workflow/triple-validation.js";

export interface WorkflowRuntimeDependencies {
  researcher: ResearcherWorkflow;
  planner: PlannerWorkflow;
  refactor: RefactorWorkflow;
  gapper: GapAnalysisWorkflow;
  evaluator: EvaluationWorkflow;
  triple: TripleValidationWorkflow;
  confirmation: ConfirmationWorkflow;
  hash: HashWorkflow;
  builder: BuilderWorkflow;
  release?(): void | Promise<void>;
}

export type DynamicDependencyFactory = (
  runId: string,
) => Promise<WorkflowRuntimeDependencies> | WorkflowRuntimeDependencies;

function validationSignature(triple: TripleValidation): string {
  const fixture = triple.fixture_validation.assertion_results
    .filter((result) => !result.satisfied)
    .map((result) => result.assertion_id)
    .sort()
    .join(",");
  const goal = triple.goal_validation.criterion_results
    .filter((result) => !result.satisfied)
    .map((result) => result.criterion_id)
    .sort()
    .join(",");
  return [
    triple.schema_validation.result,
    triple.fixture_validation.result,
    triple.goal_validation.result,
    fixture,
    goal,
  ].join("|");
}

function toNativeRootCause(error: unknown, jobId: string): RootCause {
  if (error instanceof WorkflowRootCauseError) return error.rootCause;
  return {
    issue: "Workflow execution failed",
    expected: "OneShot workflow reaches a canonical terminal result",
    actual: error instanceof Error ? error.message : String(error),
    evidence_ids: [],
    required_correction:
      "Correct the reported workflow stage, agent, contract, or runtime error",
    recheck_target: jobId,
  };
}

/**
 * External runtime facade for the canonical OneShot native workflow.
 * Executes canonical stages natively preserving stage ordering, refinement,
 * human confirmation, hash creation, and builder verification.
 */
export class WorkflowRuntime {
  readonly review: PlanReviewService;
  readonly buildReview: BuildReviewService;

  constructor(
    private events: ProcessingEventBus,
    private runs: RunRepository,
    readonly store: ArtifactStore,
    private bindDependencies: DynamicDependencyFactory,
  ) {
    this.review = new PlanReviewService(store);
    this.buildReview = new BuildReviewService(store);
  }

  private ev(
    runId: string,
    processor: string,
    state: "Pending" | "Running" | "Completed" | "Failed",
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
    if (current.pipeline_status === "Done") return current;

    if (helpRequest) {
      this.ev(runId, "HelpRequest", "Running", { scope: "SUPPORT" });
      this.ev(runId, "HelpRequest", "Completed", {
        scope: "SUPPORT",
        test_result: "Failed",
        issue_type: "Root Cause",
        issue: rootCause,
        artifact_id: helpRequest.request_id,
        message: helpRequest.question,
      });
    }

    this.ev(runId, "Done", "Running");
    this.ev(runId, "Done", "Completed", {
      test_result: "Failed",
      issue_type: "Root Cause",
      issue: rootCause,
      message: rootCause.actual,
    });
    return this.runs.finish(runId, "Failed", proof, rootCause, helpRequest);
  }

  private finishPassed(runId: string, proof: HashProof): RunSnapshot {
    const current = this.runs.require(runId);
    if (current.pipeline_status === "Done") return current;

    this.ev(runId, "Done", "Running");
    this.ev(runId, "Done", "Completed", {
      test_result: "Passed",
      artifact_id: proof.created_hash,
    });
    return this.runs.finish(runId, "Passed", proof);
  }

  /** Execute one complete canonical job through native OneShot pipeline. */
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
    for (const processor of order) this.ev(runId, processor, "Pending");

    let bound: WorkflowRuntimeDependencies | undefined;
    try {
      bound = await this.bindDependencies(runId);
      const jobId = runId;

      // 1. Researcher
      this.ev(jobId, "Researcher", "Running");
      let research = await bound.researcher.run(prompt, jobId);
      await this.save(jobId, "prompt", research.prompt);
      await this.save(jobId, "researcher", research.researcher);
      await this.save(jobId, "plan.researcher", research.plan);
      await this.save(jobId, "schema", research.schema_artifact);
      await this.save(jobId, "fixture", research.fixture);
      await this.save(jobId, "goal", research.goal);
      await this.save(jobId, "validation", research.validation);
      this.ev(jobId, "Researcher", "Completed", {
        test_result: "Passed",
        artifact_id: research.researcher.researcher_id,
      });

      // Plan Review Gate
      if (await this.review.open(jobId, research)) {
        this.ev(jobId, "PlanReview", "Running", {
          scope: "SUPPORT",
          message: "Draft ready. Review and confirm before Planner continues.",
        });
        const reviewed = await this.review.wait(
          jobId,
          () => this.runs.get(jobId)?.pipeline_status === "Done",
        );
        await this.save(jobId, "plan.reviewed", reviewed.plan);
        await this.save(jobId, "research.reviewed", reviewed);
        this.ev(jobId, "PlanReview", "Completed", {
          scope: "SUPPORT",
          message: "Draft confirmed by the user.",
        });
        research = reviewed;
      }

      // 2. Planner
      this.ev(jobId, "Planner", "Running");
      const audit = await bound.planner.run(research, jobId);
      await this.save(jobId, "audit", audit);
      this.ev(jobId, "Planner", "Completed", {
        test_result: "Passed",
        artifact_id: audit.audit_id,
      });

      // 3. Refactor
      this.ev(jobId, "Refactor", "Running");
      let plan = await bound.refactor.run(research, audit);
      await this.save(jobId, "plan.refactored", plan);
      this.ev(jobId, "Refactor", "Completed", {
        test_result: "Passed",
        artifact_id: plan.plan_id,
        message: `revision=${plan.revision}`,
      });

      // 4. Gap Analysis
      this.ev(jobId, "GapAnalysis", "Running");
      let gapOutput = await bound.gapper.run(research, plan);
      plan = gapOutput.plan;
      let gap = gapOutput.gap;
      await this.save(jobId, "plan.gap", plan);
      await this.save(jobId, "gap", gap);
      this.ev(jobId, "GapAnalysis", "Completed", {
        test_result: gap.result,
        artifact_id: plan.plan_id,
        message: `gap_0=${gap.gap_0}; revision=${plan.revision}`,
      });
      if (gap.result === "Failed") {
        return this.finishRoot(runId, gap.root_cause!);
      }

      // 5. Evaluation
      this.ev(jobId, "Evaluation", "Running");
      let evaluation = await bound.evaluator.run(research, plan);
      await this.save(jobId, "evaluation", evaluation);
      this.ev(jobId, "Evaluation", "Completed", {
        test_result: evaluation.result,
        artifact_id: plan.plan_id,
      });
      if (evaluation.result === "Failed") {
        return this.finishRoot(runId, evaluation.root_cause!);
      }

      // 6. Triple Validation (parallel schema, fixture, goal lanes)
      const emitValidatorEvents = (tripleResult: TripleValidation) => {
        this.ev(jobId, "SchemaValidation", "Running");
        this.ev(jobId, "SchemaValidation", "Completed", {
          test_result: tripleResult.schema_validation.result,
          artifact_id: tripleResult.schema_validation.plan_id,
        });
        this.ev(jobId, "FixtureValidation", "Running");
        this.ev(jobId, "FixtureValidation", "Completed", {
          test_result: tripleResult.fixture_validation.result,
          artifact_id: tripleResult.fixture_validation.plan_id,
        });
        this.ev(jobId, "GoalValidation", "Running");
        this.ev(jobId, "GoalValidation", "Completed", {
          test_result: tripleResult.goal_validation.result,
          artifact_id: tripleResult.goal_validation.plan_id,
        });
      };

      this.ev(jobId, "TripleValidation", "Running");
      let triple = await bound.triple.run(research, plan);
      emitValidatorEvents(triple);
      await this.save(jobId, "triple-validation", triple);
      this.ev(jobId, "TripleValidation", "Completed", {
        test_result: triple.all_valid ? "Passed" : "Failed",
        ...(triple.all_valid ? {} : { issue_type: "Missing" }),
        artifact_id: triple.validation_id,
      });

      // Refinement loop if NOT_VALID
      const seen = new Set<string>();
      for (let refinement = 1; !triple.all_valid; refinement += 1) {
        if (refinement > 3) {
          const cause = {
            issue: "Triple Validation refinement exceeded maximum iterations",
            expected: "Triple validation passes within maximum refinement limit",
            actual: `triple_validation all_valid=false after ${refinement - 1} refinements`,
            evidence_ids: [triple.validation_id],
            required_correction:
              "Inspect validation findings and correct the plan or requirements",
            recheck_target: plan.plan_id,
          };
          return this.finishRoot(runId, cause);
        }

        const signature = validationSignature(triple);
        const feedback = validationFeedback(research, plan, triple);
        if (feedback.findings.length === 0) {
          const cause = {
            issue: "Triple Validation requires additional information",
            expected:
              "Every NOT_VALID proof maps to a deterministic evidence-backed Plan improvement",
            actual: feedback.unresolved.join("; ") || signature,
            evidence_ids: [
              ...triple.schema_validation.evidence,
              ...triple.fixture_validation.evidence,
              ...triple.goal_validation.evidence,
            ].map((evidence) => evidence.evidence_id),
            required_correction:
              "Provide the missing information required to improve the same logical Plan without guessing",
            recheck_target: plan.plan_id,
          };
          return this.finishRoot(runId, cause);
        }

        if (seen.has(signature)) {
          const cause = {
            issue: "Validation refinement made no new progress",
            expected:
              "Each refinement removes at least one previously observed validation miss without reducing prior Plan value",
            actual: signature,
            evidence_ids: feedback.findings.flatMap(
              (finding) => finding.evidence_ids ?? [],
            ),
            required_correction:
              "Provide additional evidence for a new deterministic Plan improvement",
            recheck_target: plan.plan_id,
          };
          return this.finishRoot(runId, cause);
        }
        seen.add(signature);

        const beforeRevision = plan.revision;
        this.ev(jobId, "GapAnalysis", "Running", {
          message: `validation refinement=${refinement}`,
        });
        gapOutput = await bound.gapper.run(research, plan, feedback.findings);
        plan = gapOutput.plan;
        gap = gapOutput.gap;
        await this.save(jobId, `plan.gap.${refinement}`, plan);
        await this.save(jobId, `gap.${refinement}`, gap);
        this.ev(jobId, "GapAnalysis", "Completed", {
          test_result: gap.result,
          artifact_id: plan.plan_id,
          message: `validation refinement=${refinement}; revision=${plan.revision}`,
        });
        if (gap.result === "Failed") {
          return this.finishRoot(runId, gap.root_cause!);
        }
        if (plan.revision <= beforeRevision) {
          const cause = {
            issue: "Gap refinement did not improve the Plan",
            expected:
              "Validation feedback increases the same plan_id revision and preserves all prior value",
            actual: `revision remained ${plan.revision}`,
            evidence_ids: feedback.findings.flatMap(
              (finding) => finding.evidence_ids ?? [],
            ),
            required_correction:
              "Provide a deterministic additive Plan improvement",
            recheck_target: plan.plan_id,
          };
          return this.finishRoot(runId, cause);
        }

        this.ev(jobId, "Evaluation", "Running", {
          message: `validation refinement=${refinement}`,
        });
        evaluation = await bound.evaluator.run(research, plan);
        await this.save(jobId, `evaluation.${refinement}`, evaluation);
        this.ev(jobId, "Evaluation", "Completed", {
          test_result: evaluation.result,
          artifact_id: plan.plan_id,
        });
        if (evaluation.result === "Failed") {
          return this.finishRoot(runId, evaluation.root_cause!);
        }

        this.ev(jobId, "TripleValidation", "Running", {
          message: `validation refinement=${refinement}`,
        });
        triple = await bound.triple.run(research, plan);
        emitValidatorEvents(triple);
        await this.save(jobId, `triple-validation.${refinement}`, triple);
        this.ev(jobId, "TripleValidation", "Completed", {
          test_result: triple.all_valid ? "Passed" : "Failed",
          ...(triple.all_valid ? {} : { issue_type: "Missing" }),
          artifact_id: triple.validation_id,
        });
      }

      // 7. Confirmation
      this.ev(jobId, "Confirmed", "Running");
      const confirmed = await bound.confirmation.run(
        research,
        plan,
        audit,
        gap,
        evaluation,
        triple,
      );
      await this.save(jobId, "confirmed", confirmed);
      this.ev(jobId, "Confirmed", "Completed", {
        test_result: "Passed",
        artifact_id: confirmed.core.researcher.researcher_id,
      });

      // 8. Create Hash
      this.ev(jobId, "CreateHash", "Running");
      const createdHash = await bound.hash.create(confirmed);
      await this.save(jobId, "confirmed-hash", { hash: createdHash });
      this.ev(jobId, "CreateHash", "Completed", {
        test_result: "Passed",
        artifact_id: createdHash,
      });

      // Build Review Gate
      if (await this.buildReview.enabled(jobId)) {
        await this.buildReview.open(jobId, confirmed, createdHash);
        this.ev(jobId, "BuildReady", "Running", {
          scope: "SUPPORT",
          message: "Confirmed package ready. Confirm Build to continue.",
        });
        await this.buildReview.wait(
          jobId,
          () => this.runs.get(jobId)?.pipeline_status === "Done",
        );
        await this.buildReview.requireApproved(jobId, confirmed, createdHash);
        this.ev(jobId, "BuildReady", "Completed", {
          scope: "SUPPORT",
          message: "Build authorized for the confirmed package.",
        });
      }

      // 9. Builder
      this.ev(jobId, "Builder", "Running");
      const builderResult = await bound.builder.run(confirmed, createdHash);
      await this.save(jobId, "builder-result", builderResult);
      this.ev(jobId, "Builder", "Completed", {
        test_result: builderResult.result,
        artifact_id: createdHash,
      });
      if (builderResult.result === "Failed") {
        return this.finishRoot(
          runId,
          "root_cause" in builderResult
            ? builderResult.root_cause
            : {
                issue: "Builder execution failed",
                expected: "Sandbox build executes successfully",
                actual: "Failed",
                evidence_ids: [],
                required_correction: "Inspect sandbox build failure",
                recheck_target: "Builder",
              },
        );
      }

      // 10. Hash Verification
      this.ev(jobId, "Hash", "Running");
      const proof = await bound.hash.proof(createdHash, builderResult.hash_sandbox);
      await this.save(jobId, "hash_proof", proof);
      this.ev(jobId, "Hash", "Completed", {
        test_result: proof.equal ? "Passed" : "Failed",
        artifact_id: proof.recomputed_hash,
        message: `equal=${proof.equal}`,
      });
      if (!proof.equal) {
        return this.finishRoot(
          runId,
          {
            issue: "Hash verification mismatch",
            expected: proof.created_hash,
            actual: proof.recomputed_hash,
            evidence_ids: ["hash-proof"],
            required_correction:
              "Recompute the sandbox hash from the exact confirmed immutable package",
            recheck_target: plan.plan_id,
          },
          proof,
        );
      }

      return this.finishPassed(runId, proof);
    } catch (error) {
      const current = this.runs.require(runId);
      if (current.pipeline_status === "Done") return current;
      return this.finishRoot(
        runId,
        toNativeRootCause(error, runId),
        undefined,
        error instanceof WorkflowInformationRequiredError
          ? error.helpRequest
          : undefined,
      );
    } finally {
      await bound?.release?.();
    }
  }
}
