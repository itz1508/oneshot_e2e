import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import type {
  PipelineStage,
  StageHandoff,
  StageJobData,
  StageProgress,
} from "./types.js";
import {
  PIPELINE_QUEUE,
  getSharedRedis,
  pipelineQueue,
  stageJobId,
} from "./queue.js";
import type { StageServices } from "./processors.js";
import {
  runResearcherStage,
  runPlannerStage,
  runRefactorStage,
  runGapAnalysisStage,
  runEvaluationStage,
  runTripleValidationStage,
  runConfirmationStage,
  runHashStage,
  runBuildStage,
} from "./processors.js";
import { PipelineContext } from "./context.js";
import type { ArtifactStore } from "../runtime/artifact-store.js";
import type { RunRepository } from "../runtime/run-repository.js";
import { runStage } from "./run-stage.js";
import { PipelineIdempotency } from "./idempotency.js";
import type { PipelineHistory } from "./history.js";

export interface PipelineWorkerInput {
  runs: RunRepository;
  store: ArtifactStore;
  services: StageServices;
  redis: Redis;
  history?: PipelineHistory;
  concurrency?: number;
}

const HANDOFFS: Record<
  PipelineStage,
  StageHandoff | null
> = {
  researcher: { next: "planner", gate: "await-human" },
  planner: { next: "refactor", gate: "auto" },
  refactor: { next: "gap-analysis", gate: "auto" },
  "gap-analysis": { next: "evaluation", gate: "auto" },
  evaluation: {
    next: "triple-validation",
    gate: "auto",
  },
  "triple-validation": {
    next: "confirmation",
    gate: "auto",
  },
  confirmation: { next: "hash", gate: "auto" },
  hash: { next: "build", gate: "auto" },
  build: null,
};

type PipelineJob = Job<StageJobData, unknown, PipelineStage>;

export function createPipelineWorker(
  input: PipelineWorkerInput,
): Worker<StageJobData, unknown, PipelineStage> {
  const {
    runs,
    store,
    services,
    redis,
    history,
    concurrency = 1,
  } = input;

  const idempotency = new PipelineIdempotency(redis);

  const worker = new Worker<
    StageJobData,
    unknown,
    PipelineStage
  >(
    PIPELINE_QUEUE,

    async (job: PipelineJob) => {
      const stage = job.name;
      const { runId } = job.data;

      const ctx: PipelineContext = {
        runId,
        runs,
        store,
      };

      const progress = async (
        value: StageProgress,
      ): Promise<void> => {
        await job.updateProgress(value);
      };

      const execute = async () => {
        switch (stage) {
          case "researcher":
            await runResearcherStage(ctx, services, progress);
            return;
          case "planner":
            await runPlannerStage(ctx, services, progress);
            return;
          case "refactor":
            await runRefactorStage(ctx, services, progress);
            return;
          case "gap-analysis":
            await runGapAnalysisStage(ctx, services, progress);
            return;
          case "evaluation":
            await runEvaluationStage(ctx, services, progress);
            return;
          case "triple-validation":
            await runTripleValidationStage(
              ctx,
              services,
              progress,
            );
            return;
          case "confirmation":
            await runConfirmationStage(ctx, services, progress);
            return;
          case "hash":
            await runHashStage(ctx, services, progress);
            return;
          case "build":
            await runBuildStage(ctx, services, progress);
            return;
          default:
            throw new Error(
              `Unknown pipeline stage: ${stage}`,
            );
        }
      };

      const { skipped } = await runStage({
        redis,
        runId,
        stage,
        job,
        execute,
      });

      const handoff = HANDOFFS[stage];
      if (!handoff) {
        return { runId, stage };
      }

      if (handoff.gate === "auto") {
        await enqueueNext(
          handoff.next,
          runId,
          idempotency,
          history,
        );
      } else if (
        handoff.gate === "await-human" &&
        handoff.next === "planner"
      ) {
        await history?.append({
          runId,
          stage: "await-human",
          type: "waiting",
          message: `Waiting for confirm-plan before ${handoff.next}`,
        });
      }

      return { runId, stage, skipped };
    },

    {
      connection: getSharedRedis(),
      concurrency,
    },
  );

  worker.on("completed", (job) => {
    console.log(
      `[OneShot] ${job.name} completed: ${job.id}`,
    );
  });

  worker.on("failed", (job, error) => {
    console.error(
      `[OneShot] ${job?.name ?? "unknown"} failed:`,
      error,
    );
  });

  worker.on("error", (error) => {
    console.error(
      "[OneShot] BullMQ worker error:",
      error,
    );
  });

  return worker;
}

async function enqueueNext(
  stage: PipelineStage,
  runId: string,
  idempotency: PipelineIdempotency,
  history?: PipelineHistory,
): Promise<void> {
  if (await idempotency.isCompleted(runId, stage)) {
    console.log(
      `[OneShot] Skipping enqueue for ${stage}; already completed for ${runId}`,
    );
    return;
  }

  await pipelineQueue.add(
    stage,
    { runId },
    {
      jobId: stageJobId(runId, stage),
    },
  );
  await history?.append({
    runId,
    stage,
    type: "queued",
    jobId: stageJobId(runId, stage),
  });
}
