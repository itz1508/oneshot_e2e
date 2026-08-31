import type { ProcessingEvent, RunSnapshot } from "../contract/types.js";
import { AppendOnlyProcessingEventStore } from "./event/event-store.js";
import { CheckpointStore } from "./checkpoint/checkpoint-store.js";
import { projectTaskRun } from "./projection/run-projection.js";
import { projectAudit } from "./projection/audit-projection.js";

/**
 * Task Management facade — read-only observation layer around the canonical
 * workflow.  Records append-only events, maintains checkpoints, and produces
 * run/audit projections.
 *
 * Never modifies canonical workflow truth or confirmed_package.core.
 */
export class TaskManagement {
  constructor(
    readonly events: AppendOnlyProcessingEventStore,
    readonly checkpoints: CheckpointStore,
  ) {}

  /** Called by the event observer when a processing event fires. */
  onEvent(event: ProcessingEvent, snapshot: RunSnapshot): void {
    this.checkpoints.update(event, snapshot);
  }

  /** Produce a task-management run projection. */
  projection(runId: string, snapshot?: RunSnapshot) {
    return projectTaskRun(
      runId,
      this.events.list(runId),
      this.checkpoints.get(runId),
      snapshot,
    );
  }

  /** Produce an audit projection with ordering checks. */
  audit(runId: string, snapshot?: RunSnapshot) {
    return projectAudit(
      runId,
      this.events.list(runId),
      this.checkpoints.get(runId),
      snapshot,
    );
  }
}
