import { Queue } from "bullmq";
import {
  getProducerRedis,
  getSharedRedis,
} from "../runtime/redis-connection.js";
import type {
  PipelineStage,
  StageJobData,
} from "./types.js";
import { PipelineHistory } from "./history.js";

export const PIPELINE_QUEUE = "oneshot-pipeline";

/**
 * Singleton BullMQ queue for the per-stage OneShot pipeline. Jobs carry only
 * `{ runId }`; all durable state lives in `RunRepository` + `ArtifactStore`.
 */
export const pipelineQueue = new Queue<
  StageJobData,
  unknown,
  PipelineStage
>(PIPELINE_QUEUE, {
  connection: getProducerRedis(),

  defaultJobOptions: {
    attempts: 3,

    backoff: {
      type: "exponential",
      delay: 2000,
    },

    removeOnComplete: {
      age: 60 * 60 * 24,
      count: 2000,
    },

    removeOnFail: {
      age: 60 * 60 * 24 * 7,
      count: 5000,
    },
  },
});

export function stageJobId(
  runId: string,
  stage: PipelineStage,
): string {
  return `${runId}-${stage}`;
}

/**
 * Enqueue the named stage for a run. Returns the BullMQ job id.
 */
export async function enqueueStage(
  runId: string,
  stage: PipelineStage,
  history?: PipelineHistory,
): Promise<string> {
  const job = await pipelineQueue.add(
    stage,
    { runId },
    { jobId: stageJobId(runId, stage) },
  );
  const jobId = job.id ?? stageJobId(runId, stage);
  await history?.append({
    runId,
    stage,
    type: "queued",
    jobId,
  });
  return jobId;
}

export async function closePipelineQueue(): Promise<void> {
  await pipelineQueue.close();
}

export { getSharedRedis, getProducerRedis };

