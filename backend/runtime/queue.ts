/**
 * OneShot BullMQ Queue + Worker integration.
 *
 * Architecture role: BullMQ = scheduling and execution lifecycle ONLY.
 *   - Redis = BullMQ infrastructure + live queue transport.
 *   - RunRepository = durable, replayable OneShot history (source of truth).
 *   - ProcessingEventBus = domain/workflow events (per-run W3C trace context).
 *
 * The Worker reconstructs the canonical WorkflowRuntime per job from durable
 * state (RunRepository / event store / artifact store), runs the canonical
 * workflow, and emits live progress into the shared ProcessingEventBus — which
 * fans out to in-process SSE subscribers and the durable event store.
 *
 * Provider binding happens PER RUN inside the worker, immediately before the
 * canonical workflow consumes the provider. Credentials never enter job
 * payloads, Redis values, progress payloads, or event data.
 *
 * Single-process default: server and worker share the in-process event bus so
 * SSE replay/subscription semantics are unchanged. The worker entry point
 * (`backend/scripts/run-worker-cli.ts`) can be detached later without code
 * changes.
 *
 * BullMQ v6 semantics honored here:
 *   - Queue/Worker/QueueEvents re-emit backend/connection errors as 'error'
 *     events; every instance gets a listener so the process never crashes.
 *   - Readiness is `waitUntilReady()`, raced against a timeout.
 *   - Queue names must not contain ':'.
 */

import { Queue, Worker, QueueEvents, type Job } from "bullmq";
import type { Prompt, ProcessingEvent, RootCause } from "../contracts/schema/types.js";
import type { RunRepository } from "./run-repository.js";
import type { ProcessingEventBus } from "./event-bus.js";
import type { WorkflowRuntime } from "./workflow-runtime.js";
import type { ResearchProvider } from "../role/researcher/provider.js";
import { WorkflowRootCauseError } from "../core/root-cause-error.js";
import {
  closeSharedRedis,
  getProducerRedis,
  getSharedRedis,
  onRedisError,
} from "./redis-connection.js";

/** Colon-free queue name (BullMQ v6 forbids ':' in queue names). */
export const RUN_QUEUE_NAME = "run" as const;

/**
 * Redis key prefix for environment isolation. BullMQ Redis keys become
 * `${prefix}:${queueName}:*` (e.g. `oneshot:run:*`). Override with the
 * ONESHOT_QUEUE_PREFIX env var to isolate multiple environments that share
 * one Redis instance. The queue NAME stays colon-free ("run"); only the
 * Redis key namespace uses the colon separator.
 */
export const QUEUE_PREFIX = process.env.ONESHOT_QUEUE_PREFIX || "oneshot";

/**
 * Versioned run-job payload contract (v1). Enqueued jobs MUST NOT carry secrets
 * — only run identity, the prompt, a non-secret provider selector, and a
 * timestamp. Provider binding + credential resolution happen PER RUN inside the
 * worker, never from the payload.
 */
export const RUN_JOB_VERSION = 1 as const;

export interface RunJobProviderV1 {
  id: string;
  model?: string;
  configRevision?: number;
}

export interface RunJobV1 {
  version: 1;
  runId: string;
  prompt: Prompt;
  provider: RunJobProviderV1;
  submittedAt: string;
}

/**
 * Queue envelope. Carries the v1 versioned payload; `providerId`/`revision` are
 * retained as a legacy (pre-v1) shape so a detached worker can drain jobs
 * enqueued before a rolling upgrade. Either shape is validated at the boundary.
 */
export interface RunJobData {
  /** Versioned payload marker. Absent = legacy pre-v1 job (back-compat). */
  version?: 1;
  runId: string;
  prompt: Prompt;
  /** Legacy: provider id at enqueue time. v1: use `provider.id`. */
  providerId?: string;
  /** Legacy: provider config revision. v1: use `provider.configRevision`. */
  revision?: number;
  /** v1 structured provider block (non-secret selector). */
  provider?: RunJobProviderV1;
  /** v1: ISO timestamp the run was submitted. */
  submittedAt?: string;
}

