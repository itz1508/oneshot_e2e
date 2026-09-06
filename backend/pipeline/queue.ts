import { Queue } from "bullmq";
import {
  getProducerRedis,
  getSharedRedis,
} from "../runtime/redis-connection.js";
import type {
  PipelineStage,
  StageJobData,
} from "./types.js";

export const PIPELINE_QUEUE = "oneshot-pipeline";

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

export { getSharedRedis, getProducerRedis };

