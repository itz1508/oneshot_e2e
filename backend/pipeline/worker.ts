import { randomUUID } from "node:crypto";
import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import type {
  StageJobData,
  StageProgress,
} from "./types.js";
import {
  PIPELINE_QUEUE,
  getSharedRedis,
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
  runFinalizeStage,
} from "./processors.js";
import {
  PipelineContext,
  loadHashProof,
  loadTripleValidation,
} from "./context.js";
import type { ArtifactStore } from "../runtime/artifact-store.js";
import type { RunRepository } from "../runtime/run-repository.js";
import {
  advance,
  refine,
  terminal,
} from "./stage-outcome.js";
import type {
  PipelineIssue,
  PipelineStage,
  StageOutcome,
} from "./stage-outcome.js";
import { stageIteration } from "./stage-scope.js";
import type { StageIdentity } from "./checkpoints.js";
import { applyTransition } from "./apply-transition.js";
import type { TransitionServices } from "./apply-transition.js";
import { resolveTransition } from "../workflow/canonical-transition.js";
import { createTransitionServices } from "./transition-services.js";
import { runStage } from "./run-stage.js";
import { PipelineIdempotency } from "./idempotency.js";
import { PipelineFaultController } from "./fault-controller.js";
import type { PipelineHistory } from "./history.js";

export interface PipelineWorkerInput {
  runs: RunRepository;
  store: ArtifactStore;
  services: StageServices;
  redis: Redis;
  history?: PipelineHistory;
  concurrency?: number;
}

type PipelineJob = Job<
  StageJobData,
  unknown,
  PipelineStage