const SECRET_FIELD_RE = /(?:api[_-]?key|authorization|bearer|password|token|secret|credential|value)/i;

/**
 * Validate a run-job payload at the worker boundary. Accepts the v1 versioned
 * shape OR the legacy `{runId, prompt, providerId, revision}` shape. Rejects
 * malformed jobs (missing runId/prompt, secret-shaped fields, unsupported
 * version, incomplete v1 fields). Returns human-readable errors for a clear
 * root-cause event on rejection.
 */
export function validateRunJobV1(data: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data || typeof data !== "object") {
    return { ok: false, errors: ["payload is not an object"] };
  }
  const d = data as Record<string, unknown>;
  for (const k of Object.keys(d)) {
    if (SECRET_FIELD_RE.test(k)) {
      errors.push(`secret-shaped field "${k}" must not be present in the job payload`);
    }
  }
  if (typeof d.runId !== "string" || !d.runId) {
    errors.push("runId must be a non-empty string");
  }
  if (!d.prompt || typeof d.prompt !== "object") {
    errors.push("prompt must be an object");
  }
  // v1 strict fields apply only when the version marker is present.
  if (d.version !== undefined) {
    if (d.version !== 1) {
      errors.push(`unsupported payload version ${String(d.version)} (expected 1)`);
    }
    if (!d.provider || typeof d.provider !== "object") {
      errors.push("v1 payload requires a provider object");
    } else {
      const p = d.provider as Record<string, unknown>;
      if (typeof p.id !== "string" || !p.id) {
        errors.push("provider.id must be a non-empty string");
      }
      if (p.model !== undefined && typeof p.model !== "string") {
        errors.push("provider.model must be a string");
      }
      if (p.configRevision !== undefined && typeof p.configRevision !== "number") {
        errors.push("provider.configRevision must be a number");
      }
    }
    if (typeof d.submittedAt !== "string" || !d.submittedAt) {
      errors.push("submittedAt must be a non-empty string");
    }
  }
  return { ok: errors.length === 0, errors };
}

export interface RunJobResult {
  runId: string;
  status: "completed" | "failed";
}

export type RunJobState =
  | "waiting"
  | "delayed"
  | "active"
  | "completed"
  | "failed"
  | "unknown";

export interface RunQueue {
  addRun(job: {
    runId: string;
    prompt: Prompt;
    providerId: string;
    revision: number;
    model?: string;
  }): Promise<{ jobId: string }>;
  getJob(runId: string): Promise<Job<RunJobData> | undefined>;
  getJobState(runId: string): Promise<RunJobState>;
  /** Safe operational counts for GET /api/runtime/queue (no Redis credentials). */
  getJobCounts?(): Promise<RunQueueJobCounts>;
  ready(timeoutMs?: number): Promise<void>;
  close(): Promise<void>;
}

/** Operational queue counts (never includes Redis connection details). */
export interface RunQueueJobCounts {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
}

export interface RunQueueDeps {
  runs: RunRepository;
  events: ProcessingEventBus;
  /** Factory that builds a fresh WorkflowRuntime for a job (per-run binding). */
  createRuntime: (provider: ResearchProvider) => Promise<WorkflowRuntime>;
  /** Resolves the provider for a given providerId (per-run binding).
   * `modelOverride` pins the model captured when the run was queued so a
   * later runtime-config change cannot drift an already-queued run. */
  resolveProvider: (
    providerId: string,
    events: ProcessingEventBus,
    runId: string,
    modelOverride?: string,
  ) => Promise<ResearchProvider>;
  projectRoot: string;
}

/** Minimal structural view of a BullMQ job (keeps executeRunJob unit-testable). */
export interface RunJobLike {
  data: RunJobData;
  updateProgress(progress: number | object): Promise<void>;
}

