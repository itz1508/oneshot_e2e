import type { Redis } from "ioredis";
import type { RootCause } from "../contracts/schema/types.js";
import type { ProcessingEventBus } from "../runtime/event-bus.js";
import type { ArtifactStore } from "../runtime/artifact-store.js";
import type { RunRepository } from "../runtime/run-repository.js";
import {
  PipelineCheckpoints,
  type RedisCheckpointClient,
} from "./checkpoints.js";
import type { TransitionServices } from "./apply-transition.js";
import type { PipelineHistory } from "./history.js";
import type { PipelineIssue } from "./stage-outcome.js";
import { loadHashProof } from "./context.js";
import { pipelineQueue } from "./queue.js";

export interface TransitionServicesInput {
  runs: RunRepository;
  store: ArtifactStore;
  events: ProcessingEventBus;
  redis: Redis;
  history?: PipelineHistory;
}

export interface TransitionServicesHandle {
  checkpoints: PipelineCheckpoints;
  services: TransitionServices;
}

/**
 * Adapt an ioredis client to the minimal RedisCheckpointClient surface.
 *
 * ioredis's `set` carries typed overload permutations (callback parameters,
 * option literals) that do not structurally match the variadic
 * `(key, value, ...args)` shape the checkpoint client uses, so the calls are
 * forwarded through a runtime-identical loose signature.
 */
function adaptRedisClient(
  redis: Redis,
): RedisCheckpointClient {
  return {
    get: (key: string) => redis.get(key),

    set: (
      key: string,
      value: string,
      ...args: Array<string | number>
    ) =>
      (
        redis.set as unknown as (
          ...callArgs: Array<string | number>
        ) => Promise<unknown>
      )(key, value, ...args),

    eval: (
      script: string,
      numberOfKeys: number,
      ...args: string[]
    ) =>
      (
        redis.eval as unknown as (
          evalScript: string,
          numKeys: number,
          ...evalArgs: string[]
        ) => Promise<unknown>
      )(script, numberOfKeys, ...args),
  };
}

/**
 * Build the durable transition services shared by the pipeline worker and
 * the diagnostic reconcile endpoint.
 *
 * The `finish` service is idempotent at the run level:
 *
 *   terminal-state = pending (SET NX, records the terminal result)
 *     ↓
 *   runs.finish() + Done event  (only if the run is not finished yet)
 *     ↓
 *   terminal-state = committed
 *
 * A crash after `runs.finish()` but before the commit leaves an explicit
 * pending record, so reconciliation can complete it without re-emitting the
 * Done event.
 */
export function createTransitionServices(
  input: TransitionServicesInput,
): TransitionServicesHandle {
  const {
    runs,
    store,
    events,
    redis,
    history,
  } = input;

  const checkpoints = new PipelineCheckpoints(
    adaptRedisClient(redis),
  );

  const waitForHuman = async (
    runId: string,
  ): Promise<void> => {
    await history?.append({
      runId,
      stage: "await-human",
      type: "waiting",
      iteration: 0,
      message:
        "Researcher complete; waiting for confirm-plan before planner.",
    });
  };

  const finish = async (
    runId: string,
    testResult: "Passed" | "Failed",
    issue?: PipelineIssue,
  ): Promise<void> => {
    const previousState =
      await checkpoints.getTerminalState(
        runId,
      );

    if (previousState === "committed") {
      return;
    }

    /*
     * Agree on exactly one terminal issue even if two paths race here.
     */
    const effectiveIssue =
      previousState === "pending"
        ? (await checkpoints.getTerminalIssue(
            runId,
          )) ?? undefined
        : await checkpoints.markTerminalPending(
            runId,
            issue,
          );

    const snapshot = runs.get(runId);

    if (!snapshot) {
      /*
       * Nothing to terminalize — never throw here, or the transition job
       * would retry forever. Record the pending terminal state so operators
       * can see it via the reconcile endpoint.
       */
      console.error(
        `[OneShot] cannot terminalize run ${runId}: run snapshot not found`,
      );
    } else if (snapshot.pipeline_status !== "Done") {
      if (testResult === "Failed") {
        const rootCause: RootCause = effectiveIssue?.evidence ?? {
          issue: "Finalize received a failed result without structured evidence",
          expected: "Every failed finalization carries structured issue evidence",
          actual: "Finalization evidence was absent",
          evidence_ids: [],
          required_correction: "Preserve the originating stage evidence",
          recheck_target: runId,
        };
        runs.finish(
          runId,
          "Failed",
          undefined,
          rootCause,
          undefined,
          effectiveIssue?.issue_type ?? "Root Cause",
        );
      } else {
        let hashProof;
        try {
          hashProof = await loadHashProof({
            runId,
            runs,
            store,
          });
        } catch {
          /* Hash proof unavailable; finish without it. */
        }

        runs.finish(
          runId,
          "Passed",
          hashProof,
        );
      }

      events.emit(runId, "Done", "Completed", {
        scope: "SUPPORT",
        test_result:
          testResult,
        ...(effectiveIssue
          ? { issue_type: effectiveIssue.issue_type, issue: effectiveIssue.evidence }
          : {}),
        message: effectiveIssue?.evidence.issue,
      });
    }

    await checkpoints.markTerminalCommitted(
      runId,
    );
  };

  const services: TransitionServices = {
    /*
     * The BullMQ queue is structurally compatible; the deterministic
     * (runId, iteration, stage) job ID keeps repeated enqueues idempotent.
     */
    queue: pipelineQueue as unknown as TransitionServices["queue"],
    checkpoints,
    waitForHuman,
    waitForBuild: async (runId) => {
      await history?.append({ runId, stage: "build-ready", type: "waiting", iteration: 0,
        message: "Confirmed package and hash ready; waiting for explicit build authorization." });
      events.emit(runId, "BuildReady", "Running", { scope: "SUPPORT", message: "Review the confirmed package and confirm Build." });
    },
    finish,
  };

  return {
    checkpoints,
    services,
  };
}