>;

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

  const idempotency =
    new PipelineIdempotency(redis);
  const faultController =
    new PipelineFaultController(redis);

  const {
    checkpoints,
    services: transitionServices,
  } = createTransitionServices({
    runs,
    store,
    events: services.events,
    redis,
    history,
  });

  const workerId = randomUUID();
  const heartbeatKey = `oneshot:worker:${workerId}:heartbeat`;
  const heartbeatInterval = setInterval(async () => {
    try {
      await redis.set(
        heartbeatKey,
        new Date().toISOString(),
        "EX",
        15,
      );
    } catch (error) {
      console.error(
        "[OneShot] worker heartbeat failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }, 5_000);

  const worker = new Worker<
    StageJobData,
    unknown,
    PipelineStage
  >(
    PIPELINE_QUEUE,

    async (job: PipelineJob) => {
      const stage = job.name;
      const { runId } = job.data;
      if (job.data.version !== 2 || !runId || job.data.stage !== stage ||
          !Number.isInteger(job.data.iteration) || job.data.iteration < 0) {
        throw new Error("Invalid version-2 pipeline job payload");
      }
      const requestedIteration = job.data.iteration;

      const ctx: PipelineContext = {
        runId,
        runs,
        store,
      };

      const progress = async (
        value: StageProgress,
      ): Promise<void> => {
        await job.updateProgress({ ...value, runId, iteration: stageIteration(stage, requestedIteration) });
      };

      /*
       * Run-level stages are pinned to iteration 0 so Researcher/Planner can
       * never be re-executed by a refinement iteration (stage-scope.ts).
       */
      const identity: StageIdentity = {
        runId,
        stage,
        iteration: stageIteration(
          stage,
          requestedIteration,
        ),
      };

      const execute =
        async (): Promise<StageOutcome> => {
          /*
           * Fault injection (test only): a refine-once config substitutes a
           * Missing/refine outcome for this stage execution exactly once,
           * deterministically driving the canonical refinement loop to the
           * next iteration without touching sample fixtures.
           */
          if (
            await faultController.shouldInjectRefine(
              runId,
              stage as never,
              identity.iteration,
            )
          ) {
            return refine(
              { faultInjected: true },
              {
                issue_type: "Missing",
                evidence: {
                  issue: "Fault-injected refinement request",
                  expected: "Stage completes with a forwardable result",
                  actual: "refine-once fault injection requested refinement",
                  evidence_ids: [],
                  required_correction:
                    "Run the next refinement iteration",
                  recheck_target: runId,
                },
              },
              "fault injection: refine-once",
            );
          }

          switch (stage) {
            case "researcher":
              await runResearcherStage(
                ctx,
                services,
                progress,
              );
              return advance(undefined);
            case "planner":
              await runPlannerStage(
                ctx,
                services,
                progress,
              );
              return advance(undefined);
            case "refactor":
              await runRefactorStage(
                ctx,
                services,
                progress,
              );
              return advance(undefined);
            case "gap-analysis":
              await runGapAnalysisStage(
                ctx,
                services,
                progress,
              );
              return advance(undefined);
            case "evaluation":
              await runEvaluationStage(
                ctx,
                services,
                progress,
              );
              return advance(undefined);
            case "triple-validation": {
              await runTripleValidationStage(
                ctx,
                services,
                progress,
              );

              /*
               * Triple Validation drives the refinement loop: a failed
               * validation asks for another refinement iteration (capped by
               * the canonical transition resolver).
               */
              const triple =
                await loadTripleValidation(
                  ctx,
                );

              return triple.all_valid
                ? advance({ all_valid: true })
                : refine(
                    { all_valid: false },
                    {
                      issue_type: "Missing",
                      evidence: {
                        issue:
                          "Schema, fixture, or goal validation failed",
                        expected:
                          "Triple validation reports all_valid for the current revision",
                        actual:
                          "Triple validation reported failures for the current revision",
                        evidence_ids: [
                          triple.validation_id,
                        ],
                        required_correction:
                          "Refine the plan/artifacts and rerun validation",
                        recheck_target: runId,
                      },
                    },
                    "triple-validation: all_valid=false; refinement iteration required",
                  );
            }
            case "confirmation":
              await runConfirmationStage(
                ctx,
                services,
                progress,
              );
              return advance(undefined);
            case "hash": {
              await runHashStage(
                ctx,
                services,
                progress,
              );

              const proof =
                await loadHashProof(ctx);

              return proof.equal
                ? advance({ equal: true })
                : terminal(
                    { equal: false },
                    {
                      issue_type: "Root Cause",
                      evidence: {
                        issue:
                          "Hash proof reported a canonical mismatch",
                        expected:
                          "created_hash equals recomputed_hash (proof.equal)",
                        actual:
                          "Hash proof reported a canonical mismatch",
                        evidence_ids: [
                          proof.created_hash,
                        ],
                        required_correction:
                          "Investigate canonical serialization drift before promoting the build",
                        recheck_target: runId,
                      },
                    },
                  );
            }
            case "build": {
              const firstExecution = await checkpoints.recordBuilderIntent(runId);
              if (!firstExecution) {
                try {
                  const recovered = await store.load<{ result: string }>(runId, "build_result");
                  return recovered.result === "Passed"
                    ? advance({ result: "Passed", recovered: true })
                    : terminal({ result: recovered.result, recovered: true }, {
                        issue_type: "Root Cause",
                        evidence: {
                          issue: "Recovered failed Builder evidence",
                          expected: "Sandbox build passes",
                          actual: recovered.result,
                          evidence_ids: [],
                          required_correction: "Correct the sandbox build failure",
                          recheck_target: "Builder",
                        },
                      });
                } catch {
                  return terminal({ recovered: false }, {
                    issue_type: "Root Cause",
                    evidence: {
                      issue: "Builder execution outcome is uncertain",
                      expected: "Committed immutable Builder evidence",
                      actual: "Execution intent exists without committed evidence",
                      evidence_ids: [],
                      required_correction: "Inspect the sandbox execution and start a new run",
                      recheck_target: "Builder intent recovery",
                    },
                  });
                }
              }
              await runBuildStage(
                ctx,
                services,
                progress,
              );

              const buildResult =
                await store.load<{
                  result: string;
                }>(runId, "build_result");

              return buildResult.result ===
                "Passed"
                ? advance({ result: "Passed" })
                : terminal(
                    { result: buildResult.result },
                    {
                      issue_type: "Root Cause",
                      evidence: {
                        issue: "Build verification failed",
                        expected:
                          "Sandbox build verifies against the canonical hash",
                        actual: `Build result: ${buildResult.result}`,
                        evidence_ids: [],
                        required_correction:
                          "Address the build failure and rerun the pipeline",
                        recheck_target: runId,
                      },
                    },
                  );
            }
            case "finalize": {
              /*
               * The terminal stage carries no agent work. The semantic
               * content (test result + issue) was checkpointed as a
               * finalization intent before this stage was queued; replaying
               * it here keeps recovery deterministic.
               */
              const intent =
                await checkpoints.loadFinalizationIntent(
                  runId,
                );

              await runFinalizeStage(ctx, services, progress);

              if (
                intent &&
                intent.test_result === "Failed"
              ) {
                return terminal(
                  { finalized: true },
                  intent.issue,
                );
              }
              const proof = await loadHashProof(ctx);
              const buildResult = await store.load<{
                result: string;
                hash_sandbox?: string;
                evidence?: { hash_sandbox?: string };
              }>(runId, "build_result");
              const sandboxHash = buildResult.hash_sandbox ?? buildResult.evidence?.hash_sandbox;
              if (buildResult.result !== "Passed" || sandboxHash !== proof.created_hash) {
                return terminal({ finalized: false }, {
                  issue_type: "Root Cause",
                  evidence: {
                    issue: "Finalize hash verification failed",
                    expected: proof.created_hash,
                    actual: sandboxHash ?? "sandbox hash missing",
                    evidence_ids: [],
                    required_correction: "Preserve and compare Builder sandbox hash evidence",
                    recheck_target: "Finalize",
                  },
                });
              }
              return advance({ finalized: true, hash_proof: proof });
            }
            default:
              throw new Error(
                `Unknown pipeline stage: ${stage}`,
              );
          }
        };

      const { skipped, outcome } =
        await runStage({
          identity,
          checkpoints,
          history:
            history ?? {
              append: async () => "",
            },
          execute,
          lock: idempotency,
          faults: {
            apply: (faultRunId, faultStage, faultIteration) =>
              faultController.apply(
                faultRunId,
                faultStage as never,
                faultIteration,
              ),
            applyAfterCheckpoint:
              (faultRunId, faultStage, faultIteration) =>
                faultController.applyAfterCheckpoint(
                  faultRunId,
                  faultStage as never,
                  faultIteration,
                ),
          },
          markCompleted: () =>
            idempotency.markCompleted(
              runId,
              stage,
              identity.iteration,
            ),
          job,
        });

      /*
       * Durable transition: pending → side effect → committed.
       *
       * On a retry after a crash this runs even when the stage execution was
       * skipped, because the persisted outcome — not a fresh agent run —
       * drives the transition.
       */
      const transition = resolveTransition(
        stage,
        outcome,
        identity.iteration,
      );

      await applyTransition(
        identity,
        transition,
        transitionServices,
      );

      return {
        runId,
        stage,
        skipped,
        transition: transition.type,
      };
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

  const originalClose = worker.close.bind(worker);
  worker.close = async (force?: boolean) => {
    clearInterval(heartbeatInterval);
    await originalClose(force);
  };

  return worker;
}

