import type { PipelineStage, StageProgress } from "./types.js";
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
import { ProviderManager } from "../provider/manager.js";
import type { CanonicalContractSkill } from "../skills/canonical-contract-skill.js";
import type {
  PythonReasoner,
  ReasoningRequest,
} from "../reasoning/python-client.js";
import type { Plan, ResearchBundle } from "../contracts/schema/types.js";
import type { SandboxExecutionResult } from "../sandbox/types.js";
import { BuildReviewService } from "../runtime/build-review.js";

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

const CANONICAL_NAME: Record<PipelineStage, string> = {
  researcher: "Researcher",
  planner: "Planner",
  refactor: "Refactor",
  "gap-analysis": "GapAnalysis",
  evaluation: "Evaluation",
  "triple-validation": "TripleValidation",
  confirmation: "Confirmed",
  hash: "CreateHash",
  build: "Builder",
  finalize: "Finalize",
};

export function emitStage(
  ctx: PipelineContext,
  services: StageServices,
  stage: PipelineStage,
  state: "Running" | "Completed",
  extra: Parameters<ProcessingEventBus["emit"]>[3] = {},
): void {
  services.events.emit(ctx.runId, CANONICAL_NAME[stage], state, {
    scope: "WORKFLOW",
    ...extra,
  });
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

  emitStage(ctx, services, "researcher", "Running");

  const prompt = await loadPrompt(ctx);
  const captured = await loadProvider(ctx);
  const provider = await services.providerManager.resolveForRun(
    captured.id,
    captured,
  );
  if (provider) {
    const readiness = await provider.ready(ctx.runId);
    if (!readiness.ready) {
      throw new Error(readiness.detail || "Model provider is not ready");
    }
  }
  const researcher = new ResearcherWorkflow(
    provider,
    services.contracts,
    services.providerManager.projectRoot,
  );
  const bundle = await researcher.run(prompt, ctx.runId);

  const researchRevision = ctx.stageIteration ?? 0;

  // Preserve each research revision as history. The unversioned research_bundle
  // always points to the latest result so it becomes the current review baseline.
  await services.saveArtifact(
    ctx,
    `research_bundle.v${researchRevision}`,
    bundle,
  );
  await services.saveArtifact(ctx, "research_bundle", bundle);
  await services.saveArtifact(ctx, "plan", bundle.plan);
  await services.saveArtifact(ctx, "schema_artifact", bundle.schema_artifact);
  await services.saveArtifact(ctx, "fixture", bundle.fixture);
  await services.saveArtifact(ctx, "goal", bundle.goal);
  await services.saveArtifact(ctx, "validation_definition", bundle.validation);

  emitStage(ctx, services, "researcher", "Completed", {
    test_result: "Passed",
    artifact_id: bundle.researcher.researcher_id,
  });

  await reportProgress(progress, "researcher", 100, "Research complete");
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

  emitStage(ctx, services, "planner", "Running");

  const bundle = await loadResearchBundle(ctx);
  const audit = await services.planner.run(bundle, ctx.runId);

  await services.saveArtifact(ctx, "audit", audit);

  emitStage(ctx, services, "planner", "Completed", {
    test_result: "Passed",
    artifact_id: audit.audit_id,
  });

  await reportProgress(progress, "planner", 100, "Planner audit passed");
}

/* ============================================================
   REFACTOR
   ============================================================ */

