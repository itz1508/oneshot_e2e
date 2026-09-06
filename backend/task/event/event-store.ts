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
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        if (!line.trim()) continue;

        let e: ProcessingEvent;
        try {
          e = JSON.parse(line) as ProcessingEvent;
        } catch {
          /*
           * Torn tail from an abrupt process death (SIGKILL / exit during a
           * crash-recovery test). Skip the unparseable remainder instead of
           * making the whole run unrecoverable.
           */
          continue;
        }

        if (!e || typeof e !== "object" || !e.event_id) continue;

        /*
         * The file is shared by the API server AND worker processes, each with
         * its own in-memory sequence counter, so cross-process interleaving can
         * produce repeated or non-consecutive sequences. Skip duplicates and
         * accept gaps — the in-memory bus dedups by event_id and continues its
         * sequence from the observed high-water mark.
         */
        if (this.ids.has(e.event_id)) continue;

        events.push(e);
        this.ids.add(e.event_id);
      }
    }

    this.cache.set(runId, events);
    return events;
  }

  /** Append one event — enforces ID uniqueness, tolerates cross-process sequences. */
  append(event: ProcessingEvent): void {
    const events = this.load(event.run_id);

    if (this.ids.has(event.event_id)) {
      throw new Error(`duplicate processing event ${event.event_id}`);
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
