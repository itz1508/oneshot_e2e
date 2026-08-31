import type { Prompt, RootCause, RunSnapshot } from "../contract/types.js";
import { WorkflowRootCauseError } from "../core/root-cause-error.js";
import { WorkflowInformationRequiredError } from "../core/information-required-error.js";
import type { HelpRequest } from "../intent/types.js";
import { ProcessingEventBus } from "./event-bus.js";
import { RunRepository } from "./run-repository.js";
import { ArtifactStore } from "./artifact-store.js";
import { ResearcherWorkflow } from "../role/researcher/workflow.js";
import { PlannerWorkflow } from "../role/planner/workflow.js";
import { RefactorWorkflow } from "../role/refactor/workflow.js";
import { GapAnalysisWorkflow } from "../role/gap-analysis/workflow.js";
import { EvaluationWorkflow } from "../role/evaluation/workflow.js";
import { TripleValidationWorkflow } from "../workflow/triple-validation.js";
import { ConfirmationWorkflow } from "../workflow/confirmation.js";
import { HashWorkflow } from "../workflow/hash.js";

/**
 * Canonical workflow runtime — orchestrates the full pipeline:
 *   Researcher → Planner → Refactor → GapAnalysis → Evaluation
 *   → Schema/Fixture/Goal Validation → TripleValidation → Confirmed
 *   → CreateHash → Hash → Done
 *
 * Events are emitted via the ProcessingEventBus.  Run snapshots and
 * artifacts are persisted by external observers (wired in index.ts).
 */
export class WorkflowRuntime {
  constructor(
    private events: ProcessingEventBus,
    private runs: RunRepository,
    readonly store: ArtifactStore,
    private researcher: ResearcherWorkflow,
    private planner: PlannerWorkflow,
    private refactor: RefactorWorkflow,
    private gapper: GapAnalysisWorkflow,
    private evaluator: EvaluationWorkflow,
    private triple: TripleValidationWorkflow,
    private confirmation: ConfirmationWorkflow,
    private hash: HashWorkflow,
  ) {}

  /** Emit a processing event. */
  private ev(
    runId: string,
    processor: string,
    state: "PENDING" | "RUNNING" | "COMPLETE",
    data: Parameters<ProcessingEventBus["emit"]>[3] = {},
  ): void {
    this.events.emit(runId, processor, state, data);
  }

  /** Save an artifact and record its path on the run snapshot. */
  private async save(
    runId: string,
    name: string,
    value: unknown,
  ): Promise<string> {
    const p = await this.store.save(runId, name, value);
    this.runs.artifact(runId, name, p);
    return p;
  }

