import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";

export type StageExecutionState = "started" | "completed";

export class PipelineIdempotency {
  constructor(private readonly redis: Redis) {}

  private completedKey(
    runId: string,
    stage: string,
  ): string {
    return `oneshot:run:${runId}:stage:${stage}:completed`;
  }

  private lockKey(
    runId: string,
    stage: string,
  ): string {
    return `oneshot:run:${runId}:stage:${stage}:lock`;
  }

  async isCompleted(
    runId: string,
    stage: string,
  ): Promise<boolean> {
    return (
      (await this.redis.exists(
        this.completedKey(runId, stage),
      )) === 1
    );
  }

  async markCompleted(
    runId: string,
    stage: string,
  ): Promise<void> {
    await this.redis.set(
      this.completedKey(runId, stage),
      new Date().toISOString(),
      "EX",
      60 * 60 * 24 * 30,
    );
  }

  async acquire(
    runId: string,
    stage: string,
    ttlSeconds = 60 * 30,
  ): Promise<boolean> {
    if (await this.isCompleted(runId, stage)) {
      return false;
    }

    const result = await this.redis.set(
      this.lockKey(runId, stage),
      randomUUID(),
      "EX",
      ttlSeconds,
      "NX",
    );

    return result === "OK";
  }

  async release(
    runId: string,
    stage: string,
  ): Promise<void> {
    await this.redis.del(
      this.lockKey(runId, stage),
    );
  }
}
