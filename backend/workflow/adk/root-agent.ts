import { SequentialAgent } from "@google/adk";
import type { HashProof, RootCause } from "../../contracts/schema/types.js";
import type { BuilderWorkflow } from "../../role/builder/workflow.js";
import type { EvaluationWorkflow } from "../../role/evaluation/workflow.js";
import type { GapAnalysisWorkflow } from "../../role/gap-analysis/workflow.js";
import type { PlannerWorkflow } from "../../role/planner/workflow.js";
import type { RefactorWorkflow } from "../../role/refactor/workflow.js";
import type { ResearcherWorkflow } from "../../role/researcher/workflow.js";
import type { ConfirmationWorkflow } from "../confirmation.js";
import type { HashWorkflow } from "../hash.js";
import type { TripleValidationWorkflow } from "../triple-validation.js";
import { createGapAnalysisAgent } from "./gap-loop.js";
import { ADK_STATE, state } from "./state.js";
import { OneShotStageAgent, rootCauseDelta } from "./stage-agent.js";
import { createTripleValidationAgent } from "./triple-validation.js";

export interface OneShotWorkflowEffects {
  event(
    runId: string,
    processor: string,
    processingState: "PENDING" | "RUNNING" | "COMPLETE",
    data?: Record<string, unknown>,
  ): void;
  save(runId: string, name: string, value: unknown): Promise<string>;
  finishPassed(runId: string, proof: HashProof): void;
  finishRoot(runId: string, rootCause: RootCause, proof?: HashProof): void;
}

export interface OneShotWorkflowDependencies {
  researcher: ResearcherWorkflow;
  planner: PlannerWorkflow;
  refactor: RefactorWorkflow;
  gapper: GapAnalysisWorkflow;
  evaluator: EvaluationWorkflow;
  triple: TripleValidationWorkflow;
  confirmation: ConfirmationWorkflow;
  hash: HashWorkflow;
  builder: BuilderWorkflow;
  effects: OneShotWorkflowEffects;
}

/**
 * Build the canonical OneShot workflow as a real Google ADK SequentialAgent.
 *
 * Strict outer order is owned by SequentialAgent. Gap repetition and Triple
 * Validation concurrency are delegated to nested LoopAgent / ParallelAgent
 * compositions. Deterministic OneShot responsibilities remain deterministic.
 */
