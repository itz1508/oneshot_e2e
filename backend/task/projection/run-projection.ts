import type { ProcessingEvent, RunSnapshot } from "../../contract/types.js";
import type { TaskCheckpoint } from "../checkpoint/checkpoint-store.js";

/**
 * Project a task-management view of a run by grouping events by scope
 * and including the latest checkpoint.
 */
export function projectTaskRun(
  runId: string,
  events: ProcessingEvent[],
  checkpoint?: TaskCheckpoint,
  snapshot?: RunSnapshot,
) {
  const latest = new Map<string, ProcessingEvent>();
  for (const e of events) latest.set(`${e.scope}:${e.processor}`, e);

  return {
    run_id: runId,
    result: snapshot?.result,
    current_processor: snapshot?.current_processor,
    event_count: events.length,
    checkpoint,
    workflow: [...latest.values()].filter((e) => e.scope === "WORKFLOW"),
    adk: [...latest.values()].filter((e) => e.scope === "ADK"),
    support: [...latest.values()].filter((e) => e.scope === "SUPPORT"),
    artifacts: snapshot?.artifacts ?? {},
    hash_proof: snapshot?.hash_proof,
    root_cause: snapshot?.root_cause,
    help_request: snapshot?.help_request,
  };
}
