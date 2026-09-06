import type { Redis } from "ioredis";
import { getFaultConfig, type FaultStage } from "./faults.js";

export class PipelineFaultController {
  constructor(private readonly redis: Redis) {}

  async apply(
    runId: string,
    stage: FaultStage,
  ): Promise<void> {
    const config = getFaultConfig();

    if (!config) {
      return;
    }

    if (config.stage !== stage) {
      return;
    }

    switch (config.mode) {
      case "none":
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

      case "crash": {
        /*
         * Intended ONLY for local E2E testing.
         *
         * Killing the worker lets us verify that BullMQ eventually
         * recovers the job.
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

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
