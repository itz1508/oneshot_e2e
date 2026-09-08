import type { Redis } from "ioredis";
import {
  pipelineQueue,
  stageJobId,
} from "./queue.js";
import type {
  ConfirmPlanInput,
  ConfirmPlanResult,
} from "./types.js";
import { PipelineIdempotency } from "./idempotency.js";
import { loadResearchBundle, saveArtifact } from "./context.js";
import {
  applyPlanReviewEdits,
  validatePlanReviewEdits,
  type PlanReview,
} from "../runtime/plan-review.js";
import {
  getCurrentResearchRevision,
} from "./stage-scope.js";

export async function confirmPlan({
  runId,
  redis,
  history,
  edits,
  store,
  runs,
}: ConfirmPlanInput & { redis: Redis }): Promise<ConfirmPlanResult> {
  const idempotency = new PipelineIdempotency(redis);

  /*
   * The human gate only opens after the current research revision has
   * completed. We use the durable stage marker rather than the BullMQ job
   * record because completed jobs may be removed from BullMQ.
   */
  const researchRevision = await getCurrentResearchRevision(redis, runId);
  if (!(await idempotency.isCompleted(runId, "researcher", researchRevision))) {
    throw new Error(
      `Researcher revision ${researchRevision} has not completed for run ${runId}; plan cannot be confirmed yet`,
    );
  }

  if (edits) {
    if (!store || !runs) {
      throw new Error(
        "confirmPlan requires store and runs when research edits are supplied",
      );
    }
    const ctx = { runId, runs, store };
    const research = await loadResearchBundle(ctx);
    const syntheticReview: PlanReview = {
      run_id: runId,
      revision: 1,
      status: "pending",
      created_at: new Date().toISOString(),
      research,
      edits: {
        objective: research.goal.objective,
        requirements: research.plan.requirements.map(r => ({ id: r.requirement_id, statement: r.statement })),
        steps: research.plan.steps.map(s => ({ id: s.step_id, description: s.description })),
        notes: [],
      },
    };
    syntheticReview.edits = validatePlanReviewEdits(edits, syntheticReview);
    const reviewed = applyPlanReviewEdits(syntheticReview);
    await saveArtifact(ctx, "research.reviewed", reviewed);
    await saveArtifact(ctx, "plan.reviewed", reviewed.plan);
  }

  const confirmationKey = `oneshot:run:${runId}:plan-confirmed`;

  /*
   * SET NX gives us an atomic gate.
   *
   * Only ONE HTTP request wins. This is more durable than checking the
   * BullMQ job list: completed jobs can be removed, allowing a deterministic
   * jobId to be reused.
   */
  const result = await redis.set(
    confirmationKey,
    JSON.stringify({
      runId,
      confirmedAt: new Date().toISOString(),
      confirmedBy: "user",
    }),
    "EX",
    60 * 60 * 24 * 30,
    "NX",
  );

  if (result !== "OK") {
    await history?.append({
      runId,
      stage: "await-human",
      type: "confirmed",
      message: `Plan already confirmed for run ${runId}; planner already queued`,
    });
    return {
      status: "already_confirmed",
      plannerQueued: false,
    };
  }

  try {
    const plannerJobId = stageJobId(runId, "planner");
    await pipelineQueue.add(
      "planner",
      // Planner is a run-level stage; it always executes at iteration 0.
      { version: 2, runId, stage: "planner", iteration: 0 },
      {
        jobId: plannerJobId,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
    );
  } catch (error) {
    /*
     * Planner was not queued, so remove confirmation and allow another
     * request to try again.
     */
    await redis.del(confirmationKey);
    throw error;
  }

  await history?.append({
    runId,
    stage: "await-human",
    type: "confirmed",
    message: `Enqueued planner job ${stageJobId(runId, "planner")} for run ${runId}`,
  });

  return {
    status: "confirmed",
    plannerQueued: true,
  };
}
