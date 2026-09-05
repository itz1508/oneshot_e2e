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
  HashProof,
  ProcessingEvent,
  RootCause,
  RunSnapshot,
  WorkflowResult,
} from "../contracts/schema/types.js";
import type { HelpRequest } from "../intent/types.js";

/**
 * In-memory + disk-persistent run snapshot repository.
 * Atomic writes via tmp+rename with Windows lock fallback.
 */
export class RunRepository {
  private runs = new Map<string, RunSnapshot>();

  constructor(private root?: string) {
    if (root) mkdirSync(root, { recursive: true });
  }

  private path(runId: string): string | undefined {
    return this.root ? join(this.root, `${runId}.json`) : undefined;
  }

  private persist(r: RunSnapshot): void {
    const p = this.path(r.run_id);
    if (!p) return;
    mkdirSync(dirname(p), { recursive: true });
    const content = JSON.stringify(r, null, 2) + "\n";
    const tmp = `${p}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
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
  }

  create(runId: string): RunSnapshot {
    const r: RunSnapshot = { run_id: runId, events: [], artifacts: {} };
    this.runs.set(runId, r);
    this.persist(r);
    return r;
  }

  get(runId: string): RunSnapshot | undefined {
    let r = this.runs.get(runId);
    if (r) return r;
    const p = this.path(runId);
    if (p && existsSync(p)) {
      try {
        r = JSON.parse(readFileSync(p, "utf8")) as RunSnapshot;
        this.runs.set(runId, r);
        return r;
      } catch {}
    }
    return undefined;
  }

  require(runId: string): RunSnapshot {
    const r = this.get(runId);
    if (!r) throw new Error(`Unknown run ${runId}`);
    return r;
  }

  event(runId: string, event: ProcessingEvent): void {
    const r = this.require(runId);
    r.events.push(event);
    r.current_processor = event.processor;
    this.persist(r);
  }

  artifact(runId: string, name: string, path: string): void {
    const r = this.require(runId);
    r.artifacts[name] = path;
    this.persist(r);
  }

  finish(
    runId: string,
    result: WorkflowResult,
    hashProof?: HashProof,
    rootCause?: RootCause,
    helpRequest?: HelpRequest,
    output?: { final_output: string | null; output_step_id: string | null },
  ): RunSnapshot {
    const r = this.require(runId);
    r.result = result;
    r.hash_proof = hashProof;
    r.root_cause = rootCause;
    r.help_request = helpRequest;
    if (output) {
      r.final_output = output.final_output;
      r.output_step_id = output.output_step_id;
    }
    this.persist(r);
    return r;
  }
}
