/**
 * M15: OneShot-owned public run events.
 *
 * These events are the ONLY event vocabulary exposed to the browser.
 * Raw Strands, OpenAI, or any SDK events are NEVER forwarded. The
 * PublicEventEmitter translates internal processing events into these
 * public events and stores them for replay on reconnection.
 *
 * A disconnected browser does not leave an uncontrolled run
 * indefinitely: the event store has a TTL and the run has a
 * cancellation timeout.
 */
export type PublicRunEvent =
  | { type: "run.started"; runId: string }
  | { type: "message.started"; runId: string; messageId: string }
  | { type: "message.delta"; runId: string; messageId: string; delta: string }
  | { type: "tool.started"; runId: string; toolName: string }
  | { type: "tool.completed"; runId: string; toolName: string }
  | { type: "evidence.added"; runId: string; evidenceId: string }
  | { type: "review.required"; runId: string }
  | { type: "run.completed"; runId: string }
  | { type: "run.cancelled"; runId: string }
  | { type: "run.failed"; runId: string; code: string };

/** Event type strings for assertions. */
export const PublicEventType = {
  RUN_STARTED: "run.started",
  MESSAGE_STARTED: "message.started",
  MESSAGE_DELTA: "message.delta",
  TOOL_STARTED: "tool.started",
  TOOL_COMPLETED: "tool.completed",
  EVIDENCE_ADDED: "evidence.added",
  REVIEW_REQUIRED: "review.required",
  RUN_COMPLETED: "run.completed",
  RUN_CANCELLED: "run.cancelled",
  RUN_FAILED: "run.failed",
} as const;

/** A stored event with sequence for replay ordering. */
export interface StoredPublicEvent {
  readonly sequence: number;
  readonly event: PublicRunEvent;
  readonly timestamp: string;
}
