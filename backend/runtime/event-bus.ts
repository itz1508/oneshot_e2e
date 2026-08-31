import { randomBytes, randomUUID } from "node:crypto";
import type {
  ProcessingEvent,
  ProcessingScope,
  ProcessingState,
  ValidationResult,
  WorkflowResult,
} from "../contract/types.js";
import type { AppendOnlyProcessingEventStore } from "../task/event/event-store.js";

type Subscriber = (event: ProcessingEvent) => void;

type EventData = {
  result?: WorkflowResult | ValidationResult;
  artifact_id?: string;
  message?: string;
  scope?: ProcessingScope;
};

/**
 * Processing event bus with W3C trace context, causal chains, scoped events,
 * optional persistent backing via AppendOnlyProcessingEventStore, and
 * run-specific + global observer support.
 */
export class ProcessingEventBus {
  private sequence = new Map<string, number>();
  private traceIds = new Map<string, string>();
  private history = new Map<string, ProcessingEvent[]>();
  private subscribers = new Map<string, Set<Subscriber>>();
  private observers = new Set<Subscriber>();

  constructor(private store?: AppendOnlyProcessingEventStore) {}

  /**
   * Load the event history for a run — from persistent store on first access,
   * then from in-memory cache.
   */
  private load(runId: string): ProcessingEvent[] {
    if (this.history.has(runId)) return this.history.get(runId)!;

    const h = this.store?.list(runId) ?? [];
    this.history.set(runId, h);
    this.sequence.set(runId, h.at(-1)?.sequence ?? 0);

    // Recover the trace ID from persisted events
    if (h[0]?.traceparent) {
      const parts = h[0].traceparent.split("-");
      if (parts.length === 4) this.traceIds.set(runId, parts[1]);
    }

    return h;
  }

  /** Emit a processing event with full trace context and causal chain. */
  emit(
    runId: string,
    processor: string,
    state: ProcessingState,
    data: EventData = {},
  ): ProcessingEvent {
    const h = this.load(runId);
    const seq = (this.sequence.get(runId) ?? 0) + 1;
    this.sequence.set(runId, seq);

    // W3C Trace Context — one trace per run, unique span per event
    const traceId =
      this.traceIds.get(runId) ?? randomBytes(16).toString("hex");
    this.traceIds.set(runId, traceId);
    const spanId = randomBytes(8).toString("hex");

    const last = h.at(-1);

    const event: ProcessingEvent = {
      event_id: randomUUID(),
      sequence: seq,
      run_id: runId,
      scope: data.scope ?? "WORKFLOW",
      processor,
      state,
      created_at: new Date().toISOString(),
      causation_id: last?.event_id,
      correlation_id: `run:${runId}`,
      traceparent: `00-${traceId}-${spanId}-01`,
      ...(data.result ? { result: data.result } : {}),
      ...(data.artifact_id ? { artifact_id: data.artifact_id } : {}),
      ...(data.message ? { message: data.message } : {}),
    };

    // Persist to durable store if available
    this.store?.append(event);
    h.push(event);

    // Notify global observers, then run-specific subscribers
    for (const sub of this.observers) sub(event);
    for (const sub of this.subscribers.get(runId) ?? []) sub(event);

    return event;
  }

  /** Return a shallow copy of all events for a run. */
  list(runId: string): ProcessingEvent[] {
    return [...this.load(runId)];
  }

  /** Register a global observer that sees events from all runs. */
  observe(sub: Subscriber): () => void {
    this.observers.add(sub);
    return () => this.observers.delete(sub);
  }

  /** Subscribe to events for a specific run. Returns an unsubscribe function. */
  subscribe(runId: string, sub: Subscriber): () => void {
    const set = this.subscribers.get(runId) ?? new Set<Subscriber>();
    set.add(sub);
    this.subscribers.set(runId, set);
    return () => {
      set.delete(sub);
      if (set.size === 0) this.subscribers.delete(runId);
    };
  }
}
