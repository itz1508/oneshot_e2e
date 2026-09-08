import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type {
  HashProof,
  ProcessingEvent,
  RootCause,
  RunSnapshot,
  IssueType,
  TestResult,
} from "../contracts/schema/types.js";
import type { HelpRequest } from "../intent/types.js";

/**
 * In-memory + disk-persistent run snapshot repository.
 * Atomic writes via tmp+rename with Windows lock fallback.
 */
export class RunRepository {
  private runs = new Map<string, RunSnapshot>();
  /**
   * Last-known disk mtime per run. The API server and the pipeline worker are
   * separate processes sharing this directory; when the worker terminalizes a
   * run on disk, the server must reload it instead of serving its stale
   * in-memory copy.
   */
  private diskMtimes = new Map<string, number>();

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
    } catch (error) {
      try {
        writeFileSync(p, content, "utf8");
      } catch {
        throw error;
      }
    }
    this.noteDiskVersion(p);
  }

  /** Record the on-disk mtime so cross-process updates are detected. */
  private noteDiskVersion(p: string): void {
    try {
      this.diskMtimes.set(p, statSync(p).mtimeMs);
    } catch {
      /* the file may have been renamed concurrently; get() re-checks */
    }
  }

  create(runId: string): RunSnapshot {
    const r: RunSnapshot = {
      run_id: runId,
      pipeline_status: "Running",
      events: [],
      artifacts: {},
    };
    this.runs.set(runId, r);
    this.persist(r);
    return r;
  }

  get(runId: string): RunSnapshot | undefined {
    const p = this.path(runId);

    /*
     * Multi-process reload: another process (the pipeline worker) may have
     * terminalized this run on disk after this process cached it. When the
     * file is newer than the cached copy, reload from disk.
     */
    if (p && existsSync(p)) {
      let diskMtime = 0;
      try {
        diskMtime = statSync(p).mtimeMs;
      } catch {
        /* raced with a tmp+rename; fall back to the cached copy */
      }
      const cached = this.runs.get(runId);
      const known = this.diskMtimes.get(p) ?? 0;
      if (!cached || diskMtime > known) {
        try {
          const candidate = JSON.parse(
            readFileSync(p, "utf8"),
          ) as Partial<RunSnapshot>;
          if (
            candidate.pipeline_status !== "Running" &&
            candidate.pipeline_status !== "Done"
          ) {
            return undefined;
          }
          const r = candidate as RunSnapshot;
          this.runs.set(runId, r);
          this.diskMtimes.set(p, diskMtime || Date.now());
          return r;
        } catch {}
      }
      if (cached) return cached;
    }

    return this.runs.get(runId);
  }

  require(runId: string): RunSnapshot {
    const r = this.get(runId);
    if (!r) throw new Error(`Unknown run ${runId}`);
    return r;
  }

  /** Enumerate actual persisted runs; browser storage is not the history ledger. */
  list(): RunSnapshot[] {
    const ids = new Set(this.runs.keys());
    if (this.root && existsSync(this.root)) {
      for (const name of readdirSync(this.root)) {
        if (name.endsWith(".json")) ids.add(name.slice(0, -5));
      }
    }
    return [...ids]
      .map((id) => this.get(id))
      .filter((run): run is RunSnapshot => Boolean(run))
      .sort((a, b) =>
        (b.events.at(-1)?.created_at ?? "").localeCompare(
          a.events.at(-1)?.created_at ?? "",
        ),
      );
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

  /**
   * Remove an invalidated artifact entry from the snapshot.
   *
   * Used by plan/phase/task edit scopes to reset downstream state for the
   * current plan revision. Historical event evidence is never touched.
   */
  removeArtifact(runId: string, name: string): void {
    const r = this.require(runId);
    if (name in r.artifacts) {
      delete r.artifacts[name];
      this.persist(r);
    }
  }

  finish(
    runId: string,
    testResult: TestResult,
    hashProof?: HashProof,
    rootCause?: RootCause,
    helpRequest?: HelpRequest,
    issueType?: IssueType,
  ): RunSnapshot {
    if (testResult === "Failed" && !rootCause) {
      throw new Error("Failed finalization requires structured issue evidence");
    }
    if (testResult === "Passed" && (rootCause || issueType)) {
      throw new Error("Passed finalization cannot carry issue fields");
    }
    const r = this.require(runId);
    r.pipeline_status = "Done";
    r.test_result = testResult;
    r.hash_proof = hashProof;
    r.root_cause = rootCause;
    r.issue_type = rootCause ? (issueType ?? "Root Cause") : undefined;
    r.help_request = helpRequest;
    this.persist(r);
    return r;
  }
}
