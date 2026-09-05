import { node, type NodeContext, Workflow } from "@google/adk";

import type {
  Audit,
  ConfirmedPackage,
  Evaluation,
  GapAnalysis,
  HashProof,
  Plan,
  Prompt,
  ResearchBundle,
  RootCause,
  TripleValidation,
} from "../../contracts/schema/types.js";
import { WorkflowRootCauseError } from "../../core/root-cause-error.js";
import { validationFeedback } from "../../role/gap-analysis/tool/validation-feedback.js";
import type { BuilderWorkflow } from "../../role/builder/workflow.js";
import type { EvaluationWorkflow } from "../../role/evaluation/workflow.js";
import type { GapAnalysisWorkflow } from "../../role/gap-analysis/workflow.js";
import type { PlannerWorkflow } from "../../role/planner/workflow.js";
import type { RefactorWorkflow } from "../../role/refactor/workflow.js";
import type { ResearcherWorkflow } from "../../role/researcher/workflow.js";
import type { SandboxExecutionResult } from "../../sandbox/types.js";
import type { ConfirmationWorkflow } from "../confirmation.js";
import type { HashWorkflow } from "../hash.js";
import type { TripleValidationWorkflow } from "../triple-validation.js";
import { createBuilderNode } from "./node/builder-node.js";
import { createConfirmationNode } from "./node/confirmation-node.js";
import { createEvaluationNode } from "./node/evaluation-node.js";
import { createGapAnalysisNode } from "./node/gap-analysis-node.js";
import { createCreateHashNode, createVerifyHashNode } from "./node/hash-node.js";
import { createPlannerNode } from "./node/planner-node.js";
import { createRefactorNode } from "./node/refactor-node.js";
import { createResearcherNode } from "./node/researcher-node.js";
import { createTripleValidationNode } from "./node/triple-validation-node.js";

export interface OneShotDynamicInput {
  job_id: string;
  prompt: Prompt;
}

export interface OneShotDynamicDependencies {
  researcher: ResearcherWorkflow;
  planner: PlannerWorkflow;
  refactor: RefactorWorkflow;
  gapper: GapAnalysisWorkflow;
  evaluator: EvaluationWorkflow;
  triple: TripleValidationWorkflow;
  confirmation: ConfirmationWorkflow;
  hash: HashWorkflow;
  builder: BuilderWorkflow;
}

export interface OneShotDynamicEffects {
  event?(
    jobId: string,
    processor: string,
    state: "RUNNING" | "COMPLETE",
    data?: Record<string, unknown>,
  ): void;
  save?(jobId: string, name: string, value: unknown): Promise<string>;
}

export interface OneShotDynamicPassed {
  result: "PASSED";
  research: ResearchBundle;
  audit: Audit;
  plan: Plan;
  gap: GapAnalysis;
  evaluation: Evaluation;
  triple: TripleValidation;
  confirmed: ConfirmedPackage;
  created_hash: string;
  builder: Extract<SandboxExecutionResult, { result: "PASSED" }>;
  hash_proof: HashProof;
}

export interface OneShotDynamicRootCause {
  result: "ROOT_CAUSE";
  root_cause: RootCause;
  research?: ResearchBundle;
  audit?: Audit;
  plan?: Plan;
  gap?: GapAnalysis;
  evaluation?: Evaluation;
  triple?: TripleValidation;
  builder?: SandboxExecutionResult;
  hash_proof?: HashProof;
}

export type OneShotDynamicResult = OneShotDynamicPassed | OneShotDynamicRootCause;

function parseInput(value: unknown): OneShotDynamicInput {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("OneShot dynamic workflow requires { job_id, prompt } input");
  }
  const input = parsed as Partial<OneShotDynamicInput>;
  if (typeof input.job_id !== "string" || !/[A-Za-z]/.test(input.job_id)) {
    throw new Error("OneShot job_id must contain at least one non-numeric character");
  }
  if (!input.prompt || typeof input.prompt !== "object") {
    throw new Error("OneShot dynamic workflow requires canonical Prompt input");
  }
  return input as OneShotDynamicInput;
}

function rootCause(
  issue: string,
  expected: string,
  actual: string,
  evidenceIds: string[],
  correction: string,
  target: string,
): RootCause {
  return {
    issue,
    expected,
    actual,
    evidence_ids: evidenceIds,
    required_correction: correction,
    recheck_target: target,
  };
}

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

async function save(effects: OneShotDynamicEffects, jobId: string, name: string, value: unknown) {
  await effects.save?.(jobId, name, value);
}

