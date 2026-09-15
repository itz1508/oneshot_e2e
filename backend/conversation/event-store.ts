/**
 * M15: Public event store — durable, ordered, replayable.
 *
 * Events are stored per run with monotonically increasing sequence
 * numbers. On reconnection, the client sends the last sequence it
 * received; the store replays all events after that sequence.
 *
 * The store has a TTL (default 5 minutes) so a disconnected browser
 * does not leave an uncontrolled run indefinitely.
 */
import {
  existsSync, mkdirSync, readFileSync, renameSync, writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { PublicRunEvent, StoredPublicEvent } from "./public-events.js";

function safe(v: string): string {
  return v.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class PublicEventStore {
  private memory = new Map<string, StoredPublicEvent[]>();
  private sequences = new Map<string, number>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly ttlMs: number;

  constructor(private root?: string, ttlMs = 300_000) {
    this.ttlMs = ttlMs;
    if (root) mkdirSync(root, { recursive: true });
  }

  private path(runId: string): string | undefined {
    return this.root ? join(this.root, `${safe(runId)}.events.json`) : undefined;
  }

  private load(runId: string): StoredPublicEvent[] {
    const mem = this.memory.get(runId);
    if (mem) return mem;
    const p = this.path(runId);
    if (p && existsSync(p)) {
      const v = JSON.parse(readFileSync(p, "utf8")) as StoredPublicEvent[];
      this.memory.set(runId, v);
      const maxSeq = v.reduce((m, x) => Math.max(m, x.sequence), 0);
      this.sequences.set(runId, maxSeq);
      return v;
    }
    const fresh: StoredPublicEvent[] = [];
    this.memory.set(runId, fresh);
    this.sequences.set(runId, 0);
    return fresh;
  }

  private persist(runId: string, events: StoredPublicEvent[]): void {
    const p = this.path(runId);
    if (!p) return;
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(events) + "\n", "utf8");
    renameSync(tmp, p);
  }

  /** Append an event and return its stored form with sequence. */
  append(runId: string, event: PublicRunEvent): StoredPublicEvent {
    const events = this.load(runId);
    const seq = (this.sequences.get(runId) ?? 0) + 1;
    this.sequences.set(runId, seq);
    const stored: StoredPublicEvent = {
      sequence: seq,
      event,
      timestamp: new Date().toISOString(),
    };
    events.push(stored);
    this.persist(runId, events);
    this.resetTtl(runId);
    return stored;
  }

  /** Replay events after the given last sequence (0 = all). */
  replay(runId: string, afterSequence = 0): StoredPublicEvent[] {
    return this.load(runId).filter((e) => e.sequence > afterSequence);
  }

  /** Get all events for a run. */
  list(runId: string): StoredPublicEvent[] {
    return [...this.load(runId)];
  }

  /** Cancel the TTL timer and clean up. */
  close(runId: string): void {
    const timer = this.timers.get(runId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(runId);
    }
  }

  /** Delete all events for a run. */
  delete(runId: string): void {
    this.close(runId);
    this.memory.delete(runId);
    this.sequences.delete(runId);
  }

  private resetTtl(runId: string): void {
    const existing = this.timers.get(runId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.close(runId);
      this.delete(runId);
    }, this.ttlMs);
    timer.unref?.();
    this.timers.set(runId, timer);
  }
}
