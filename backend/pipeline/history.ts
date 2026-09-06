import type { Redis } from "ioredis";

export type PipelineHistoryEventType =
  | "queued"
  | "started"
  | "completed"
  | "failed"
  | "waiting"
  | "confirmed"
  | "retrying";

export interface PipelineHistoryEvent {
  runId: string;
  stage: string;
  type: PipelineHistoryEventType;
  timestamp: string;
  message?: string;
  jobId?: string;
  attempt?: number;
}

export class PipelineHistory {
  constructor(private readonly redis: Redis) {}

  private key(runId: string): string {
    return `oneshot:run:${runId}:history`;
  }

  async append(
    event: Omit<PipelineHistoryEvent, "timestamp">,
  ): Promise<string> {
    const timestamp = new Date().toISOString();

    const id = await this.redis.xadd(
      this.key(event.runId),
      "*",
      "runId",
      event.runId,
      "stage",
      event.stage,
      "type",
      event.type,
      "timestamp",
      timestamp,
      "message",
      event.message ?? "",
      "jobId",
      event.jobId ?? "",
      "attempt",
      String(event.attempt ?? 0),
    );
    return id ?? `${Date.now()}-0`;
  }

  async list(runId: string): Promise<PipelineHistoryEvent[]> {
    const records = await this.redis.xrange(
      this.key(runId),
      "-",
      "+",
    );

    return records.map(([, values]) => {
      const object: Record<string, string> = {};

      for (let index = 0; index < values.length; index += 2) {
        object[values[index]] = values[index + 1];
      }

      return {
        runId: object.runId,
        stage: object.stage,
        type: object.type as PipelineHistoryEventType,
        timestamp: object.timestamp,
        message: object.message || undefined,
        jobId: object.jobId || undefined,
        attempt: Number(object.attempt ?? 0),
      };
    });
  }

  async clear(runId: string): Promise<void> {
    await this.redis.del(this.key(runId));
  }
}
