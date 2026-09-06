import { Worker, type Job } from "bullmq";
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
import type { PipelineHistory } from "./history.js";

export interface PipelineWorkerInput {
  runs: RunRepository;
  store: ArtifactStore;
  services: StageServices;
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
  const { runs, store, services, history, concurrency = 1 } = input;

  const worker = new Worker<
    StageJobData,
    unknown,
    PipelineStage
  >(
    PIPELINE_QUEUE,

    async (job: PipelineJob) => {
      const stage = job.name;
      const { runId } = job.data;
      const jobId = String(job.id ?? stageJobId(runId, stage));
      const attempt = job.attemptsMade + 1;

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

      await history?.append({
        runId,
        stage,
        type: attempt > 1 ? "retrying" : "started",
        jobId,
        attempt,
      });

      try {
        switch (stage) {
          case "researcher":
            await runResearcherStage(ctx, services, progress);
            break;
          case "planner":
            await runPlannerStage(ctx, services, progress);
            break;
          case "refactor":
            await runRefactorStage(ctx, services, progress);
            break;
          case "gap-analysis":
            await runGapAnalysisStage(
              ctx,
              services,
              progress,
            );
            break;
          case "evaluation":
            await runEvaluationStage(
              ctx,
              services,
              progress,
            );
            break;
          case "triple-validation":
            await runTripleValidationStage(
              ctx,
              services,
              progress,
            );
            break;
          case "confirmation":
            await runConfirmationStage(
              ctx,
              services,
              progress,
            );
            break;
          case "hash":
            await runHashStage(ctx, services, progress);
            break;
          case "build":
            await runBuildStage(ctx, services, progress);
            break;
          default:
            throw new Error(
              `Unknown pipeline stage: ${stage}`,
            );
        }
      } catch (error) {
        await history?.append({
          runId,
          stage,
          type: "failed",
          jobId,
          attempt,
          message:
            error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      await history?.append({
        runId,
        stage,
        type: "completed",
        jobId,
        attempt,
      });

      const handoff = HANDOFFS[stage];
      if (handoff) {
        if (handoff.gate === "auto") {
          await enqueueNext(handoff.next, runId, history);
        } else if (handoff.gate === "await-human" && handoff.next === "planner") {
          await history?.append({
            runId,
            stage: "await-human",
            type: "waiting",
            message: `Waiting for confirm-plan before ${handoff.next}`,
          });
        }
      }

      return { runId, stage };
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
  history?: PipelineHistory,
): Promise<void> {
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
