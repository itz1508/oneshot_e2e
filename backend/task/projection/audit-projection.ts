import type { ProcessingEvent, RunSnapshot } from "../../contract/types.js";
import type { TaskCheckpoint } from "../checkpoint/checkpoint-store.js";
import { detectOrderingIssues } from "../guard/ordering.js";

/**
 * Audit projection — includes ordering validity analysis, artifact references,
 * and all raw events for investigative replay.
 */
export function projectAudit(
  runId: string,
  events: ProcessingEvent[],
  checkpoint?: TaskCheckpoint,
  snapshot?: RunSnapshot,
) {
  const issues = detectOrderingIssues(events);
  const artifactRefs = [
    ...new Set(
      events.map((e) => e.artifact_id).filter((x): x is string => Boolean(x)),
    ),
  ];

  return {
    run_id: runId,
    result: snapshot?.result,
    event_count: events.length,
    ordering: { valid: issues.length === 0, issues },
    checkpoint,
    artifact_refs: artifactRefs,
    events,
    hash_proof: snapshot?.hash_proof,
    root_cause: snapshot?.root_cause,
    help_request: snapshot?.help_request,
  };
}
