import type {
  PipelineStage,
  StageProgress,
} from "./types.js";
import type { PipelineContext, saveArtifact } from "./context.js";
import {
  loadAudit,
  loadConfirmedPackage,
  loadEvaluation,
  loadGapAnalysis,
  loadHashProof,
  loadPlan,
  loadPrompt,
  loadProvider,
  loadResearchBundle,
  loadTripleValidation,
} from "./context.js";
import type { ProcessingEventBus } from "../runtime/event-bus.js";
import { ResearcherWorkflow } from "../agents/researcher/workflow.js";
import type { PlannerWorkflow } from "../agents/planner/workflow.js";
import type { RefactorWorkflow } from "../agents/refactor/workflow.js";
import type { GapAnalysisWorkflow } from "../agents/gap-analysis/workflow.js";
import type { EvaluationWorkflow } from "../agents/evaluation/workflow.js";
import type { BuilderWorkflow } from "../agents/builder/workflow.js";
import type { TripleValidationWorkflow } from "../workflow/triple-validation.js";
import type { ConfirmationWorkflow } from "../workflow/confirmation.js";
import type { HashWorkflow } from "../workflow/hash.js";
import { ProviderManager } from "../../app/web/cloud/provider-manager.js";
import type { CanonicalContractSkill } from "../skills/canonical-contract-skill.js";
import type {
  PythonReasoner,
  ReasoningRequest,
} from "../reasoning/python-client.js";
import type { Plan, ResearchBundle } from "../contracts/schema/types.js";

export interface StageServices {
  events: ProcessingEventBus;
  providerManager: ProviderManager;
  contracts: CanonicalContractSkill;
  planner: PlannerWorkflow;
  refactor: RefactorWorkflow;
  gapper: GapAnalysisWorkflow;
  evaluator: EvaluationWorkflow;
  triple: TripleValidationWorkflow;
  confirmation: ConfirmationWorkflow;
  hash: HashWorkflow;
  builder: BuilderWorkflow;
  saveArtifact: typeof saveArtifact;
  /**
   * Optional Python reasoning addon client. When present, Evaluation runs
   * Python as a canary second opinion without letting it fail the pipeline.
   */
  pythonReasoner?: PythonReasoner;
}

const CANONICAL_NAME: Record<
  PipelineStage,
  string
> = {
  researcher: "Researcher",
  planner: "Planner",
  refactor: "Refactor",
  "gap-analysis": "GapAnalysis",
  evaluation: "Evaluation",
  "triple-validation": "TripleValidation",
  confirmation: "Confirmed",
  hash: "CreateHash",
  build: "Builder",
};

export function emitStage(
  ctx: PipelineContext,
  services: StageServices,
  stage: PipelineStage,
  state: "RUNNING" | "COMPLETE",
  extra: Parameters<ProcessingEventBus["emit"]>[3] = {},
): void {
  services.events.emit(
    ctx.runId,
    CANONICAL_NAME[stage],
    state,
    {
      scope: "WORKFLOW",
      ...extra,
    },
  );
}

export async function reportProgress(
  progress: (value: StageProgress) => Promise<void> | void,
  stage: PipelineStage,
  percent: number,
  message: string,
): Promise<void> {
  await progress({ stage, percent, message });
}

/* ============================================================
   RESEARCHER
   ============================================================ */

export async function runResearcherStage(
  ctx: PipelineContext,
  services: StageServices,
  progress: (value: StageProgress) => Promise<void> | void,
): Promise<void> {
  await reportProgress(
    progress,
    "researcher",
    10,
    "Gathering repository context",
  );

  emitStage(ctx, services, "researcher", "RUNNING");

  const prompt = await loadPrompt(ctx);
  const captured = await loadProvider(ctx);
  const provider = await services.providerManager.resolveForRun(
    captured.id,
    captured,
  );
  const researcher = new ResearcherWorkflow(
    provider,
    services.contracts,
  );
  const bundle = await researcher.run(prompt, ctx.runId);

  await services.saveArtifact(
    ctx,
    "research_bundle",
    bundle,
  );
  await services.saveArtifact(ctx, "plan", bundle.plan);
  await services.saveArtifact(
    ctx,
    "schema_artifact",
    bundle.schema_artifact,
  );
  await services.saveArtifact(
    ctx,
    "fixture",
    bundle.fixture,
  );
  await services.saveArtifact(ctx, "goal", bundle.goal);
  await services.saveArtifact(
    ctx,
    "validation_definition",
    bundle.validation,
  );

  emitStage(ctx, services, "researcher", "COMPLETE", {
    result: "PASSED",
    artifact_id: bundle.researcher.researcher_id,
  });

  await reportProgress(
    progress,
    "researcher",
    100,
    "Research complete",
  );
}


/* ============================================================
   PLANNER
   ============================================================ */

