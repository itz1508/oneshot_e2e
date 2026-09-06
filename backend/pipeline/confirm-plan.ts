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

export async function confirmPlan({
  runId,
  redis,
  history,
}: ConfirmPlanInput & { redis: Redis }): Promise<ConfirmPlanResult> {
  const idempotency = new PipelineIdempotency(redis);

  /*
   * The human gate only opens after the researcher stage has completed.
   * We use the durable stage marker rather than the BullMQ job record
   * because completed jobs may be removed from BullMQ.
   */
  if (!(await idempotency.isCompleted(runId, "researcher"))) {
    throw new Error(
      `Researcher stage has not completed for run ${runId}; plan cannot be confirmed yet`,
    );
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