  /**
   * Finish a run with ROOT_CAUSE.
   * If a HelpRequest is provided, emit SUPPORT-scoped help events first.
   */
  private finishRoot(
    runId: string,
    rc: RootCause,
    hashProof?: RunSnapshot["hash_proof"],
    helpRequest?: HelpRequest,
  ): RunSnapshot {
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
      message: rc.actual,
    });

    return this.runs.finish(runId, "ROOT_CAUSE", hashProof, rc, helpRequest);
  }

  /** Execute the full canonical workflow pipeline. */
  async run(runId: string, prompt: Prompt): Promise<RunSnapshot> {
    // Emit PENDING for all canonical processors
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
      "Hash",
      "Done",
    ];
    for (const p of order) this.ev(runId, p, "PENDING");

    try {
      // --- Researcher ---
      this.ev(runId, "Researcher", "RUNNING");
      const b = await this.researcher.run(prompt, runId);
      await this.save(runId, "prompt", b.prompt);
      await this.save(runId, "researcher", b.researcher);
      await this.save(runId, "plan.researcher", b.plan);
      await this.save(runId, "schema", b.schema_artifact);
      await this.save(runId, "fixture", b.fixture);
      await this.save(runId, "goal", b.goal);
      await this.save(runId, "validation", b.validation);
      this.ev(runId, "Researcher", "COMPLETE", {
        result: "PASSED",
        artifact_id: b.researcher.researcher_id,
      });

      // --- Planner ---
      this.ev(runId, "Planner", "RUNNING");
      const audit = await this.planner.run(b, runId);
      await this.save(runId, "audit", audit);
      this.ev(runId, "Planner", "COMPLETE", {
        result: "PASSED",
        artifact_id: audit.audit_id,
        message: `reviewed=${audit.reviewed_areas.length}; findings=${audit.findings.length}`,
      });

      // --- Refactor ---
      this.ev(runId, "Refactor", "RUNNING");
      const refactored = await this.refactor.run(b, audit);
      b.plan = refactored;
      await this.save(runId, "plan.refactored", refactored);
      this.ev(runId, "Refactor", "COMPLETE", {
        result: "PASSED",
        artifact_id: refactored.plan_id,
        message: `plan_id preserved; revision=${refactored.revision}`,
      });

      // --- Gap Analysis ---
      this.ev(runId, "GapAnalysis", "RUNNING");
      const g = await this.gapper.run(b, refactored);
      b.plan = g.plan;
      await this.save(runId, "plan.gap", g.plan);
      await this.save(runId, "gap", g.gap);
      this.ev(runId, "GapAnalysis", "COMPLETE", {
        result: g.gap.result,
        artifact_id: g.gap.plan_id,
        message: `gap_0=${g.gap.gap_0}; resolved=${g.gap.resolved_gaps.length}`,
      });
      if (g.gap.result !== "PASSED") {
        return this.finishRoot(runId, g.gap.root_cause!);
      }

      // --- Evaluation ---
      this.ev(runId, "Evaluation", "RUNNING");
      const evaluation = await this.evaluator.run(b, g.plan);
      await this.save(runId, "evaluation", evaluation);
      this.ev(runId, "Evaluation", "COMPLETE", {
        result: evaluation.result,
        artifact_id: evaluation.plan_id,
        message: `evidence=${evaluation.evidence.length}`,
      });
      if (evaluation.result !== "PASSED") {
        return this.finishRoot(runId, evaluation.root_cause!);
      }

      // --- Triple Validation (parallel validators) ---
      this.ev(runId, "SchemaValidation", "RUNNING");
      this.ev(runId, "FixtureValidation", "RUNNING");
      this.ev(runId, "GoalValidation", "RUNNING");

      const triple = await this.triple.run(b, g.plan);
      await this.save(runId, "triple-validation", triple);

      this.ev(runId, "SchemaValidation", "COMPLETE", {
        result: triple.schema_validation.result,
        artifact_id: triple.schema_validation.schema_id,
      });
      this.ev(runId, "FixtureValidation", "COMPLETE", {
        result: triple.fixture_validation.result,
        artifact_id: triple.fixture_validation.fixture_id,
      });
      this.ev(runId, "GoalValidation", "COMPLETE", {
        result: triple.goal_validation.result,
        artifact_id: triple.goal_validation.goal_id,
      });

      // Explicit TripleValidation gate event
      this.ev(runId, "TripleValidation", "RUNNING");
      this.ev(runId, "TripleValidation", "COMPLETE", {
        result: triple.all_valid ? "VALID" : "NOT_VALID",
        artifact_id: triple.validation_id,
        message: `all_valid=${triple.all_valid}`,
      });

      if (!triple.all_valid) {
        const evidence = [
          ...triple.schema_validation.evidence,
          ...triple.fixture_validation.evidence,
          ...triple.goal_validation.evidence,
        ].map((e) => e.evidence_id);
        return this.finishRoot(runId, {
          issue: "Triple Validation rejected plan",
          expected: "Schema, Fixture, Goal all VALID",
          actual: `${triple.schema_validation.result}/${triple.fixture_validation.result}/${triple.goal_validation.result}`,
          evidence_ids: [...new Set(evidence)],
          required_correction: "Correct plan against validator evidence",
          recheck_target: g.plan.plan_id,
        });
      }

      // --- Confirmed ---
      this.ev(runId, "Confirmed", "RUNNING");
      const confirmed = await this.confirmation.run(
        b,
        g.plan,
        audit,
        g.gap,
        evaluation,
        triple,
      );
      await this.save(runId, "confirmed", confirmed);
      this.ev(runId, "Confirmed", "COMPLETE", {
        result: "PASSED",
        artifact_id: g.plan.plan_id,
      });

      // --- CreateHash + Hash ---
      this.ev(runId, "CreateHash", "RUNNING");
      const proof = await this.hash.run(confirmed);
      this.ev(runId, "CreateHash", "COMPLETE", {
        result: "PASSED",
        artifact_id: proof.created_hash,
      });

      this.ev(runId, "Hash", "RUNNING");
      await this.save(runId, "hash-proof", proof);
      this.ev(runId, "Hash", "COMPLETE", {
        result: proof.equal ? "PASSED" : "ROOT_CAUSE",
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
              "Recompute from exact confirmed immutable core",
            recheck_target: g.plan.plan_id,
          },
          proof,
        );
      }

      // --- Done ---
      this.ev(runId, "Done", "RUNNING");
      this.ev(runId, "Done", "COMPLETE", {
        result: "PASSED",
        artifact_id: proof.created_hash,
      });

      return this.runs.finish(runId, "PASSED", proof);
    } catch (error) {
      const rc =
        error instanceof WorkflowRootCauseError
          ? error.rootCause
          : {
              issue: "Workflow execution failed",
              expected: "Canonical full chain reaches DONE",
              actual:
                error instanceof Error ? error.message : String(error),
              evidence_ids: [],
              required_correction:
                "Correct the reported execution or contract failure",
              recheck_target: runId,
            };

      return this.finishRoot(
        runId,
        rc,
        undefined,
        error instanceof WorkflowInformationRequiredError
          ? error.helpRequest
          : undefined,
      );
    }
  }
}
