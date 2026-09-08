import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";

export type StageExecutionState = "started" | "completed";

/*
 * Ownership-safe release: only delete the lock when the stored token still
 * belongs to the caller. Deleting unconditionally can release a lock that was
 * already expired and re-acquired by another worker.
 */
const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end

return 0
`;
const RENEW_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("EXPIRE", KEYS[1], ARGV[2])
end
return 0
`;

export class PipelineIdempotency {
  constructor(private readonly redis: Redis) {}

  private completedKey(runId: string, stage: string, iteration = 0): string {
    return `oneshot:run:${runId}:stage:${stage}:${iteration}:completed`;
  }

  lockKey(runId: string, stage: string): string {
    return `oneshot:run:${runId}:stage:${stage}:lock`;
  }

  async isCompleted(
    runId: string,
    stage: string,
    iteration = 0,
  ): Promise<boolean> {
    return (
      (await this.redis.exists(this.completedKey(runId, stage, iteration))) ===
      1
    );
  }

  async markCompleted(
    runId: string,
    stage: string,
    iteration = 0,
  ): Promise<void> {
    await this.redis.set(
      this.completedKey(runId, stage, iteration),
      new Date().toISOString(),
      "EX",
      60 * 60 * 24 * 30,
    );
  }

  /**
   * Acquire the per-stage execution lock.
   *
   * Returns the random lock token on success, or null when the lock is held
   * (or the stage is already completed). The token MUST be passed back to
   * `release` — it is the ownership proof.
   */
  async acquire(
    runId: string,
    stage: string,
    ttlSeconds = 60,
  ): Promise<string | null> {
    if (await this.isCompleted(runId, stage)) {
      return null;
    }

    const token = randomUUID();

    const result = await this.redis.set(
      this.lockKey(runId, stage),
      token,
      "EX",
      ttlSeconds,
      "NX",
    );

    return result === "OK" ? token : null;
  }

  async renew(
    runId: string,
    stage: string,
    token: string,
    ttlSeconds = 60,
  ): Promise<boolean> {
    const result = await this.redis.eval(
      RENEW_LOCK_SCRIPT,
      1,
      this.lockKey(runId, stage),
      token,
      String(ttlSeconds),
    );
    return Number(result) === 1;
  }

  /**
   * Release the lock only if `token` still owns it.
   * Returns true when the lock was deleted by this call.
   */
  async release(runId: string, stage: string, token: string): Promise<boolean> {
    const result = await this.redis.eval(
      RELEASE_LOCK_SCRIPT,
      1,
      this.lockKey(runId, stage),
      token,
    );

    return Number(result) === 1;
  }
}