/** Remove secret-shaped material and newlines from a message before logging. */
export function redactSecrets(input: string): string {
  const oneLine = input.replace(/[\r\n]+/g, " ");
  return oneLine
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .replace(
      /(?:api[_-]?key|authorization|bearer|password|token)"?\s*[:=]\s*"?[^",;\s}]+/gi,
      "[REDACTED]",
    );
}

function firstLine(input: string, max = 400): string {
  const line = redactSecrets(input).trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Deduped queue-component error logger. ioredis reconnects rapidly while Redis
 * is persistently offline and BullMQ re-emits each failed-attempt 'error' to the
 * Queue, QueueEvents, and Worker. Without dedupe this floods stderr with
 * thousands of identical lines (observed: ~19k "connect ECONNREFUSED 127.0.0.1:6379"
 * in a single smoke run). Log the FIRST occurrence of each distinct message per
 * component, then suppress repeats until the message changes; a recurring or
 * different error is logged again so real error transitions are never hidden.
 */
const lastQueueErrorMessage: Record<string, string> = {};
function logQueueError(component: string, err: Error): void {
  const msg = firstLine(String(err?.message || err));
  if (!msg || lastQueueErrorMessage[component] === msg) return;
  lastQueueErrorMessage[component] = msg;
  console.warn(`[queue:${component}] ${msg}`);
}

/**
 * Concrete BullMQ-backed run queue.
 *
 * Enqueued job payloads contain only `runId`, `prompt`, `providerId`,
 * `revision` — never credentials and never provider responses.
 */
export class BullMQRunQueue implements RunQueue {
  private readonly queue: Queue<RunJobData>;
  private readonly queueEvents: QueueEvents;
  private readonly worker: Worker<RunJobData>;
  private readonly deps: RunQueueDeps;
  private closed = false;

  constructor(
    name: string,
    deps: RunQueueDeps,
    opts: { concurrency?: number } = {},
  ) {
    if (name.includes(":")) {
      throw new Error("Run queue name must not contain ':' (BullMQ v6 rule)");
    }
    this.deps = deps;

    // One shared ioredis instance for Worker + QueueEvents (blocking
    // consumers), plus a dedicated producer connection with the offline queue
    // disabled so enqueues fail fast when Redis is unreachable. Both already
    // carry 'error' listeners (see redis-connection.ts), so connection
    // failures never crash the process.
    const connection = getSharedRedis();
    const producerConnection = getProducerRedis();

    this.queue = new Queue<RunJobData>(name, {
      connection: producerConnection,
      prefix: QUEUE_PREFIX,
    });
    this.queueEvents = new QueueEvents(name, { connection, prefix: QUEUE_PREFIX });
    this.worker = new Worker<RunJobData>(
      name,
      async (job) => this.processRun(job),
      {
        connection,
        concurrency: opts.concurrency ?? 1,
        lockDuration: 60_000, // runs are long; keep the lock generous
        // Stalled-job recovery: check every 30s; re-deliver a stalled job once.
        // On re-dequeue executeRunJob's guards apply (terminal→skip, partial→
        // ROOT_CAUSE), so a stalled run is never blindly re-executed.
        stalledInterval: 30_000,
        maxStalledCount: 1,
        prefix: QUEUE_PREFIX,
      },
    );

    // BullMQ re-emits backend/connection errors — handle them everywhere so
    // an offline Redis degrades gracefully instead of crashing the process.
    // (Registrations are separate: the listener signatures differ per class.)
    // Errors are DEDUPED per component (see logQueueError): a persistently
    // offline Redis reconnects rapidly and would otherwise flood stderr with
    // thousands of identical ECONNREFUSED lines.
    this.queue.on("error", (err: Error) => logQueueError("queue", err));
    this.queueEvents.on("error", (err: Error) =>
      logQueueError("queue-events", err),
    );
    this.worker.on("error", (err: Error) => logQueueError("worker", err));

    this.worker.on("failed", (job, err) => {
      const safe = firstLine(String(err?.message || err));
      console.error(`[queue] run ${job?.data?.runId ?? "?"} failed: ${safe}`);
    });

    // QueueEvents: live queue bridge. Progress payloads from the worker carry
    // canonical ProcessingEvents ({kind:"processing-event", event}); ingest them
    // into the shared bus. ingest() dedups by event_id, so in Stage A (shared
    // in-process bus) this is exactly-once even though the event was already
    // delivered in-process. In Stage B (detached worker) this IS the transport.
    this.queueEvents.on("progress", (arg) => {
      const data = (arg as unknown as { data?: unknown }).data;
      if (
        data &&
        typeof data === "object" &&
        (data as { kind?: string }).kind === "processing-event"
      ) {
        const ev = (data as { event?: ProcessingEvent }).event;
        if (ev) deps.events.ingest(ev);
      }
    });

    // A BullMQ "failed" event with no workflow terminal result means the worker
    // never produced one (e.g. a crash before/at processRun). Finalize the run as
    // ROOT_CAUSE so it is never left dangling as "running" (no ghost run). Raw
    // reasons stay in server logs; only the safe one-line issue reaches the UI.
    this.queueEvents.on("failed", (arg) => {
      const jobId = (arg as unknown as { jobId?: string }).jobId;
      const reason = (arg as unknown as { failedReason?: unknown }).failedReason;
      if (!jobId) return;
      const snap = deps.runs.get(jobId);
      if (snap && !snap.result) {
        const rootCause: RootCause = {
          issue: firstLine(`Queue job failed: ${String(reason ?? "unknown")}`),
          expected: "Run completes or fails with a terminal result",
          actual: firstLine(
            `BullMQ job ${jobId} moved to failed without a workflow terminal result`,
          ),
          evidence_ids: [],
          required_correction:
            "Inspect the run events and server-side worker logs, then retry the run",
          recheck_target: jobId,
        };
        deps.runs.finish(jobId, "ROOT_CAUSE", undefined, rootCause);
        deps.events.emit(jobId, "RunWorker", "COMPLETE", {
          scope: "SUPPORT",
          result: "ROOT_CAUSE",
          message: rootCause.issue,
        });
      }
    });

    // "stalled" = the worker's lock expired mid-run (slow/crashed worker). Do
    // NOT finalize here — BullMQ re-delivers and executeRunJob's partial-recovery
    // guard decides (attempts=1, no silent restart from the beginning).
    this.queueEvents.on("stalled", (arg) => {
      const jobId = (arg as unknown as { jobId?: string }).jobId;
      console.warn(
        `[queue] run ${jobId ?? "?"} stalled — re-delivering (partial-recovery guard applies on re-dequeue)`,
      );
    });
  }

  async addRun(job: {
    runId: string;
    prompt: Prompt;
    providerId: string;
    revision: number;
    model?: string;
  }): Promise<{ jobId: string }> {
    // Versioned v1 payload — no secrets. jobId = runId (BullMQ dedups by jobId,
    // so re-submitting the same runId never creates a duplicate queue entry).
    const payload: RunJobV1 = {
      version: RUN_JOB_VERSION,
      runId: job.runId,
      prompt: job.prompt,
      provider: {
        id: job.providerId,
        ...(job.model ? { model: job.model } : {}),
        ...(job.revision ? { configRevision: job.revision } : {}),
      },
      submittedAt: new Date().toISOString(),
    };
    // Fail fast when Redis is unreachable instead of parking the HTTP request
    // in ioredis's offline queue. The HTTP layer decides 503 vs inline fallback.
    const add = this.queue.add("oneshot-run", payload, {
      jobId: job.runId,
      removeOnComplete: { age: 60 * 60, count: 500 },
      removeOnFail: { age: 60 * 60, count: 500 },
      attempts: 1,
    });
    await Promise.race([
      add,
      rejectAfter(5_000, "redis run queue unavailable (enqueue timeout)"),
    ]);
    return { jobId: job.runId };
  }

  async getJob(runId: string): Promise<Job<RunJobData> | undefined> {
    return this.queue.getJob(runId);
  }

  async getJobState(runId: string): Promise<RunJobState> {
    const job = await this.queue.getJob(runId);
    if (!job) return "unknown";
    const state = await job.getState();
    if (
      state === "completed" ||
      state === "failed" ||
      state === "active" ||
      state === "waiting" ||
      state === "delayed"
    ) {
      return state;
    }
    return "unknown";
  }

  async getJobCounts(): Promise<RunQueueJobCounts> {
    const c = await this.queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "completed",
      "failed",
    );
    return {
      waiting: c.waiting ?? 0,
      active: c.active ?? 0,
      delayed: c.delayed ?? 0,
      completed: c.completed ?? 0,
      failed: c.failed ?? 0,
    };
  }

  /**
   * Resolve when the worker backend connection is live, or reject after the
   * timeout so bootstrap can degrade to inline execution.
   */
  async ready(timeoutMs = 8_000): Promise<void> {
    await Promise.race([
      this.worker.waitUntilReady(),
      rejectAfter(timeoutMs, "redis run queue unavailable (worker timeout)"),
    ]);
  }

  /** The canonical workflow execution for a dequeued run. */
  private async processRun(job: Job<RunJobData>): Promise<RunJobResult> {
    return executeRunJob(job, this.deps);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.worker.close();
    } catch {
      /* ignore */
    }
    try {
      await this.queueEvents.close();
    } catch {
      /* ignore */
    }
    try {
      await this.queue.close();
    } catch {
      /* ignore */
    }
    closeSharedRedis();
  }
}

