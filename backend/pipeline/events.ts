import { QueueEvents } from "bullmq";
import { PIPELINE_QUEUE, getSharedRedis } from "./queue.js";
import type { ProcessingEventBus } from "../runtime/event-bus.js";
import type { StageProgress } from "./types.js";

export interface PipelineEventsInput {
  events: ProcessingEventBus;
}

export function createPipelineQueueEvents(
  input: PipelineEventsInput,
): QueueEvents {
  const { events } = input;

  const queueEvents = new QueueEvents(PIPELINE_QUEUE, {
    connection: getSharedRedis().duplicate(),
  });

  queueEvents.on("progress", ({ jobId, data }) => {
    const progress = data as StageProgress | undefined;

    if (!progress) return;

    console.log(
      "[progress]",
      jobId,
      progress.stage,
      `${progress.percent}%`,
      progress.message,
    );

    // The durable event stream is authoritative; QueueEvents progress is
    // forwarded as a SUPPORT-level progress hint when no native event exists.
    if (jobId && progress.runId) {
      events.emit(progress.runId, "PipelineProgress", "Running", {
        scope: "SUPPORT",
        message: `[${progress.stage}] ${progress.percent}% — ${progress.message}`,
      });
    }
  });

  queueEvents.on("completed", ({ jobId }) => {
    console.log("[completed]", jobId);
  });

  queueEvents.on("failed", ({ jobId, failedReason }) => {
    console.error("[failed]", jobId, failedReason);
  });

  queueEvents.on("error", (error) => {
    console.error("[QueueEvents error]", error);
  });

  return queueEvents;
}

export async function closePipelineQueueEvents(
  queueEvents: QueueEvents,
): Promise<void> {
  await queueEvents.close();
}