export function createOneShotRootAgent(
  deps: OneShotWorkflowDependencies,
): SequentialAgent {
  const { effects } = deps;

  const researcher = new OneShotStageAgent({
    name: "ResearcherStage",
    description: "Runs the canonical Researcher role.",
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      effects.event(runId, "Researcher", "RUNNING");
      const bundle = await deps.researcher.run(state.prompt(ctx), runId);

      await effects.save(runId, "prompt", bundle.prompt);
      await effects.save(runId, "researcher", bundle.researcher);
      await effects.save(runId, "plan.researcher", bundle.plan);
      await effects.save(runId, "schema", bundle.schema_artifact);
      await effects.save(runId, "fixture", bundle.fixture);
      await effects.save(runId, "goal", bundle.goal);
      await effects.save(runId, "validation", bundle.validation);

      effects.event(runId, "Researcher", "COMPLETE", {
        result: "PASSED",
        artifact_id: bundle.researcher.researcher_id,
      });

      return {
        stateDelta: {
          [ADK_STATE.bundle]: bundle,
          [ADK_STATE.plan]: bundle.plan,
        },
      };
    },
  });

  const planner = new OneShotStageAgent({
    name: "PlannerStage",
    description: "Runs the canonical Planner review/audit role.",
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      effects.event(runId, "Planner", "RUNNING");
      const audit = await deps.planner.run(state.bundle(ctx), runId);
      await effects.save(runId, "audit", audit);
      effects.event(runId, "Planner", "COMPLETE", {
        result: "PASSED",
        artifact_id: audit.audit_id,
        message: `reviewed=${audit.reviewed_areas.length}; findings=${audit.findings.length}`,
      });
      return { stateDelta: { [ADK_STATE.audit]: audit } };
    },
  });

  const refactor = new OneShotStageAgent({
    name: "RefactorStage",
    description: "Runs canonical Refactor while preserving logical plan_id.",
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      effects.event(runId, "Refactor", "RUNNING");
      const plan = await deps.refactor.run(state.bundle(ctx), state.audit(ctx));
      const bundle = { ...state.bundle(ctx), plan };
      await effects.save(runId, "plan.refactored", plan);
      effects.event(runId, "Refactor", "COMPLETE", {
        result: "PASSED",
        artifact_id: plan.plan_id,
        message: `plan_id preserved; revision=${plan.revision}`,
      });
      return {
        stateDelta: {
          [ADK_STATE.plan]: plan,
          [ADK_STATE.bundle]: bundle,
        },
      };
    },
  });

  const gapAnalysis = createGapAnalysisAgent(deps.gapper, effects);

  const evaluation = new OneShotStageAgent({
    name: "EvaluationStage",
    description: "Evaluates the final gap_0 plan.",
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      effects.event(runId, "Evaluation", "RUNNING");
      const result = await deps.evaluator.run(
        state.bundle(ctx),
        state.plan(ctx),
      );
      await effects.save(runId, "evaluation", result);
      effects.event(runId, "Evaluation", "COMPLETE", {
        result: result.result,
        artifact_id: result.plan_id,
        message: `evidence=${result.evidence.length}`,
      });
      return {
        stateDelta: {
          [ADK_STATE.evaluation]: result,
          ...(result.root_cause ? rootCauseDelta(result.root_cause) : {}),
        },
      };
    },
  });

  const tripleValidation = createTripleValidationAgent(deps.triple, effects);

  const confirmation = new OneShotStageAgent({
    name: "ConfirmationStage",
    description: "Creates the exact confirmed immutable package.",
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      effects.event(runId, "Confirmed", "RUNNING");
      const confirmed = await deps.confirmation.run(
        state.bundle(ctx),
        state.plan(ctx),
        state.audit(ctx),
        state.gap(ctx),
        state.evaluation(ctx),
        state.tripleValidation(ctx),
      );
      await effects.save(runId, "confirmed", confirmed);
      effects.event(runId, "Confirmed", "COMPLETE", {
        result: "PASSED",
        artifact_id: state.plan(ctx).plan_id,
      });
      return {
        stateDelta: { [ADK_STATE.confirmed]: confirmed },
      };
    },
  });

  const createHash = new OneShotStageAgent({
    name: "CreateHashStage",
    description: "Creates H1 from the confirmed immutable core.",
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      effects.event(runId, "CreateHash", "RUNNING");
      const createdHash = await deps.hash.create(state.confirmed(ctx));
      await effects.save(runId, "confirmed-hash", { hash: createdHash });
      effects.event(runId, "CreateHash", "COMPLETE", {
        result: "PASSED",
        artifact_id: createdHash,
      });
      return {
        stateDelta: { [ADK_STATE.createdHash]: createdHash },
      };
    },
  });

  const builder = new OneShotStageAgent({
    name: "BuilderStage",
    description:
      "Executes the exact confirmed package through the governed sandbox.",
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      effects.event(runId, "Builder", "RUNNING");
      const result = await deps.builder.run(
        state.confirmed(ctx),
        state.createdHash(ctx),
      );
      await effects.save(runId, "builder-result", result);
      effects.event(runId, "Builder", "COMPLETE", {
        result: result.result,
        artifact_id: result.execution_id,
      });
      return {
        stateDelta: {
          [ADK_STATE.builderResult]: result,
          ...(result.result === "ROOT_CAUSE"
            ? rootCauseDelta(result.root_cause)
            : {}),
        },
      };
    },
  });

  const hashVerification = new OneShotStageAgent({
    name: "HashVerificationStage",
    description:
      "Compares confirmation H1 with the sandbox-side recomputation of the same confirmed core.",
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      const result = state.builderResult(ctx);
      if (result.result !== "PASSED") return;

      effects.event(runId, "Hash", "RUNNING");
      const proof = await deps.hash.proof(
        state.createdHash(ctx),
        result.hash_sandbox,
      );
      await effects.save(runId, "hash-proof", proof);
      effects.event(runId, "Hash", "COMPLETE", {
        result: proof.equal ? "PASSED" : "ROOT_CAUSE",
        artifact_id: proof.recomputed_hash,
        message: `equal=${proof.equal}`,
      });

      if (!proof.equal) {
        return {
          stateDelta: {
            [ADK_STATE.hashProof]: proof,
            ...rootCauseDelta({
              issue: "Hash verification mismatch",
              expected: proof.created_hash,
              actual: proof.recomputed_hash,
              evidence_ids: ["hash-proof"],
              required_correction:
                "Recompute the sandbox integrity hash from the exact confirmed immutable core",
              recheck_target: state.plan(ctx).plan_id,
            }),
          },
        };
      }

      return {
        stateDelta: { [ADK_STATE.hashProof]: proof },
      };
    },
  });

  const done = new OneShotStageAgent({
    name: "DoneStage",
    description: "Finalizes the OneShot run as PASSED or ROOT_CAUSE.",
    runAfterRootCause: true,
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      const rootCause = state.rootCause(ctx);
      if (rootCause) {
        const proof = ctx.session.state[ADK_STATE.hashProof] as
          | HashProof
          | undefined;
        effects.finishRoot(runId, rootCause, proof);
        return;
      }

      const proof = state.hashProof(ctx);
      if (!proof.equal) {
        throw new Error("Done reached without equal hash proof");
      }
      effects.finishPassed(runId, proof);
    },
  });

  return new SequentialAgent({
    name: "OneShotCanonicalWorkflow",
    description:
      "Runs Researcher, planning/refinement, Gap LoopAgent, Evaluation, parallel Triple Validation, confirmation, Builder execution, and sandbox integrity hash verification in canonical order.",
    subAgents: [
      researcher,
      planner,
      refactor,
      gapAnalysis,
      evaluation,
      tripleValidation,
      confirmation,
      createHash,
      builder,
      hashVerification,
      done,
    ],
  });
}
