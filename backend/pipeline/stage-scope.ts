import type {
  PipelineStage,
} from "./stage-outcome.js";

const RESEARCHER: PipelineStage = "researcher";

const ITERATIVE_STAGES =
  new Set<PipelineStage>([
    "refactor",
    "gap-analysis",
    "evaluation",
    "triple-validation",
  ]);

export function isIterativeStage(
  stage: PipelineStage,
): boolean {
  return ITERATIVE_STAGES.has(
    stage,
  );
}

/** Redis key tracking the current research revision for a run. */
export function researchRevisionKey(runId: string): string {
  return `oneshot:run:${runId}:researcher-revision`;
}

/**
 * Read the current research revision for a run.
 * Revision 0 is the initial research pass; each Research Again bumps it by 1.
 */
export async function getCurrentResearchRevision(
  redis: { get(key: string): Promise<string | null> },
  runId: string,
): Promise<number> {
  const raw = await redis.get(researchRevisionKey(runId));
  const n = raw ? Number(raw) : 0;
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/**
 * Atomically increment the research revision for a run and return the new value.
 */
export async function incrementResearchRevision(
  redis: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<unknown>;
  },
  runId: string,
): Promise<number> {
  const current = await getCurrentResearchRevision(redis, runId);
  const next = current + 1;
  await redis.set(researchRevisionKey(runId), String(next));
  return next;
}

export function stageIteration(
  stage: PipelineStage,
  iteration: number,
): number {
  /*
   * Researcher uses the job's iteration as a run-level revision counter.
   * This is semantically distinct from the refinement iteration used by
   * iterative stages (refactor/gap-analysis/evaluation/triple-validation).
   */
  if (stage === RESEARCHER) {
    return iteration;
  }
  return isIterativeStage(stage)
    ? iteration
    : 0;
}