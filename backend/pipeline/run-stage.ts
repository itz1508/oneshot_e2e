import type { StageOutcome } from "./stage-outcome.js";
import type { PipelineCheckpoints, StageIdentity } from "./checkpoints.js";

export interface RunStageResult<T> {
  skipped: boolean;
  outcome: StageOutcome<T>;
}

export type StageHistoryEventType =
  | "started"
  | "completed"
  | "failed"
  | "skipped";

export interface StageHistoryEvent {
  runId: string;
  stage: string;
  type: StageHistoryEventType;
  iteration?: number;
  message?: string;
  jobId?: string;
  attempt?: number;
}

/**
 * Minimal history surface runStage needs. PipelineHistory satisfies this.
 */
export interface StageHistoryLogger {
  append(event: StageHistoryEvent): Promise<unknown>;
}

/**
 * Token-based execution lock. PipelineIdempotency satisfies this.
 */
export interface StageExecutionLock {
  acquire(runId: string, stage: string): Promise<string | null>;

  release(runId: string, stage: string, token: string): Promise<boolean>;
  renew(runId: string, stage: string, token: string): Promise<boolean>;
  lockKey(runId: string, stage: string): string;
}

export interface StageFaultInjector {
  apply(runId: string, stage: string, iteration: number): Promise<void>;

  /**
   * Optional post-checkpoint crash hook (fault injection only). Fires after
   * the execution checkpoint is durable but before runStage returns to the
   * transition layer — the crash window the recovery tests exercise.
   */
  applyAfterCheckpoint?(
    runId: string,
    stage: string,
    iteration: number,
  ): Promise<void>;
}

export interface RunStageInput<T> {
  identity: StageIdentity;
  checkpoints: PipelineCheckpoints;
  history: StageHistoryLogger;

  execute: () => Promise<StageOutcome<T>>;

  /** Optional mutual-exclusion lock around the agent execution. */
  lock?: StageExecutionLock;

  /** Optional fault injection (local E2E testing only). */
  faults?: StageFaultInjector;

  /** Optional legacy completion marker kept for downstream consumers. */
  markCompleted?: () => Promise<void>;

  /** Optional BullMQ job metadata for history records. */
  job?: {
    id?: string | number;
    attemptsMade?: number;
  };
}

/**
 * Execute one pipeline stage with durable semantics:
 *
 *   execute
 *     ↓
 *   outcome + executed marker persisted ATOMICALLY (single Lua script)
 *     ↓
 *   transition handling happens OUTSIDE this function
 *
 * Recovery: if the stage is already marked executed, the agent is NEVER
 * rerun — the persisted outcome is loaded and returned (skipped: true) so
 * the caller can continue the unfinished transition.
 */
export async function runStage<T>(
  input: RunStageInput<T>,
): Promise<RunStageResult<T>> {
  const {
    identity,
    checkpoints,
    history,
    execute,
    lock,
    faults,
    markCompleted,
    job,
  } = input;

  const { runId, stage, iteration } = identity;

  const jobId = job?.id === undefined ? undefined : String(job.id);

  const attempt = (job?.attemptsMade ?? 0) + 1;

  const loadPersistedOutcome = async (): Promise<RunStageResult<T> | null> => {
    if (!(await checkpoints.isExecuted(identity))) {
      return null;
    }

    const outcome = await checkpoints.loadOutcome<T>(identity);

    if (!outcome) {
      throw new Error(
        `Stage ${stage} is marked executed but has no persisted outcome.`,
      );
    }

    await history.append({
      runId,
      stage,
      type: "skipped",
      iteration,
      message:
        "Stage already executed; persisted outcome loaded; agent not rerun.",
      jobId,
      attempt,
    });

    return {
      skipped: true,
      outcome,
    };
  };

  const recovered = await loadPersistedOutcome();

  if (recovered) {
    return recovered;
  }

  let lockToken: string | null = null;
  const leaseStage = `${stage}:${iteration}`;
  let renewalTimer: ReturnType<typeof setInterval> | undefined;
  let leaseLost = false;

  if (lock) {
    lockToken = await lock.acquire(runId, leaseStage);

    if (!lockToken) {
      /*
       * Lost a race with another worker. The winner may have checkpointed
       * the execution already, so look for the durable outcome before
       * treating this as an error.
       */
      const raced = await loadPersistedOutcome();

      if (raced) {
        return raced;
      }

      throw new Error(
        `Stage ${stage} already has an active execution lock for run ${runId}`,
      );
    }
    renewalTimer = setInterval(() => {
      void lock
        .renew(runId, leaseStage, lockToken as string)
        .then((owned) => {
          if (!owned) leaseLost = true;
        })
        .catch(() => {
          leaseLost = true;
        });
    }, 20_000);
  }

  try {
    await history.append({
      runId,
      stage,
      type: "started",
      iteration,
      jobId,
      attempt,
    });

    if (faults) {
      await faults.apply(runId, stage, iteration);
    }

    const outcome = await execute();
    if (leaseLost)
      throw new Error(`Lease ownership lost while executing ${stage}`);

    /*
     * IMPORTANT:
     *
     * The outcome and the executed marker are written atomically by
     * saveExecution. After this call, a retry must never rerun the agent.
     */
    await checkpoints.saveExecution(
      identity,
      outcome,
      lock && lockToken
        ? { key: lock.lockKey(runId, leaseStage), token: lockToken }
        : undefined,
    );

    if (markCompleted) {
      await markCompleted();
    }

    await history.append({
      runId,
      stage,
      type: "completed",
      iteration,
      jobId,
      attempt,
    });

    /*
     * Deliberately kill the worker (fault injection) after outcome + executed
     * checkpoint are durable but before runStage returns to the transition
     * layer. This is the crash window recovery must survive: the retry must
     * load the persisted outcome, never rerun the agent.
     */
    if (faults?.applyAfterCheckpoint) {
      await faults.applyAfterCheckpoint(runId, stage, iteration);
    }

    return {
      skipped: false,
      outcome,
    };
  } catch (error) {
    await history.append({
      runId,
      stage,
      type: "failed",
      iteration,
      message: error instanceof Error ? error.message : String(error),
      jobId,
      attempt,
    });

    throw error;
  } finally {
    /*
     * Ownership-safe release: only removes the lock when the token still
     * belongs to this execution.
     */
    if (lock && lockToken) {
      if (renewalTimer) clearInterval(renewalTimer);
      await lock.release(runId, leaseStage, lockToken);
    }
  }
}