export async function runPlannerStage(
  ctx: PipelineContext,
  services: StageServices,
  progress: (value: StageProgress) => Promise<void> | void,
): Promise<void> {
  await reportProgress(
    progress,
    "planner",
    10,
    "Reviewing Researcher evidence",
  );

  emitStage(ctx, services, "planner", "RUNNING");

  const bundle = await loadResearchBundle(ctx);
  const audit = await services.planner.run(
    bundle,
    ctx.runId,
  );

  await services.saveArtifact(ctx, "audit", audit);

  emitStage(ctx, services, "planner", "COMPLETE", {
    result: "PASSED",
    artifact_id: audit.audit_id,
  });

  await reportProgress(
    progress,
    "planner",
    100,
    "Planner audit passed",
  );
}

/* ============================================================
   REFACTOR
   ============================================================ */

export async function runRefactorStage(
  ctx: PipelineContext,
  services: StageServices,
  progress: (value: StageProgress) => Promise<void> | void,
): Promise<void> {
  await reportProgress(
    progress,
    "refactor",
    10,
    "Refining approved plan",
  );

  emitStage(ctx, services, "refactor", "RUNNING");

  const bundle = await loadResearchBundle(ctx);
  const audit = await loadAudit(ctx);
  const plan = await services.refactor.run(
    bundle,
    audit,
  );

  await services.saveArtifact(ctx, "plan", plan);

  emitStage(ctx, services, "refactor", "COMPLETE", {
    result: "PASSED",
    artifact_id: plan.plan_id,
  });

  await reportProgress(
    progress,
    "refactor",
    100,
    "Plan refactor complete",
  );
}

/* ============================================================
   GAP ANALYSIS
   ============================================================ */

export async function runGapAnalysisStage(
  ctx: PipelineContext,
  services: StageServices,
  progress: (value: StageProgress) => Promise<void> | void,
): Promise<void> {
  await reportProgress(
    progress,
    "gap-analysis",
    10,
    "Searching for missing requirements",
  );

  emitStage(ctx, services, "gap-analysis", "RUNNING");

  const bundle = await loadResearchBundle(ctx);
  const plan = await loadPlan(ctx);
  const { plan: updatedPlan, gap } =
    await services.gapper.run(bundle, plan);

  await services.saveArtifact(ctx, "plan", updatedPlan);
  await services.saveArtifact(
    ctx,
    "gap_analysis",
    gap,
  );

  emitStage(ctx, services, "gap-analysis", "COMPLETE", {
    result: gap.result,
    artifact_id: gap.plan_id,
  });

  await reportProgress(
    progress,
    "gap-analysis",
    100,
    gap.result === "PASSED"
      ? "No gaps detected"
      : `${gap.resolved_gaps.length} gap(s) analyzed`,
  );
}

/* ============================================================
   EVALUATION
   ============================================================ */

export async function runEvaluationStage(
  ctx: PipelineContext,
  services: StageServices,
  progress: (value: StageProgress) => Promise<void> | void,
): Promise<void> {
  await reportProgress(
    progress,
    "evaluation",
    10,
    "Evaluating final plan",
  );

  emitStage(ctx, services, "evaluation", "RUNNING");

  const bundle = await loadResearchBundle(ctx);
  const plan = await loadPlan(ctx);
  const evaluation = await services.evaluator.run(
    bundle,
    plan,
  );

  await services.saveArtifact(
    ctx,
    "evaluation",
    evaluation,
  );

  if (services.pythonReasoner) {
    await runPythonEvaluationCanary(
      ctx,
      services,
      bundle,
      plan,
    );
  }

  emitStage(ctx, services, "evaluation", "COMPLETE", {
    result: evaluation.result,
    artifact_id: evaluation.plan_id,
  });

  await reportProgress(
    progress,
    "evaluation",
    100,
    `Evaluation result: ${evaluation.result}`,
  );
}

async function runPythonEvaluationCanary(
  ctx: PipelineContext,
  services: StageServices,
  bundle: ResearchBundle,
  plan: Plan,
): Promise<void> {
  const reasoner = services.pythonReasoner;
  if (!reasoner) {
    return;
  }

  try {
    const request = buildReasoningRequest(
      ctx.runId,
      bundle,
      plan,
    );

    const response = await reasoner.reason(request);

    await services.saveArtifact(
      ctx,
      "python-evaluation-canary",
      response,
    );
  } catch (error) {
    await services.saveArtifact(
      ctx,
      "python-evaluation-canary",
      {
        error:
          error instanceof Error
            ? error.message
            : String(error),
        status: "CANARY_FAILED",
      },
    );
  }
}