/** Re-export for bootstrap listeners (sanitized shared-connection errors). */
export { onRedisError };

/**
 * Canonical execution of one dequeued run. Exported so the execution contract
 * is unit-testable without a live Redis connection (the BullMQ Worker delegates
 * here via `processRun`).
 *
 * Guarantees:
 *  - Provider binding happens per run, immediately before the workflow runs.
 *  - No credential material is ever logged, emitted, or placed in progress.
 *  - Infrastructure failures are durably finalized as ROOT_CAUSE in
 *    RunRepository (never left dangling as "running" in BullMQ alone).
 *  - Already-finalized runs are never re-executed (idempotency guard).
 */
export async function executeRunJob(
  job: RunJobLike,
  deps: RunQueueDeps,
): Promise<RunJobResult> {
  const data = job.data;
  const runId = typeof data.runId === "string" ? data.runId : "unknown";
  // Provider selector from either the v1 (`provider.{id,configRevision}`) or
  // legacy (`providerId`/`revision`) shape.
  const providerId = data.providerId ?? data.provider?.id ?? "sample";
  const revision = data.revision ?? data.provider?.configRevision ?? 0;
  const prompt = data.prompt;

  // The run snapshot is created by the HTTP layer; ensure it exists so a
  // detached worker against a shared .runtime directory still works.
  if (runId !== "unknown" && !deps.runs.get(runId)) deps.runs.create(runId);

  const finalizeFailure = (issue: string, actual: string): void => {
    const rootCause: RootCause = {
      issue: firstLine(issue),
      expected: "Canonical workflow completes without infrastructure errors",
      actual: firstLine(actual),
      evidence_ids: [],
      required_correction:
        "Inspect the run events, fix the reported condition, then retry the run",
      recheck_target: runId,
    };
    const snapshot = deps.runs.get(runId);
    if (snapshot && !snapshot.result) {
      deps.runs.finish(runId, "ROOT_CAUSE", undefined, rootCause);
    }
    deps.events.emit(runId, "RunWorker", "COMPLETE", {
      scope: "SUPPORT",
      result: "ROOT_CAUSE",
      message: rootCause.issue,
    });
  };

  // Worker-boundary validation: reject malformed jobs with a clear root-cause
  // event. Never execute a job whose payload fails the versioned contract.
  const validation = validateRunJobV1(data);
  if (!validation.ok) {
    finalizeFailure(
      `Malformed run job payload: ${validation.errors.join("; ")}`,
      `Rejected at worker boundary (version=${data.version ?? "none"})`,
    );
    return { runId, status: "failed" };
  }

  // Forward every canonical event to BullMQ progress as the live queue bridge:
  //   emit -> job.updateProgress({kind:"processing-event", event}) -> Redis ->
  //   QueueEvents progress -> ProcessingEventBus.ingest(event) -> RunRepo/SSE.
  // ingest() dedups by event_id, so in Stage A (shared in-process bus) delivery
  // is exactly-once; in Stage B (detached worker) this IS the transport.
  const unsub = deps.events.subscribe(runId, (e) => {
    job.updateProgress({ kind: "processing-event", event: e }).catch(() => {});
  });
  try {
    // Idempotency guard: a durably-finalized run is never re-executed (e.g. an
    // enqueue that timed out on the producer side but still landed, or a
    // replayed job after restart).
    const existing = deps.runs.get(runId);
    if (existing?.result) {
      deps.events.emit(runId, "RunWorker", "COMPLETE", {
        scope: "SUPPORT",
        result: existing.result,
        message: `Run already finalized (${existing.result}); queue execution skipped`,
      });
      return {
        runId,
        status: existing.result === "PASSED" ? "completed" : "failed",
      };
    }

    // Partial-execution recovery guard: a run with events but no result was
    // partially executed (e.g. a prior worker crashed mid-workflow, or a
    // stalled job was redelivered). The canonical workflow creates artifacts
    // and state, so silently restarting from the beginning could duplicate
    // side effects. attempts=1 means no auto-retry; refuse + finalize.
    if (existing && !existing.result && existing.events.length > 0) {
      finalizeFailure(
        `Run ${runId} is partially executed (${existing.events.length} events, no result); refusing to silently restart from the beginning`,
        "Partial execution detected on re-dequeue; explicit recovery policy required (attempts=1, no automatic retry)",
      );
      return { runId, status: "failed" };
    }

    // Provider binding happens PER RUN, immediately before the workflow. This
    // PROVES provider readiness before Researcher consumes the provider:
    //   capture provider selection (job metadata) → resolve credential
    //   server-side → prove readiness (provider constructed) → ProviderBinding
    //   event → Researcher. A readiness failure is surfaced as a ProviderBinding
    //   ROOT_CAUSE event carrying the REAL root cause — never hidden behind a
    //   generic "Run worker failure" / BullMQ failure message. The provider is
    //   bound ONCE here; an already-active run is never re-bound mid-workflow.
    let provider: ResearchProvider;
    try {
      provider = await deps.resolveProvider(
        providerId,
        deps.events,
        runId,
        data.provider?.model,
      );
    } catch (err) {
      const wrc = err instanceof WorkflowRootCauseError
        ? err.rootCause
        : undefined;
      const actual = wrc?.actual ??
        (err instanceof Error ? err.message : String(err));
      const issue = wrc?.issue ??
        "Provider binding failed before the workflow could execute";
      deps.events.emit(runId, "ProviderBinding", "COMPLETE", {
        scope: "SUPPORT",
        result: "ROOT_CAUSE",
        message: firstLine(actual),
      });
      finalizeFailure(issue, actual);
      return { runId, status: "failed" };
    }

    deps.events.emit(runId, "ProviderBinding", "COMPLETE", {
      scope: "SUPPORT",
      message: `Provider bound; credentials resolved server-side; ready for Researcher (requested=${providerId}, revision=${revision})`,
    });

    deps.events.emit(runId, "RunWorker", "RUNNING", {
      scope: "SUPPORT",
      message: `Run dequeued for execution (provider=${providerId}, revision=${revision})`,
    });

    const runtime = await deps.createRuntime(provider);
    await runtime.run(runId, prompt);

    const snapshot = deps.runs.get(runId);
    const result = snapshot?.result;
    deps.events.emit(runId, "RunWorker", "COMPLETE", {
      scope: "SUPPORT",
      message: `Run finished: ${result ?? "UNKNOWN"}`,
      result,
    });
    return { runId, status: result === "PASSED" ? "completed" : "failed" };
  } catch (err) {
    // Preserve the real root cause for any WorkflowRootCauseError (e.g. a
    // provider/infrastructure failure) — never hide it behind a generic
    // "Run worker failure" / BullMQ failure message.
    if (err instanceof WorkflowRootCauseError) {
      finalizeFailure(err.rootCause.issue, err.rootCause.actual);
    } else {
      const safe = firstLine(err instanceof Error ? err.message : String(err));
      finalizeFailure(`Run worker failure: ${safe}`, safe);
    }
    return { runId, status: "failed" };
  } finally {
    unsub();
  }
}
