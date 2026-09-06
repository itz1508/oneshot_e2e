import type { Redis } from "ioredis";
import { getFaultConfigs, type FaultConfig, type FaultStage } from "./faults.js";

function matchesIteration(
  config: FaultConfig,
  iteration: number,
): boolean {
  return iteration >= (config.minIteration ?? 0);
}

export class PipelineFaultController {
  constructor(private readonly redis: Redis) {}

  async apply(
    runId: string,
    stage: FaultStage,
    iteration = 0,
  ): Promise<void> {
    const configs = getFaultConfigs();

    for (const config of configs) {
      if (config.stage !== stage || !matchesIteration(config, iteration)) {
        continue;
      }

      switch (config.mode) {
        case "none":
        case "crash-after-checkpoint":
          /*
           * crash-after-checkpoint has its own hook (applyAfterCheckpoint)
           * that fires AFTER the execution checkpoint is durable. It must do
           * nothing here, before execution.
           */
        case "refine-once":
          /*
           * refine-once is an OUTCOME-level injection handled by
           * shouldInjectRefine before the stage executes.
           */
          return;

        case "delay": {
          await sleep(config.delayMs ?? 3000);
          return;
        }

        case "fail-always": {
          throw new Error(
            `[FAULT] Forced permanent failure at ${stage}`,
          );
        }

        case "fail-once": {
          const key = `oneshot:fault:${runId}:${stage}:consumed`;
          const first = await this.redis.set(
            key,
            "1",
            "EX",
            60 * 60,
            "NX",
          );

          if (first === "OK") {
            throw new Error(
              `[FAULT] Forced one-time failure at ${stage}`,
            );
          }

          return;
        }

        case "crash-once": {
          const key = `oneshot:fault:${runId}:${stage}:crash-consumed`;
          const first = await this.redis.set(
            key,
            "1",
            "EX",
            60 * 60,
            "NX",
          );

          if (first !== "OK") {
            return;
          }

          /*
           * Give stdout/Redis writes a tiny chance to flush before intentionally
           * killing the worker process.
           */
          setTimeout(() => {
            process.exit(91);
          }, 50);

          await new Promise<never>(() => {
            // Intentionally never resolves. The worker process exits above.
          });
        }

        case "crash": {
          /*
           * Intended ONLY for local E2E testing.
           *
           * Killing the worker lets us verify that BullMQ eventually
           * recovers the job. Use crash-once for deterministic recovery tests.
           */
          process.nextTick(() => {
            process.exit(91);
          });

          await new Promise<never>(() => {
            // Worker exits above.
          });
        }
      }
    }
  }

  /**
   * Crash window for the durable-checkpoint acceptance test:
   *
   *   outcome + executed marker persisted
   *     ↓
   *   history = completed
   *     ↓
   *   applyAfterCheckpoint() fires here
   *     ↓
   *   worker exits 92 BEFORE runStage returns to the transition layer
   *
   * So the persisted outcome exists but applyTransition() never runs, and
   * recovery must load the saved outcome instead of rerunning the agent.
   *
   * Exit code 92 (vs 91 for the ordinary crash modes) makes CI diagnostics
   * unambiguous about which crash window was exercised.
   */
  async applyAfterCheckpoint(
    runId: string,
    stage: FaultStage,
    iteration = 0,
    hooks: {
      exit?: (code: number) => never;
    } = {},
  ): Promise<void> {
    const configs = getFaultConfigs().filter(
      (config) =>
        config.stage === stage &&
        config.mode === "crash-after-checkpoint" &&
        matchesIteration(config, iteration),
    );

    if (configs.length === 0) {
      return;
    }

    const marker = [
      "oneshot",
      "fault",
      runId,
      stage,
      "crash-after-checkpoint",
      `i${iteration}`,
      "consumed",
    ].join(":");

    const first = await this.redis.set(
      marker,
      "1",
      "EX",
      60 * 60,
      "NX",
    );

    if (first !== "OK") {
      return;
    }

    const exit = hooks.exit ?? ((code: number) => process.exit(code) as never);

    /*
     * Give stdout/Redis writes a tiny chance to flush before intentionally
     * killing the worker process.
     */
    setTimeout(() => {
      exit(92);
    }, 50);

    await new Promise<never>(() => {
      // Intentionally never resolves. The worker process exits above.
    });
  }

  /**
   * Outcome-level injection for the refinement-recovery test: the stage
   * reports a Missing/refine outcome (exactly once per run/stage/iteration)
   * WITHOUT executing, driving the canonical refinement loop to the next
   * iteration. Returns true when the caller must substitute the outcome.
   */
  async shouldInjectRefine(
    runId: string,
    stage: FaultStage,
    iteration = 0,
  ): Promise<boolean> {
    const configs = getFaultConfigs().filter(
      (config) =>
        config.stage === stage &&
        config.mode === "refine-once" &&
        matchesIteration(config, iteration),
    );

    if (configs.length === 0) {
      return false;
    }

    const marker = [
      "oneshot",
      "fault",
      runId,
      stage,
      "refine-once",
      `i${iteration}`,
      "consumed",
    ].join(":");

    const first = await this.redis.set(
      marker,
      "1",
      "EX",
      60 * 60,
      "NX",
    );

    return first === "OK";
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