export async function runRefactorStage(
  ctx: PipelineContext,
  services: StageServices,
  progress: (value: StageProgress) => Promise<void> | void,
): Promise<void> {
  await reportProgress(progress, "refactor", 10, "Refining approved plan");

  emitStage(ctx, services, "refactor", "Running");

  const bundle = await loadResearchBundle(ctx);
  const audit = await loadAudit(ctx);
  const plan = await services.refactor.run(bundle, audit);

  await services.saveArtifact(ctx, "plan", plan);

  emitStage(ctx, services, "refactor", "Completed", {
    test_result: "Passed",
    artifact_id: plan.plan_id,
  });

  await reportProgress(progress, "refactor", 100, "Plan refactor complete");
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

  emitStage(ctx, services, "gap-analysis", "Running");

  const bundle = await loadResearchBundle(ctx);
  const plan = await loadPlan(ctx);
  const { plan: updatedPlan, gap } = await services.gapper.run(bundle, plan);

  await services.saveArtifact(ctx, "plan", updatedPlan);
  await services.saveArtifact(ctx, "gap_analysis", gap);

  emitStage(ctx, services, "gap-analysis", "Completed", {
    test_result: gap.result,
    ...(gap.result === "Failed"
      ? { issue_type: gap.issue_type, issue: gap.root_cause }
      : {}),
    artifact_id: gap.plan_id,
  });

  await reportProgress(
    progress,
    "gap-analysis",
    100,
    gap.result === "Passed"
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
  await reportProgress(progress, "evaluation", 10, "Evaluating final plan");

  emitStage(ctx, services, "evaluation", "Running");

  const bundle = await loadResearchBundle(ctx);
  const plan = await loadPlan(ctx);
  const evaluation = await services.evaluator.run(bundle, plan);

  await services.saveArtifact(ctx, "evaluation", evaluation);

  if (services.pythonReasoner) {
    await runPythonEvaluationCanary(ctx, services, bundle, plan);
  }

  emitStage(ctx, services, "evaluation", "Completed", {
    test_result: evaluation.result,
    ...(evaluation.result === "Failed"
      ? { issue_type: evaluation.issue_type, issue: evaluation.root_cause }
      : {}),
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
    const request = buildReasoningRequest(ctx.runId, bundle, plan);

    const response = await reasoner.reason(request);

    await services.saveArtifact(ctx, "python-evaluation-canary", response);
  } catch (error) {
    await services.saveArtifact(ctx, "python-evaluation-canary", {
      error: error instanceof Error ? error.message : String(error),
      status: "CANARY_FAILED",
    });
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

  emitStage(ctx, services, "triple-validation", "Running");

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

  const triple = await services.triple.run(bundle, plan);

  await services.saveArtifact(ctx, "triple_validation", triple);

  emitStage(ctx, services, "triple-validation", "Completed", {
    test_result: triple.all_valid ? "Passed" : "Failed",
    ...(triple.all_valid ? {} : { issue_type: "Missing" as const }),
    artifact_id: triple.validation_id,
  });

  await reportProgress(
    progress,
    "triple-validation",
    100,
    triple.all_valid ? "All validation passed" : "Validation failed",
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

  emitStage(ctx, services, "confirmation", "Running");

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

  await services.saveArtifact(ctx, "confirmed", confirmed);

  emitStage(ctx, services, "confirmation", "Completed", {
    test_result: "Passed",
    artifact_id: confirmed.core.researcher.researcher_id,
  });

  await reportProgress(progress, "confirmation", 100, "Package confirmed");
}

/* ============================================================
   HASH
   ============================================================ */

export async function runHashStage(
  ctx: PipelineContext,
  services: StageServices,
  progress: (value: StageProgress) => Promise<void> | void,
): Promise<void> {
  await reportProgress(progress, "hash", 10, "Creating canonical hash proof");

  emitStage(ctx, services, "hash", "Running");

  const confirmed = await loadConfirmedPackage(ctx);
  const proof = await services.hash.run(confirmed);
  if (proof.equal)
    await new BuildReviewService(ctx.store).open(
      ctx.runId,
      confirmed,
      proof.created_hash,
    );

  await services.saveArtifact(ctx, "hash_proof", proof);

  emitStage(ctx, services, "hash", "Completed", {
    test_result: proof.equal ? "Passed" : "Failed",
    ...(proof.equal ? {} : { issue_type: "Root Cause" as const }),
    artifact_id: proof.created_hash,
  });

  await reportProgress(
    progress,
    "hash",
    100,
    proof.equal ? "Hash proof created" : "Hash mismatch",
  );
}

/* ============================================================
   FILE MUTATION LEDGER
   ============================================================ */

interface FileMutationRecord {
  path: string;
  action: "created" | "modified" | "deleted";
  bytes: number;
  sha256?: string;
  previous_bytes?: number;
  previous_sha256?: string;
}

function deriveFileMutations(
  runId: string,
  result: SandboxExecutionResult,
):
  | {
      run_id: string;
      execution_id: string;
      created_at: string;
      records: FileMutationRecord[];
    }
  | undefined {
  const evidence = result.evidence;
  if (!evidence) return undefined;
  const records = evidence.file_changes as FileMutationRecord[];
  return {
    run_id: runId,
    execution_id: result.execution_id ?? evidence.execution_id ?? "unknown",
    created_at: evidence.completed_at ?? new Date().toISOString(),
    records,
  };
}

/* ============================================================
   BUILD / PROMOTE
   ============================================================ */

export async function runBuildStage(
  ctx: PipelineContext,
  services: StageServices,
  progress: (value: StageProgress) => Promise<void> | void,
): Promise<void> {
  await reportProgress(progress, "build", 10, "Preparing verified build");

  emitStage(ctx, services, "build", "Running");

  const confirmed = await loadConfirmedPackage(ctx);
  const proof = await loadHashProof(ctx);
  await new BuildReviewService(ctx.store).requireApproved(
    ctx.runId,
    confirmed,
    proof.created_hash,
  );
  if ((await services.hash.create(confirmed)) !== proof.created_hash)
    throw new Error("Confirmed package no longer matches the authorized hash");
  const result = await services.builder.run(confirmed, proof.created_hash);

  await services.saveArtifact(ctx, "build_result", result);

  const mutations = deriveFileMutations(ctx.runId, result);
  if (mutations) {
    await services.saveArtifact(ctx, "file-mutations", mutations);
  }

  const passed = result.result === "Passed";

  emitStage(ctx, services, "build", "Completed", {
    test_result: passed ? "Passed" : "Failed",
    ...(passed
      ? {}
      : {
          issue_type: "Root Cause" as const,
          issue: "root_cause" in result ? result.root_cause : undefined,
        }),
    artifact_id: proof.created_hash,
  });

  await reportProgress(
    progress,
    "build",
    100,
    passed ? "Build promoted successfully" : "Build failed",
  );
}

/* ============================================================
   FINALIZE
   ============================================================ */

/**
 * Terminal stage. It carries no agent work: the semantic content (test
 * result + issue) was checkpointed as a finalization intent before this
 * stage was queued, and the terminal side effects run in the transition
 * layer (services.finish) when the finalize stage's `done` transition
 * commits.
 */
export async function runFinalizeStage(
  ctx: PipelineContext,
  services: StageServices,
  progress: (value: StageProgress) => Promise<void> | void,
): Promise<void> {
  await reportProgress(progress, "finalize", 10, "Finalizing workflow");

  emitStage(ctx, services, "finalize", "Running");

  await reportProgress(progress, "finalize", 100, "Workflow finalized");
}
