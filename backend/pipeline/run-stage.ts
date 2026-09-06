import type { Job } from "bullmq";
import type { Redis } from "ioredis";
import { PipelineFaultController } from "./fault-controller.js";
import { PipelineIdempotency } from "./idempotency.js";
import { PipelineHistory } from "./history.js";

export interface RunStageOptions<T> {
  redis: Redis;
  runId: string;
  stage: string;
  job: Job;
  execute: () => Promise<T>;
}

export interface StageRunResult<T> {
  skipped: boolean;
  value?: T;
}

export async function runStage<T>(
  options: RunStageOptions<T>,
): Promise<StageRunResult<T>> {
  const { redis, runId, stage, job, execute } = options;

  const history = new PipelineHistory(redis);
  const idempotency = new PipelineIdempotency(redis);
  const faults = new PipelineFaultController(redis);

  if (await idempotency.isCompleted(runId, stage)) {
    await history.append({
      runId,
      stage,
      type: "completed",
      message: "Stage already completed; duplicate execution skipped.",
      jobId: String(job.id),
      attempt: job.attemptsMade + 1,
    });

    return { skipped: true };
  }

  const acquired = await idempotency.acquire(runId, stage);

  if (!acquired) {
    /*
     * Lost a race with another worker. The winner may have just completed the
     * stage, so re-check the durable marker before treating this as an error.
     */
    if (await idempotency.isCompleted(runId, stage)) {
      await history.append({
        runId,
        stage,
        type: "completed",
        message:
          "Stage completed by another worker; duplicate execution skipped.",
        jobId: String(job.id),
        attempt: job.attemptsMade + 1,
      });
      return { skipped: true };
    }

    throw new Error(
      `Stage ${stage} already has an active execution lock for run ${runId}`,
    );
  }

  try {
    await history.append({
      runId,
      stage,
      type: "started",
      jobId: String(job.id),
      attempt: job.attemptsMade + 1,
    });

    await faults.apply(runId, stage as never);

    const value = await execute();

    /*
     * IMPORTANT:
     *
     * Only mark completed AFTER the actual stage output/artifacts
     * have been committed.
     */
    await idempotency.markCompleted(runId, stage);

    await history.append({
      runId,
      stage,
      type: "completed",
      jobId: String(job.id),
      attempt: job.attemptsMade + 1,
    });

    return { skipped: false, value };
  } catch (error) {
    await history.append({
      runId,
      stage,
      type: "failed",
      message:
        error instanceof Error ? error.message : String(error),
      jobId: String(job.id),
      attempt: job.attemptsMade + 1,
    });

    throw error;
  } finally {
    await idempotency.release(runId, stage);
  }
}