export function buildReasoningRequest(
  runId: string,
  bundle: ResearchBundle,
  plan: Plan,
): ReasoningRequest {
  return {
    run_id: runId,
    task: "evaluation",
    goal: bundle.prompt.requested_outcome,
    constraints: plan.requirements.map((requirement) => requirement.statement),
    evidence: bundle.researcher.evidence.map((evidence) => ({
      source: evidence.source,
      content: evidence.statement,
      // The canonical evidence has no confidence score; do not invent certainty.
      confidence: 0,
    })),
    plan: {
      id: plan.plan_id,
      objective: bundle.prompt.requested_outcome,
      status: "evaluation",
      tasks: plan.steps.map((step) => ({
        id: step.step_id,
        title: step.responsibility,
        action: step.description,
        required: true,
      })),
    },
  };
}

/* ============================================================
   TRIPLE VALIDATION
   ============================================================ */

export async function runTripleValidationStage(
  ctx: PipelineContext,
  services: StageServices,
  progress: (value: StageProgress) => Promise<void> | void,
): Promise<void> {
  await reportProgress(
    progress,
    "triple-validation",
    10,
    "Starting schema validation",
  );

  emitStage(ctx, services, "triple-validation", "RUNNING");

  const bundle = await loadResearchBundle(ctx);
  const plan = await loadPlan(ctx);

  await reportProgress(
    progress,
    "triple-validation",
    35,
    "Starting fixture validation",
  );

  await reportProgress(
    progress,
    "triple-validation",
    65,
    "Starting goal validation",
  );

  const triple = await services.triple.run(
    bundle,
    plan,
  );

  await services.saveArtifact(
    ctx,
    "triple_validation",
    triple,
  );

  emitStage(
    ctx,
    services,
    "triple-validation",
    "COMPLETE",
    {
      result: triple.all_valid ? "PASSED" : "ROOT_CAUSE",
      artifact_id: triple.validation_id,
    },
  );

  await reportProgress(
    progress,
    "triple-validation",
    100,
    triple.all_valid
      ? "All validation passed"
      : "Validation failed",
  );
}

/* ============================================================
   CONFIRMATION
   ============================================================ */

export async function runConfirmationStage(
  ctx: PipelineContext,
  services: StageServices,
  progress: (value: StageProgress) => Promise<void> | void,
): Promise<void> {
  await reportProgress(
    progress,
    "confirmation",
    10,
    "Confirming validated package",
  );

  emitStage(ctx, services, "confirmation", "RUNNING");

  const bundle = await loadResearchBundle(ctx);
  const plan = await loadPlan(ctx);
  const audit = await loadAudit(ctx);
  const gap = await loadGapAnalysis(ctx);
  const evaluation = await loadEvaluation(ctx);
  const triple = await loadTripleValidation(ctx);

  const confirmed = await services.confirmation.run(
    bundle,
    plan,
    audit,
    gap,
    evaluation,
    triple,
  );

  await services.saveArtifact(
    ctx,
    "confirmed",
    confirmed,
  );

  emitStage(ctx, services, "confirmation", "COMPLETE", {
    result: "PASSED",
    artifact_id: confirmed.core.researcher.researcher_id,
  });

  await reportProgress(
    progress,
    "confirmation",
    100,
    "Package confirmed",
  );
}


/* ============================================================
   HASH
   ============================================================ */

export async function runHashStage(
  ctx: PipelineContext,
  services: StageServices,
  progress: (value: StageProgress) => Promise<void> | void,
): Promise<void> {
  await reportProgress(
    progress,
    "hash",
    10,
    "Creating canonical hash proof",
  );

  emitStage(ctx, services, "hash", "RUNNING");

  const confirmed = await loadConfirmedPackage(ctx);
  const proof = await services.hash.run(confirmed);

  await services.saveArtifact(
    ctx,
    "hash_proof",
    proof,
  );

  emitStage(ctx, services, "hash", "COMPLETE", {
    result: proof.equal ? "PASSED" : "ROOT_CAUSE",
    artifact_id: proof.created_hash,
  });

  await reportProgress(
    progress,
    "hash",
    100,
    proof.equal
      ? "Hash proof created"
      : "Hash mismatch",
  );
}

/* ============================================================
   BUILD / PROMOTE
   ============================================================ */

export async function runBuildStage(
  ctx: PipelineContext,
  services: StageServices,
  progress: (value: StageProgress) => Promise<void> | void,
): Promise<void> {
  await reportProgress(
    progress,
    "build",
    10,
    "Preparing verified build",
  );

  emitStage(ctx, services, "build", "RUNNING");

  const confirmed = await loadConfirmedPackage(ctx);
  const proof = await loadHashProof(ctx);
  const result = await services.builder.run(
    confirmed,
    proof.created_hash,
  );

  await services.saveArtifact(
    ctx,
    "build_result",
    result,
  );

  const passed = result.result === "PASSED";

  emitStage(ctx, services, "build", "COMPLETE", {
    result: passed ? "PASSED" : "ROOT_CAUSE",
    artifact_id: proof.created_hash,
  });

  await reportProgress(
    progress,
    "build",
    100,
    passed
      ? "Build promoted successfully"
      : "Build failed",
  );
}
