import type {
  Audit,
  ConfirmedPackage,
  Evaluation,
  GapAnalysis,
  HashProof,
  Plan,
  Prompt,
  ResearchBundle,
  RunSnapshot,
  TripleValidation,
} from "../contracts/schema/types.js";
import type { ArtifactStore } from "../runtime/artifact-store.js";
import type { RunRepository } from "../runtime/run-repository.js";

export interface CapturedProvider {
  id: string;
  model: string;
  configRevision: number;
  settings?: Record<string, unknown>;
}

export interface PipelineContext {
  runId: string;
  runs: RunRepository;
  store: ArtifactStore;
  /** Iteration passed to the current stage job. For Researcher this is the research revision. */
  stageIteration?: number;
}

export async function loadPrompt(ctx: PipelineContext): Promise<Prompt> {
  const snapshot = ctx.runs.require(ctx.runId);
  const promptId = Object.keys(snapshot.artifacts).find((name) =>
    name.startsWith("prompt"),
  );

  if (!promptId) {
    throw new Error(`No prompt artifact found for run ${ctx.runId}`);
  }

  return ctx.store.load<Prompt>(ctx.runId, promptId);
}

export async function loadProvider(
  ctx: PipelineContext,
): Promise<CapturedProvider> {
  return ctx.store.load<CapturedProvider>(ctx.runId, "provider");
}

export async function loadResearchBundle(
  ctx: PipelineContext,
): Promise<ResearchBundle> {
  const snapshot = ctx.runs.require(ctx.runId);
  if ("research.reviewed" in snapshot.artifacts) {
    return ctx.store.load<ResearchBundle>(ctx.runId, "research.reviewed");
  }
  return ctx.store.load<ResearchBundle>(ctx.runId, "research_bundle");
}

export async function loadPlan(ctx: PipelineContext): Promise<Plan> {
  const snapshot = ctx.runs.require(ctx.runId);
  if ("plan.reviewed" in snapshot.artifacts) {
    return ctx.store.load<Plan>(ctx.runId, "plan.reviewed");
  }
  return ctx.store.load<Plan>(ctx.runId, "plan");
}

export async function loadAudit(ctx: PipelineContext): Promise<Audit> {
  return ctx.store.load<Audit>(ctx.runId, "audit");
}

export async function loadGapAnalysis(
  ctx: PipelineContext,
): Promise<GapAnalysis> {
  return ctx.store.load<GapAnalysis>(ctx.runId, "gap_analysis");
}

export async function loadEvaluation(
  ctx: PipelineContext,
): Promise<Evaluation> {
  return ctx.store.load<Evaluation>(ctx.runId, "evaluation");
}

export async function loadTripleValidation(
  ctx: PipelineContext,
): Promise<TripleValidation> {
  return ctx.store.load<TripleValidation>(ctx.runId, "triple_validation");
}

export async function loadConfirmedPackage(
  ctx: PipelineContext,
): Promise<ConfirmedPackage> {
  return ctx.store.load<ConfirmedPackage>(ctx.runId, "confirmed");
}

export async function loadHashProof(ctx: PipelineContext): Promise<HashProof> {
  return ctx.store.load<HashProof>(ctx.runId, "hash_proof");
}

export async function saveArtifact<T>(
  ctx: PipelineContext,
  name: string,
  value: T,
): Promise<string> {
  const path = await ctx.store.save(ctx.runId, name, value);
  ctx.runs.artifact(ctx.runId, name, path);
  return path;
}

export function requireSnapshot(ctx: PipelineContext): RunSnapshot {
  return ctx.runs.require(ctx.runId);
}
