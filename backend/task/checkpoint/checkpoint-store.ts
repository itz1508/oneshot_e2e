import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type {
  ProcessingEvent,
  ProcessingScope,
  RunSnapshot,
} from "../../contracts/schema/types.js";
import { CANONICAL_PROCESSORS } from "../guard/ordering.js";

/** Persisted checkpoint — captures the last completed processor and what's next. */
export interface TaskCheckpoint {
  run_id: string;
  event_sequence: number;
  last_processor: string;
  next_processor?: string;
  scope: ProcessingScope;
  artifacts: Record<string, string>;
  updated_at: string;
}

function safeRunId(runId: string): string {
  return runId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Per-run JSON checkpoint store.
 * Only writes on WORKFLOW-scope COMPLETE events — support and ADK events
 * do not update the canonical checkpoint.
 */
export class CheckpointStore {
  constructor(private root: string) {
    mkdirSync(root, { recursive: true });
  }

  private path(runId: string): string {
    return join(this.root, `${safeRunId(runId)}.json`);
  }

  update(
    event: ProcessingEvent,
    snapshot: RunSnapshot,
  ): TaskCheckpoint | undefined {
    // Only track canonical workflow completions
    if (event.scope !== "WORKFLOW" || event.state !== "COMPLETE") return;

    const i = CANONICAL_PROCESSORS.indexOf(event.processor);
    const next =
      i >= 0 && i + 1 < CANONICAL_PROCESSORS.length
        ? CANONICAL_PROCESSORS[i + 1]
        : undefined;

    const cp: TaskCheckpoint = {
      run_id: event.run_id,
      event_sequence: event.sequence,
      last_processor: event.processor,
      next_processor: next,
      scope: event.scope,
      artifacts: { ...snapshot.artifacts },
      updated_at: event.created_at,
    };

    const p = this.path(event.run_id);
    const content = JSON.stringify(cp, null, 2) + "\n";
    const tmp = `${p}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    mkdirSync(dirname(p), { recursive: true });
    try {
      writeFileSync(tmp, content, "utf8");
      try {
        renameSync(tmp, p);
      } catch (err: any) {
        if (
          err?.code === "EPERM" ||
          err?.code === "EBUSY" ||
          err?.code === "EEXIST"
        ) {
          writeFileSync(p, content, "utf8");
          try {
            unlinkSync(tmp);
          } catch {}
        } else {
          throw err;
        }
      }
    } catch {
      try {
        writeFileSync(p, content, "utf8");
      } catch {}
    }

    return cp;
  }

  get(runId: string): TaskCheckpoint | undefined {
    const p = this.path(runId);
    if (!existsSync(p)) return undefined;
    try {
      return JSON.parse(readFileSync(p, "utf8")) as TaskCheckpoint;
    } catch {
      return undefined;
    }
  }
}
