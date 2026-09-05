import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { ProcessingEvent } from "../../contracts/schema/types.js";

function safeRunId(runId: string): string {
  return runId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Append-only processing event store.
 *
 * Each run gets its own JSONL file.  On load, the store validates
 * monotonic sequencing and rejects duplicate event IDs.  In-memory
 * cache avoids repeated disk reads after the first load.
 */
export class AppendOnlyProcessingEventStore {
  private cache = new Map<string, ProcessingEvent[]>();
  private ids = new Set<string>();

  constructor(private root: string) {
    mkdirSync(root, { recursive: true });
  }

  private path(runId: string): string {
    return join(this.root, `${safeRunId(runId)}.jsonl`);
  }

  private load(runId: string): ProcessingEvent[] {
    if (this.cache.has(runId)) return this.cache.get(runId)!;

    const p = this.path(runId);
    const events: ProcessingEvent[] = [];

    if (existsSync(p)) {
      let previous = 0;
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        if (!line.trim()) continue;
        const e = JSON.parse(line) as ProcessingEvent;

        if (this.ids.has(e.event_id)) {
          throw new Error(
            `duplicate persisted processing event ${e.event_id}`,
          );
        }
        if (e.sequence !== previous + 1) {
          throw new Error(
            `persisted processing event sequence mismatch: expected ${previous + 1}, got ${e.sequence}`,
          );
        }

        previous = e.sequence;
        events.push(e);
        this.ids.add(e.event_id);
      }
    }

    this.cache.set(runId, events);
    return events;
  }

  /** Append one event — enforces sequence monotonicity and ID uniqueness. */
  append(event: ProcessingEvent): void {
    const events = this.load(event.run_id);

    if (this.ids.has(event.event_id)) {
      throw new Error(`duplicate processing event ${event.event_id}`);
    }

    const last = events.at(-1);
    const expected = (last?.sequence ?? 0) + 1;
    if (event.sequence !== expected) {
      throw new Error(
        `processing event sequence mismatch: expected ${expected}, got ${event.sequence}`,
      );
    }

    const p = this.path(event.run_id);
    mkdirSync(dirname(p), { recursive: true });
    appendFileSync(p, JSON.stringify(event) + "\n", "utf8");

    events.push(event);
    this.ids.add(event.event_id);
  }

  /** Return a shallow copy of all events for a run. */
  list(runId: string): ProcessingEvent[] {
    return [...this.load(runId)];
  }

  /** Return the most recent event for a run, if any. */
  last(runId: string): ProcessingEvent | undefined {
    return this.load(runId).at(-1);
  }

  /** Return all run IDs that have persisted events. */
  runIds(): string[] {
    return readdirSync(this.root)
      .filter((x) => x.endsWith(".jsonl"))
      .map((x) => x.slice(0, -6));
  }
}