/**
 * Build the actual OneShot Google ADK dynamic Workflow.
 *
 * Every existing OneShot Role is connected as an ADK node and invoked through
 * ctx.runNode(). Typed outputs are passed directly to the next node. Triple
 * Validation fans out concurrently. NOT_VALID is refinement feedback: it is
 * converted into Gap findings, the same logical Plan is improved, Evaluation
 * is rerun, and all three validators are proved again from scratch.
 */
export function createOneShotDynamicWorkflow(
  deps: OneShotDynamicDependencies,
  effects: OneShotDynamicEffects = {},
): Workflow {
  const researcherNode = createResearcherNode(deps.researcher);
  const plannerNode = createPlannerNode(deps.planner);
  const refactorNode = createRefactorNode(deps.refactor);
  const gapNode = createGapAnalysisNode(deps.gapper);
  const evaluationNode = createEvaluationNode(deps.evaluator);
  const tripleNode = createTripleValidationNode(deps.triple);
  const confirmationNode = createConfirmationNode(deps.confirmation);
  const createHashNode = createCreateHashNode(deps.hash);
  const builderNode = createBuilderNode(deps.builder);
  const verifyHashNode = createVerifyHashNode(deps.hash);

  const pipeline = node(
    async (ctx: NodeContext, nodeInput: unknown): Promise<OneShotDynamicResult> => {
      const input = parseInput(nodeInput);
      const jobId = input.job_id;

      effects.event?.(jobId, "Researcher", "RUNNING");
      const research = (await ctx.runNode(
        researcherNode,
        { job_id: jobId, prompt: input.prompt },
        { runId: `${jobId}-researcher` },
      )).output as ResearchBundle;
      await save(effects, jobId, "prompt", research.prompt);
      await save(effects, jobId, "researcher", research.researcher);
      await save(effects, jobId, "plan.researcher", research.plan);
      await save(effects, jobId, "schema", research.schema_artifact);
      await save(effects, jobId, "fixture", research.fixture);
      await save(effects, jobId, "goal", research.goal);
      await save(effects, jobId, "validation", research.validation);
      effects.event?.(jobId, "Researcher", "COMPLETE", {
        result: "PASSED",
        artifact_id: research.researcher.researcher_id,
      });

      effects.event?.(jobId, "Planner", "RUNNING");
      const audit = (await ctx.runNode(
        plannerNode,
        { job_id: jobId, research },
        { runId: `${jobId}-planner` },
      )).output as Audit;
      await save(effects, jobId, "audit", audit);
      effects.event?.(jobId, "Planner", "COMPLETE", {
        result: "PASSED",
        artifact_id: audit.audit_id,
      });

      effects.event?.(jobId, "Refactor", "RUNNING");
      let plan = (await ctx.runNode(
        refactorNode,
        { job_id: jobId, research, audit },
        { runId: `${jobId}-refactor` },
      )).output as Plan;
      await save(effects, jobId, "plan.refactored", plan);
      effects.event?.(jobId, "Refactor", "COMPLETE", {
        result: "PASSED",
        artifact_id: plan.plan_id,
        message: `revision=${plan.revision}`,
      });

      effects.event?.(jobId, "GapAnalysis", "RUNNING");
      let gapOutput = (await ctx.runNode(
        gapNode,
        { job_id: jobId, research, plan },
        { runId: `${jobId}-gap-0` },
      )).output as { plan: Plan; gap: GapAnalysis };
      plan = gapOutput.plan;
      let gap = gapOutput.gap;
      await save(effects, jobId, "plan.gap", plan);
      await save(effects, jobId, "gap", gap);
      effects.event?.(jobId, "GapAnalysis", "COMPLETE", {
        result: gap.result,
        artifact_id: plan.plan_id,
        message: `gap_0=${gap.gap_0}; revision=${plan.revision}`,
      });
      if (gap.result === "ROOT_CAUSE") {
        return { result: "ROOT_CAUSE", root_cause: gap.root_cause!, research, audit, plan, gap };
      }

      effects.event?.(jobId, "Evaluation", "RUNNING");
      let evaluation = (await ctx.runNode(
        evaluationNode,
        { job_id: jobId, research, plan },
        { runId: `${jobId}-evaluation-0` },
      )).output as Evaluation;
      await save(effects, jobId, "evaluation", evaluation);
      effects.event?.(jobId, "Evaluation", "COMPLETE", {
        result: evaluation.result,
        artifact_id: plan.plan_id,
      });
      if (evaluation.result === "ROOT_CAUSE") {
        return { result: "ROOT_CAUSE", root_cause: evaluation.root_cause!, research, audit, plan, gap, evaluation };
      }

      effects.event?.(jobId, "TripleValidation", "RUNNING");
      let triple = (await ctx.runNode(
        tripleNode,
        { job_id: `${jobId}-proof-0`, research, plan },
        { runId: `${jobId}-triple-0` },
      )).output as TripleValidation;
      await save(effects, jobId, "triple-validation", triple);
      effects.event?.(jobId, "TripleValidation", "COMPLETE", {
        result: triple.all_valid ? "PASSED" : "NOT_VALID",
        artifact_id: triple.validation_id,
      });

      const seen = new Set<string>();
      for (let refinement = 1; !triple.all_valid; refinement += 1) {
        const signature = validationSignature(triple);
        const feedback = validationFeedback(research, plan, triple);
        if (feedback.findings.length === 0) {
          const cause = rootCause(
            "Triple Validation requires additional information",
            "Every NOT_VALID proof maps to a deterministic evidence-backed Plan improvement",
            feedback.unresolved.join("; ") || signature,
            [
              ...triple.schema_validation.evidence,
              ...triple.fixture_validation.evidence,
              ...triple.goal_validation.evidence,
            ].map((evidence) => evidence.evidence_id),
            "Provide the missing information required to improve the same logical Plan without guessing",
            plan.plan_id,
          );
          return { result: "ROOT_CAUSE", root_cause: cause, research, audit, plan, gap, evaluation, triple };
        }
        if (seen.has(signature)) {
          const cause = rootCause(
            "Validation refinement made no new progress",
            "Each refinement removes at least one previously observed validation miss without reducing prior Plan value",
            signature,
            feedback.findings.flatMap((finding) => finding.evidence_ids ?? []),
            "Provide additional evidence for a new deterministic Plan improvement",
            plan.plan_id,
          );
          return { result: "ROOT_CAUSE", root_cause: cause, research, audit, plan, gap, evaluation, triple };
        }
        seen.add(signature);

        const beforeRevision = plan.revision;
        effects.event?.(jobId, "GapAnalysis", "RUNNING", {
          message: `validation refinement=${refinement}`,
        });
        gapOutput = (await ctx.runNode(
          gapNode,
          {
            job_id: `${jobId}-refine-${refinement}`,
            research,
            plan,
            seed_findings: feedback.findings,
          },
          { runId: `${jobId}-gap-refine-${refinement}` },
        )).output as { plan: Plan; gap: GapAnalysis };
        plan = gapOutput.plan;
        gap = gapOutput.gap;
        await save(effects, jobId, `plan.gap.${refinement}`, plan);
        await save(effects, jobId, `gap.${refinement}`, gap);
        effects.event?.(jobId, "GapAnalysis", "COMPLETE", {
          result: gap.result,
          artifact_id: plan.plan_id,
          message: `validation refinement=${refinement}; revision=${plan.revision}`,
        });
        if (gap.result === "ROOT_CAUSE") {
          return { result: "ROOT_CAUSE", root_cause: gap.root_cause!, research, audit, plan, gap, evaluation, triple };
        }
        if (plan.revision <= beforeRevision) {
          const cause = rootCause(
            "Gap refinement did not improve the Plan",
            "Validation feedback increases the same plan_id revision and preserves all prior value",
            `revision remained ${plan.revision}`,
            feedback.findings.flatMap((finding) => finding.evidence_ids ?? []),
            "Provide a deterministic additive Plan improvement",
            plan.plan_id,
          );
          return { result: "ROOT_CAUSE", root_cause: cause, research, audit, plan, gap, evaluation, triple };
        }

        effects.event?.(jobId, "Evaluation", "RUNNING", {
          message: `validation refinement=${refinement}`,
        });
        evaluation = (await ctx.runNode(
          evaluationNode,
          { job_id: `${jobId}-refine-${refinement}`, research, plan },
          { runId: `${jobId}-evaluation-refine-${refinement}` },
        )).output as Evaluation;
        await save(effects, jobId, `evaluation.${refinement}`, evaluation);
        effects.event?.(jobId, "Evaluation", "COMPLETE", {
          result: evaluation.result,
          artifact_id: plan.plan_id,
        });
        if (evaluation.result === "ROOT_CAUSE") {
          return { result: "ROOT_CAUSE", root_cause: evaluation.root_cause!, research, audit, plan, gap, evaluation, triple };
        }

        effects.event?.(jobId, "TripleValidation", "RUNNING", {
          message: `fresh proof after refinement=${refinement}`,
        });
        triple = (await ctx.runNode(
          tripleNode,
          { job_id: `${jobId}-proof-${refinement}`, research, plan },
          { runId: `${jobId}-triple-${refinement}` },
        )).output as TripleValidation;
        await save(effects, jobId, `triple-validation.${refinement}`, triple);
        effects.event?.(jobId, "TripleValidation", "COMPLETE", {
          result: triple.all_valid ? "PASSED" : "NOT_VALID",
          artifact_id: triple.validation_id,
          message: `refinement=${refinement}`,
        });

        if (refinement >= 32 && !triple.all_valid) {
          const cause = rootCause(
            "Validation refinement exceeded deterministic bound",
            "The same logical Plan converges to all VALID proofs",
            validationSignature(triple),
            [],
            "Provide additional information required to resolve the remaining validation findings",
            plan.plan_id,
          );
          return { result: "ROOT_CAUSE", root_cause: cause, research, audit, plan, gap, evaluation, triple };
        }
      }

      effects.event?.(jobId, "Confirmed", "RUNNING");
      const confirmed = (await ctx.runNode(
        confirmationNode,
        { job_id: jobId, research, plan, audit, gap, evaluation, triple },
        { runId: `${jobId}-confirmed` },
      )).output as ConfirmedPackage;
      await save(effects, jobId, "confirmed", confirmed);
      effects.event?.(jobId, "Confirmed", "COMPLETE", {
        result: "PASSED",
        artifact_id: plan.plan_id,
      });

      effects.event?.(jobId, "CreateHash", "RUNNING");
      const createdHash = (await ctx.runNode(
        createHashNode,
        { job_id: jobId, confirmed },
        { runId: `${jobId}-create-hash` },
      )).output as string;
      await save(effects, jobId, "confirmed-hash", { hash: createdHash });
      effects.event?.(jobId, "CreateHash", "COMPLETE", {
        result: "PASSED",
        artifact_id: createdHash,
      });

      effects.event?.(jobId, "Builder", "RUNNING");
      const builder = (await ctx.runNode(
        builderNode,
        { job_id: jobId, confirmed, hash: createdHash },
        { runId: `${jobId}-builder` },
      )).output as SandboxExecutionResult;
      await save(effects, jobId, "builder-result", builder);
      effects.event?.(jobId, "Builder", "COMPLETE", {
        result: builder.result,
        artifact_id: builder.execution_id,
      });
      if (builder.result === "ROOT_CAUSE") {
        return { result: "ROOT_CAUSE", root_cause: builder.root_cause, research, audit, plan, gap, evaluation, triple, builder };
      }

      effects.event?.(jobId, "Hash", "RUNNING");
      const proof = (await ctx.runNode(
        verifyHashNode,
        { job_id: jobId, created_hash: createdHash, sandbox_hash: builder.hash_sandbox },
        { runId: `${jobId}-hash` },
      )).output as HashProof;
      await save(effects, jobId, "hash-proof", proof);
      effects.event?.(jobId, "Hash", "COMPLETE", {
        result: proof.equal ? "PASSED" : "ROOT_CAUSE",
        artifact_id: proof.recomputed_hash,
        message: `equal=${proof.equal}`,
      });
      if (!proof.equal) {
        return {
          result: "ROOT_CAUSE",
          root_cause: rootCause(
            "Hash verification mismatch",
            proof.created_hash,
            proof.recomputed_hash,
            ["hash-proof"],
            "Recompute the sandbox hash from the exact confirmed immutable package",
            plan.plan_id,
          ),
          research,
          audit,
          plan,
          gap,
          evaluation,
          triple,
          builder,
          hash_proof: proof,
        };
      }

      return {
        result: "PASSED",
        research,
        audit,
        plan,
        gap,
        evaluation,
        triple,
        confirmed,
        created_hash: createdHash,
        builder,
        hash_proof: proof,
      };
    },
    { name: "OneShotPipeline", rerunOnResume: true },
  );

  return new Workflow({
    name: "OneShot",
    edges: [["START", pipeline]],
  });
}

/** Convert unexpected connector failures to the canonical OneShot ROOT_CAUSE shape. */
export function toDynamicRootCause(error: unknown, jobId: string): RootCause {
  if (error instanceof WorkflowRootCauseError) return error.rootCause;
  return rootCause(
    "ADK dynamic workflow execution failed",
    "OneShot dynamic Workflow reaches a canonical terminal result",
    error instanceof Error ? error.message : String(error),
    [],
    "Correct the reported ADK node, Role, provider, contract, or runtime boundary",
    jobId,
  );
}
