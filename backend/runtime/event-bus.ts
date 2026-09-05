import { randomBytes, randomUUID } from "node:crypto";
import type {
  ProcessingEvent,
  ProcessingScope,
  ProcessingState,
  ValidationResult,
  WorkflowResult,
} from "../contracts/schema/types.js";
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

  /**
   * event_id dedup set per run. Shared by emit() and ingest() so that delivery
   * is exactly-once across the in-process path AND at-least-once BullMQ/Redis
   * transport (a re-delivered event is recognized and dropped, never re-persisted
   * or re-notified).
   */
  private seen = new Map<string, Set<string>>();

  private markSeen(runId: string, eventId: string): void {
    let s = this.seen.get(runId);
    if (!s) {
      s = new Set();
      this.seen.set(runId, s);
    }
    s.add(eventId);
  }

  private hasSeen(runId: string, eventId: string): boolean {
    return this.seen.get(runId)?.has(eventId) ?? false;
  }

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
    // Seed the dedup set from durable history so a re-delivered (at-least-once)
    // event from BullMQ/Redis is recognized as already-persisted.
    for (const e of h) this.markSeen(runId, e.event_id);

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

    // Mark seen BEFORE persist so a concurrent at-least-once ingest() of the
    // same event_id is deduped (exactly-once across in-process + Redis paths).
    this.markSeen(runId, event.event_id);
    // Persist to durable store if available
    this.store?.append(event);
    h.push(event);

    // Notify global observers, then run-specific subscribers
    for (const sub of this.observers) sub(event);
    for (const sub of this.subscribers.get(runId) ?? []) sub(event);

    return event;
  }

  /**
   * Ingest an already-created canonical event arriving from at-least-once
   * transport (BullMQ/Redis QueueEvents progress). This is the SINK side of the
   * queue bridge — it never re-publishes the event back to BullMQ.
   *
   * Guarantees:
   *  - preserve event_id, sequence, trace/correlation fields (event used AS-IS,
   *    never regenerated);
   *  - reject malformed events;
   *  - deduplicate by event_id (at-least-once delivery → exactly-once persist +
   *    exactly-once observer/subscriber notification), shared with emit();
   *  - maintain ordered history;
   *  - never reset the per-run sequence — future emit() continues from the
   *    high-water mark, so a resumed run never duplicates sequence numbers;
   *  - never re-publish to BullMQ.
   */
  ingest(event: ProcessingEvent): boolean {
    if (
      !event ||
      !event.event_id ||
      typeof event.sequence !== "number" ||
      !event.run_id
    ) {
      return false;
    }
    const runId = event.run_id;
    this.load(runId); // ensure history + seen are populated from durable store
    if (this.hasSeen(runId, event.event_id)) return false; // duplicate delivery
    this.markSeen(runId, event.event_id);
    try {
      this.store?.append(event);
    } catch {
      // Store rejected (concurrent persist / ordering) — another path already
      // durably stored it; treat as already-persisted and do not double-notify.
      return false;
    }
    this.history.get(runId)!.push(event);
    // Advance the high-water sequence so a later emit() continues, never resets.
    if (event.sequence > (this.sequence.get(runId) ?? 0)) {
      this.sequence.set(runId, event.sequence);
    }
    // Recover the trace id from the ingested event if not already known.
    if (!this.traceIds.has(runId) && event.traceparent) {
      const parts = event.traceparent.split("-");
      if (parts.length === 4) this.traceIds.set(runId, parts[1]);
    }
    // Notify observers + run-specific subscribers (SSE / RunRepository / Task).
    for (const sub of this.observers) sub(event);
    for (const sub of this.subscribers.get(runId) ?? []) sub(event);
    return true;
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
