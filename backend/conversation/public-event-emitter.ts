/**
 * M15: Public event emitter with cancellation support.
 *
 * Translates internal ProcessingEvent / FactListener events into
 * OneShot-owned PublicRunEvent instances. Supports AbortSignal-based
 * cancellation. Both inline and queue modes use the same emitter
 * and the same event vocabulary.
 */
import type { PublicRunEvent } from "./public-events.js";
import { PublicEventStore } from "./event-store.js";

export interface PublicEventEmitterOptions {
  store: PublicEventStore;
  /** AbortSignal for cancellation. When aborted, emits run.cancelled. */
  signal?: AbortSignal;
  /** Callback for each emitted event (e.g. SSE write). */
  onEvent?: (event: PublicRunEvent) => void;
}

export class PublicEventEmitter {
  private runId: string;
  private opts: PublicEventEmitterOptions;
  private cancelled = false;

  constructor(runId: string, opts: PublicEventEmitterOptions) {
    this.runId = runId;
    this.opts = opts;
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => {
        this.cancel();
      }, { once: true });
    }
  }

  /** Emit a public event. No-ops if cancelled. */
  emit(event: PublicRunEvent): void {
    if (this.cancelled) return;
    this.opts.store.append(this.runId, event);
    this.opts.onEvent?.(event);
  }

  /** Emit run.started. */
  emitRunStarted(): void {
    this.emit({ type: "run.started", runId: this.runId });
  }

  /** Emit message.started. */
  emitMessageStarted(messageId: string): void {
    this.emit({ type: "message.started", runId: this.runId, messageId });
  }

  /** Emit message.delta. */
  emitMessageDelta(messageId: string, delta: string): void {
    this.emit({ type: "message.delta", runId: this.runId, messageId, delta });
  }

  /** Emit tool.started. */
  emitToolStarted(toolName: string): void {
    this.emit({ type: "tool.started", runId: this.runId, toolName });
  }

  /** Emit tool.completed. */
  emitToolCompleted(toolName: string): void {
    this.emit({ type: "tool.completed", runId: this.runId, toolName });
  }

  /** Emit evidence.added. */
  emitEvidenceAdded(evidenceId: string): void {
    this.emit({ type: "evidence.added", runId: this.runId, evidenceId });
  }

  /** Emit review.required. */
  emitReviewRequired(): void {
    this.emit({ type: "review.required", runId: this.runId });
  }

  /** Emit run.completed. */
  emitRunCompleted(): void {
    this.emit({ type: "run.completed", runId: this.runId });
  }

  /** Emit run.failed. */
  emitRunFailed(code: string): void {
    this.emit({ type: "run.failed", runId: this.runId, code });
  }

  /** Cancel the run — emits run.cancelled and stops further emissions. */
  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.opts.store.append(this.runId, { type: "run.cancelled", runId: this.runId });
    this.opts.onEvent?.({ type: "run.cancelled", runId: this.runId });
  }

  get isCancelled(): boolean {
    return this.cancelled;
  }
}
