import test from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startHttpServer } from "../../server/http-server.js";
import { ProcessingEventBus } from "../../runtime/event-bus.js";
import { RunRepository } from "../../runtime/run-repository.js";
import { AppendOnlyProcessingEventStore } from "../../task/event/event-store.js";
import {
  executeRunJob,
  validateRunJobV1,
  type RunJobLike,
  type RunQueue,
  type RunQueueJobCounts,
  type RunJobState,
} from "../../runtime/queue.js";
import type { Prompt, ProcessingEvent } from "../../contracts/schema/types.js";
import { FileArtifactStore } from "../../runtime/artifact-store.js";
import { WorkflowRootCauseError } from "../../core/root-cause-error.js";

const TOKEN = "rjc-test";
const AUTH = { Authorization: `Bearer ${TOKEN}` };

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections?.();
  await new Promise<void>((ok, fail) =>
    server.close((e) => (e ? fail(e) : ok())),
  );
}

function makePrompt(runId: string): Prompt {
  return {
    prompt_id: `p:${runId}`,
    intent: "test",
    requested_outcome: "done",
    context: [{ context_id: `c:${runId}`, statement: "x" }],
    research_direction: ["contracts"],
  };
}

/** Fake RunQueue for HTTP cancel/queue-status tests — no Redis required. */
function fakeQueue(opts: {
  state?: RunJobState;
  hasJob?: boolean;
  counts?: RunQueueJobCounts;
}): RunQueue {
  return {
    addRun: async () => ({ jobId: "fake" }),
    getJob: (async () =>
      opts.hasJob ? ({ remove: async () => {} } as never) : undefined) as never,
    getJobState: async () => opts.state ?? "unknown",
    getJobCounts: async () =>
      opts.counts ?? {
        waiting: 0,
        active: 0,
        delayed: 0,
        completed: 0,
        failed: 0,
      },
    ready: async () => {},
    close: async () => {},
  } as unknown as RunQueue;
}

async function setupServer(opts: {
  runQueue?: RunQueue;
  queueReady?: boolean;
  events?: ProcessingEventBus;
  runs?: RunRepository;
} = {}): Promise<{
  base: string;
  server: Server;
  runs: RunRepository;
  events: ProcessingEventBus;
  cleanup: () => Promise<void>;
}> {
  const savedToken = process.env.ONESHOT_API_TOKEN;
  process.env.ONESHOT_API_TOKEN = TOKEN;
  const tmp = await mkdtemp(join(tmpdir(), "rjc-http-"));
  const uiRoot = join(tmp, "ui");
  await mkdir(uiRoot, { recursive: true });
  await writeFile(join(uiRoot, "index.html"), "<html>ok</html>");
  const events = opts.events ?? new ProcessingEventBus();
  const runs = opts.runs ?? new RunRepository(join(tmp, "run-state"));
  const server = await startHttpServer(
    {} as never,
    runs,
    events,
    uiRoot,
    0,
    undefined,
    undefined,
    undefined,
    { mode: "sample", provider: "sample", queue: true },
    { workspaceRoot: tmp },
    opts.runQueue,
    undefined,
    opts.queueReady,
  );
  const a = server.address();
  assert.ok(a && typeof a === "object");
  const base = `http://127.0.0.1:${(a as { port: number }).port}`;
  return {
    base,
    server,
    runs,
    events,
    cleanup: async () => {
      await closeServer(server);
      process.env.ONESHOT_API_TOKEN = savedToken;
      await rm(tmp, { recursive: true, force: true });
    },
  };
}

async function readSseUntil(
  res: Response,
  enough: (blocks: string[]) => boolean,
  ctrl: AbortController,
): Promise<string> {
  const reader = res.body!.getReader();
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += Buffer.from(value).toString();
      if (enough(text.split("\n\n"))) {
        ctrl.abort();
        break;
      }
    }
  } catch {
    /* aborted — expected */
  }
  return text;
}

function parseSse(text: string): { id?: string; event?: string }[] {
  return text
    .split("\n\n")
    .filter((b) => b.includes("data:"))
    .map((b) => {
      const o: { id?: string; event?: string } = {};
      for (const line of b.split("\n")) {
        if (line.startsWith("id: ")) o.id = line.slice(4);
        else if (line.startsWith("event: ")) o.event = line.slice(7);
      }
      return o;
    });
}
// ---------------------------------------------------------------------------
// Spec §1 — versioned payload + worker-boundary validation
// ---------------------------------------------------------------------------

test("validateRunJobV1 accepts v1 + legacy and rejects malformed/secret payloads", () => {
  const prompt = makePrompt("r");
  assert.ok(
    validateRunJobV1({
      version: 1,
      runId: "r",
      prompt,
      provider: { id: "sample" },
      submittedAt: "2026-01-01T00:00:00Z",
    }).ok,
  );
  assert.ok(
    validateRunJobV1({ runId: "r", prompt, providerId: "sample", revision: 1 }).ok,
  );
  assert.equal(validateRunJobV1(null).ok, false);
  assert.equal(validateRunJobV1({ runId: "r" }).ok, false);
  assert.equal(validateRunJobV1({ runId: "", prompt }).ok, false);
  assert.equal(
    validateRunJobV1({ runId: "r", prompt, apiKey: "sk-leak" }).ok,
    false,
  );
  assert.equal(validateRunJobV1({ runId: "r", prompt, value: "x" }).ok, false);
  assert.equal(
    validateRunJobV1({
      version: 2,
      runId: "r",
      prompt,
      provider: { id: "x" },
      submittedAt: "t",
    }).ok,
    false,
  );
  assert.equal(
    validateRunJobV1({ version: 1, runId: "r", prompt, submittedAt: "t" }).ok,
    false,
  );
  assert.equal(
    validateRunJobV1({ version: 1, runId: "r", prompt, provider: { id: "x" } }).ok,
    false,
  );
});

test("executeRunJob rejects malformed payloads at the worker boundary as ROOT_CAUSE (no secret leakage)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rjc-mal-"));
  try {
    const events = new ProcessingEventBus();
    const runs = new RunRepository(join(dir, "run-state"));
    const deps = {
      runs,
      events,
      projectRoot: dir,
      resolveProvider: async () => ({}) as never,
      createRuntime: async () => ({ run: async () => {} }) as never,
    } as never;
    const job: RunJobLike = {
      data: {
        runId: "mal-1",
        prompt: makePrompt("mal-1"),
        apiKey: "sk-leak-1234567890abcdef",
      } as never,
      updateProgress: async () => {},
    };
    const res = await executeRunJob(job, deps);
    assert.equal(res.status, "failed");
    const snap = runs.require("mal-1");
    assert.equal(snap.result, "ROOT_CAUSE");
    assert.match(snap.root_cause!.issue, /Malformed run job payload/);
    assert.match(snap.root_cause!.issue, /secret-shaped/);
    assert.ok(
      !JSON.stringify(events.list("mal-1")).includes("sk-leak"),
      "secret must never land in event history",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Spec §3 — partial-execution recovery guard (never silently restart)
// ---------------------------------------------------------------------------

test("executeRunJob refuses to silently restart a partially-executed run (ROOT_CAUSE, no re-run)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rjc-partial-"));
  try {
    const events = new ProcessingEventBus();
    const runs = new RunRepository(join(dir, "run-state"));
    let ran = 0;
    const deps = {
      runs,
      events,
      projectRoot: dir,
      resolveProvider: async () => ({}) as never,
      createRuntime: async () =>
        ({ run: async () => { ran++; } }) as never,
    } as never;
    const runId = "partial-1";
    runs.create(runId);
    const prior = events.emit(runId, "Researcher", "RUNNING", {
      message: "partial step",
    });
    runs.event(runId, prior);
    const job: RunJobLike = {
      data: { runId, prompt: makePrompt(runId), providerId: "sample", revision: 1 },
      updateProgress: async () => {},
    };
    const res = await executeRunJob(job, deps);
    assert.equal(res.status, "failed");
    assert.equal(ran, 0, "workflow must NOT be re-executed from the beginning");
    const snap = runs.require(runId);
    assert.equal(snap.result, "ROOT_CAUSE");
    assert.match(snap.root_cause!.issue, /partially executed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Spec §6 — ProcessingEventBus.ingest is idempotent for at-least-once delivery
// ---------------------------------------------------------------------------

test("ProcessingEventBus.ingest is idempotent (at-least-once → exactly-once; preserves id/seq/trace)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rjc-ingest-"));
  try {
    const store = new AppendOnlyProcessingEventStore(join(dir, "events"));
    const bus = new ProcessingEventBus(store);
    const observed: ProcessingEvent[] = [];
    bus.observe((e) => observed.push(e));

    const e1 = bus.emit("r", "Researcher", "RUNNING", { message: "first" });
    assert.equal(bus.ingest(e1), false, "redelivery of emitted event is deduped");

    const e2: ProcessingEvent = {
      event_id: "evt-2",
      sequence: 2,
      run_id: "r",
      scope: "WORKFLOW",
      processor: "Planner",
      state: "COMPLETE",
      created_at: "2026-01-01T00:00:00Z",
      correlation_id: "run:r",
      traceparent: "00-traceid2-spanid2-01",
    };
    assert.equal(bus.ingest(e2), true, "new event ingested");
    assert.equal(bus.ingest(e2), false, "duplicate new event deduped");
    assert.equal(bus.ingest({} as never), false, "malformed rejected");

    const persisted = store.list("r");
    assert.equal(persisted.length, 2, "exactly-once persist");
    assert.equal(persisted[0].event_id, e1.event_id);
    assert.equal(persisted[1].event_id, "evt-2");
    assert.equal(persisted[1].sequence, 2, "sequence preserved");
    assert.equal(persisted[1].traceparent, "00-traceid2-spanid2-01", "trace preserved");
    assert.equal(observed.length, 2, "observers notified once per unique event");

    const e3 = bus.emit("r", "Builder", "RUNNING", { message: "third" });
    assert.equal(e3.sequence, 3, "emit continues from high-water mark after ingest");
    assert.equal(store.list("r").length, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Spec §11 — health endpoint extension
// ---------------------------------------------------------------------------

test("GET /api/health reports redis/queue/worker/providerConfiguration; sample mode stays ok", async () => {
  const s = await setupServer();
  try {
    const h = await (
      await fetch(`${s.base}/api/health`, { headers: AUTH })
    ).json();
    assert.equal(h.status, "ok");
    assert.equal(h.redis, "disabled");
    assert.equal(h.queue, "disabled");
    assert.equal(h.worker, "disabled");
    assert.equal(h.providerConfiguration, "disabled");
    assert.equal(h.workflow, "oneshot-canonical-workflow");
    assert.equal(h.mode, "sample");
  } finally {
    await s.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Spec §10 — queue status API (never exposes Redis credentials)
// ---------------------------------------------------------------------------

test("GET /api/runtime/queue reports counts without Redis credentials", async () => {
  const s1 = await setupServer();
  try {
    const q = await (
      await fetch(`${s1.base}/api/runtime/queue`, { headers: AUTH })
    ).json();
    assert.equal(q.available, false);
    assert.equal(q.backend, "bullmq");
    assert.equal(q.redis, "disabled");
    assert.equal(q.queue, "oneshot:run");
    assert.equal(q.waiting, 0);
    assert.deepEqual(
      Object.keys(q).sort(),
      ["active", "available", "backend", "failed", "queue", "redis", "waiting"].sort(),
      "no credential-bearing fields",
    );
  } finally {
    await s1.cleanup();
  }
  const s2 = await setupServer({
    runQueue: fakeQueue({
      counts: { waiting: 2, active: 1, delayed: 0, completed: 3, failed: 0 },
    }),
    queueReady: true,
  });
  try {
    const q = await (
      await fetch(`${s2.base}/api/runtime/queue`, { headers: AUTH })
    ).json();
    assert.equal(q.available, true);
    assert.equal(q.redis, "ok");
    assert.equal(q.waiting, 2);
    assert.equal(q.active, 1);
  } finally {
    await s2.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Spec §2 / §12 — queue-required mode: 503 + no ghost run on queue unavailable
// ---------------------------------------------------------------------------

test("POST /api/runs returns 503 + finalizes the run (no ghost) when ONESHOT_QUEUE_REQUIRED and queue unavailable", async () => {
  const saved = process.env.ONESHOT_QUEUE_REQUIRED;
  process.env.ONESHOT_QUEUE_REQUIRED = "true";
  const s = await setupServer({ runQueue: fakeQueue({}), queueReady: false });
  try {
    const res = await fetch(`${s.base}/api/runs`, {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify({ intent: "x" }),
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /runtime queue unavailable/);
    const snap = s.runs.get(body.run_id);
    assert.ok(snap, "run record exists");
    assert.equal(
      snap!.result,
      "ROOT_CAUSE",
      "run finalized as queue-unavailable, not left as a permanent queued ghost",
    );
  } finally {
    process.env.ONESHOT_QUEUE_REQUIRED = saved;
    await s.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Spec §13 — cancellation: queued / active / no-queue distinctions
// ---------------------------------------------------------------------------

test("DELETE /api/runs/:id distinguishes queued / active / no-queue cancellation", async () => {
  const s1 = await setupServer();
  try {
    s1.runs.create("c1");
    const r1 = await fetch(`${s1.base}/api/runs/c1`, {
      method: "DELETE",
      headers: AUTH,
    });
    assert.equal(r1.status, 501, "no queue → cancellation unavailable");
  } finally {
    await s1.cleanup();
  }
  const s2 = await setupServer({
    runQueue: fakeQueue({ state: "waiting", hasJob: true }),
    queueReady: true,
  });
  try {
    s2.runs.create("c2");
    const r2 = await (
      await fetch(`${s2.base}/api/runs/c2`, { method: "DELETE", headers: AUTH })
    ).json();
    assert.equal(r2.canceled, true);
    assert.equal(r2.state, "queued");
  } finally {
    await s2.cleanup();
  }
  const s3 = await setupServer({
    runQueue: fakeQueue({ state: "active", hasJob: true }),
    queueReady: true,
  });
  try {
    s3.runs.create("c3");
    const r3 = await fetch(`${s3.base}/api/runs/c3`, {
      method: "DELETE",
      headers: AUTH,
    });
    assert.equal(r3.status, 501);
    assert.match((await r3.json()).error, /active cancellation not supported/);
  } finally {
    await s3.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Spec §9 — SSE: id/event framing + Last-Event-ID replay (no duplicate replay)
// ---------------------------------------------------------------------------

test("SSE replays durable events after Last-Event-ID with id:/event: framing", async () => {
  const events = new ProcessingEventBus();
  const s = await setupServer({ events });
  try {
    // Mirror bus events into the run snapshot like the production observer does.
    events.observe((e) => {
      const snap = s.runs.get(e.run_id);
      if (snap) s.runs.event(e.run_id, e);
    });
    const runId = "sse-1";
    s.runs.create(runId);
    events.emit(runId, "Researcher", "RUNNING", { message: "e1" });
    events.emit(runId, "Planner", "RUNNING", { message: "e2" });
    events.emit(runId, "Builder", "COMPLETE", { message: "e3" });
    assert.equal(s.runs.get(runId)!.events.length, 3);

    // Full replay (no Last-Event-ID).
    const ctrl1 = new AbortController();
    const res1 = await fetch(`${s.base}/api/runs/${runId}/events`, {
      headers: AUTH,
      signal: ctrl1.signal,
    });
    assert.equal(res1.status, 200);
    const text1 = await readSseUntil(
      res1,
      (blocks) => blocks.filter((b) => b.includes("data:")).length >= 3,
      ctrl1,
    );
    const ev1 = parseSse(text1);
    assert.equal(ev1.length, 3);
    assert.deepEqual(ev1.map((e) => e.id), ["1", "2", "3"]);
    assert.ok(ev1.every((e) => e.event === "processing"));

    // Reconnect with Last-Event-ID: 2 → only seq 3 replays (no duplicate replay).
    const ctrl2 = new AbortController();
    const res2 = await fetch(`${s.base}/api/runs/${runId}/events`, {
      headers: { ...AUTH, "Last-Event-ID": "2" },
      signal: ctrl2.signal,
    });
    const text2 = await readSseUntil(
      res2,
      (blocks) => blocks.filter((b) => b.includes("data:")).length >= 1,
      ctrl2,
    );
    const ev2 = parseSse(text2);
    assert.equal(ev2.length, 1, "only events after Last-Event-ID replayed");
    assert.equal(ev2[0].id, "3");
  } finally {
    await s.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Spec §14 — Artifact compatibility: a run through BullMQ produces the SAME
// canonical artifacts as direct execution (executeRunJob must not alter
// paths/content; artifacts stay owned by WorkflowRuntime/ArtifactStore).
// ---------------------------------------------------------------------------

test("executeRunJob produces the same canonical artifacts as direct execution (before/after compatibility)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rjc-art-"));
  try {
    const store = new FileArtifactStore(join(dir, "artifacts"));
    // A faithful miniature canonical runtime: writes the SAME artifact set
    // (names + content) regardless of runId, then finishes PASSED. Direct
    // execution and queue execution both go through this exact path — so the
    // artifact set must be identical (executeRunJob must not alter it).
    const makeRuntime = (runs: RunRepository, events: ProcessingEventBus) => ({
      run: async (runId: string, _prompt: Prompt): Promise<void> => {
        events.emit(runId, "Researcher", "RUNNING", { message: "research" });
        await store.save(runId, "researcher", {
          researcher_id: "r",
          evidence: [],
          audit_id: "a",
        });
        await store.save(runId, "plan", { plan_id: "p", steps: [], audit: null });
        await store.save(runId, "fixture", { fixture_id: "f", plan_assertions: [] });
        events.emit(runId, "Researcher", "COMPLETE", { result: "PASSED" });
        events.emit(runId, "Done", "COMPLETE", { result: "PASSED" });
        runs.finish(runId, "PASSED", undefined);
      },
    });

    // BEFORE: direct execution (runtime.run called directly, no queue).
    const runsA = new RunRepository(join(dir, "run-state-a"));
    const eventsA = new ProcessingEventBus();
    runsA.create("direct-1");
    await makeRuntime(runsA, eventsA).run("direct-1", makePrompt("direct-1"));

    // AFTER: queue execution (executeRunJob wraps the same runtime).
    const runsB = new RunRepository(join(dir, "run-state-b"));
    const eventsB = new ProcessingEventBus();
    const deps = {
      runs: runsB,
      events: eventsB,
      projectRoot: dir,
      resolveProvider: async () => ({} as never),
      createRuntime: async () => makeRuntime(runsB, eventsB),
    } as never;
    const job: RunJobLike = {
      data: {
        version: 1,
        runId: "queue-1",
        prompt: makePrompt("queue-1"),
        provider: { id: "sample" },
        submittedAt: "t",
      } as never,
      updateProgress: async () => {},
    };
    const res = await executeRunJob(job, deps);
    assert.equal(res.status, "completed");

    // Canonical artifact SET (names) + content must be identical; only the
    // runId segment of the on-disk path differs by design.
    const namesOf = (runId: string) =>
      readdirSync(join(dir, "artifacts", runId)).sort();
    const aNames = namesOf("direct-1");
    const bNames = namesOf("queue-1");
    assert.deepEqual(aNames, bNames, "same artifact file names");
    for (const f of aNames) {
      const name = f.replace(/\.json$/, "");
      assert.deepEqual(
        await store.load("direct-1", name),
        await store.load("queue-1", name),
        `artifact ${name} content identical`,
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Spec §15 — Provider + queue interaction: ProviderBinding proves readiness
// before Researcher; a readiness failure is NOT hidden as a generic failure.
// ---------------------------------------------------------------------------

test("executeRunJob emits ProviderBinding/COMPLETE (readiness proven) before RunWorker/RUNNING and Researcher; provider resolved once", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rjc-bind-ok-"));
  try {
    const events = new ProcessingEventBus();
    const runs = new RunRepository(join(dir, "run-state"));
    let resolved = 0;
    const deps = {
      runs,
      events,
      projectRoot: dir,
      resolveProvider: async () => {
        resolved++;
        return {} as never;
      },
      createRuntime: async () =>
        ({
          run: async (runId: string) => {
            events.emit(runId, "Researcher", "RUNNING", { message: "research" });
            events.emit(runId, "Researcher", "COMPLETE", { result: "PASSED" });
            runs.finish(runId, "PASSED", undefined);
          },
        } as never),
    } as never;
    const job: RunJobLike = {
      data: {
        version: 1,
        runId: "bind-1",
        prompt: makePrompt("bind-1"),
        provider: { id: "featherless", configRevision: 3 },
        submittedAt: "t",
      } as never,
      updateProgress: async () => {},
    };
    const res = await executeRunJob(job, deps);
    assert.equal(res.status, "completed");

    const evs = events.list("bind-1");
    const bindIdx = evs.findIndex(
      (e) => e.processor === "ProviderBinding" && e.state === "COMPLETE",
    );
    const runWorkerIdx = evs.findIndex(
      (e) => e.processor === "RunWorker" && e.state === "RUNNING",
    );
    const researcherIdx = evs.findIndex(
      (e) => e.processor === "Researcher" && e.state === "RUNNING",
    );
    assert.ok(bindIdx >= 0, "ProviderBinding/COMPLETE emitted");
    assert.ok(runWorkerIdx > bindIdx, "RunWorker/RUNNING comes after ProviderBinding");
    assert.ok(
      researcherIdx > bindIdx,
      "Researcher runs after provider readiness is proven",
    );
    assert.equal(
      resolved,
      1,
      "provider resolved exactly once (bound once, not re-read mid-run)",
    );

    const bind = evs[bindIdx]!;
    assert.match(String(bind.message), /ready for Researcher/);
    assert.match(String(bind.message), /requested=featherless/);
    assert.match(String(bind.message), /revision=3/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("executeRunJob surfaces a provider-readiness failure as ProviderBinding ROOT_CAUSE with the real root cause (not a generic worker/BullMQ failure)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rjc-bind-fail-"));
  try {
    const events = new ProcessingEventBus();
    const runs = new RunRepository(join(dir, "run-state"));
    const deps = {
      runs,
      events,
      projectRoot: dir,
      resolveProvider: async () => {
        throw new WorkflowRootCauseError({
          issue: "Provider not configured with credentials",
          expected: "Featherless API key present at execution",
          actual: "FEATHERLESS_API_KEY unset and no stored credential",
          evidence_ids: [],
          required_correction:
            "Set FEATHERLESS_API_KEY or store a credential via the UI",
          recheck_target: "bind-fail",
        });
      },
      createRuntime: async () => ({ run: async () => {} } as never),
    } as never;
    const job: RunJobLike = {
      data: {
        version: 1,
        runId: "bind-fail",
        prompt: makePrompt("bind-fail"),
        provider: { id: "featherless" },
        submittedAt: "t",
      } as never,
      updateProgress: async () => {},
    };
    const res = await executeRunJob(job, deps);
    assert.equal(res.status, "failed");

    const snap = runs.require("bind-fail");
    assert.equal(snap.result, "ROOT_CAUSE");
    // The REAL root cause is preserved — NOT hidden behind "Run worker failure".
    assert.equal(
      snap.root_cause!.issue,
      "Provider not configured with credentials",
    );
    assert.ok(
      !snap.root_cause!.issue.includes("Run worker failure"),
      "provider failure not hidden as a generic worker failure",
    );
    assert.match(snap.root_cause!.actual, /FEATHERLESS_API_KEY unset/);

    const bind = events
      .list("bind-fail")
      .find((e) => e.processor === "ProviderBinding");
    assert.ok(bind, "ProviderBinding event emitted on readiness failure");
    assert.equal(bind.state, "COMPLETE");
    assert.equal(bind.result, "ROOT_CAUSE");
    assert.match(String(bind.message), /FEATHERLESS_API_KEY unset/);
    // The workflow never executed (no Researcher event) — readiness failed first.
    assert.ok(
      !events
        .list("bind-fail")
        .some((e) => e.processor === "Researcher"),
      "workflow did not execute when provider readiness failed",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Spec §16 — Provider changes while jobs are queued: the product REBINDS.
// ---------------------------------------------------------------------------

test("executeRunJob rebinds to the active provider at execution time (captured selector is diagnostic only; an already-active run is bound once and never mutated mid-run)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rjc-rebind-"));
  try {
    const events = new ProcessingEventBus();
    const runs = new RunRepository(join(dir, "run-state"));
    // The active provider is mutable runtime state (what the UI changes). The
    // product REBINDS: resolveProvider uses the active selection at execution
    // time, not the provider.id captured in the job metadata.
    let activeProvider = "alpha";
    let resolveCalls = 0;
    const deps = {
      runs,
      events,
      projectRoot: dir,
      resolveProvider: async (_providerId: string) => {
        resolveCalls++;
        return { id: activeProvider } as never;
      },
      createRuntime: async (provider: any) =>
        ({
          run: async (runId: string) => {
            events.emit(runId, "Researcher", "RUNNING", {
              message: `bound=${provider.id}`,
            });
            events.emit(runId, "Researcher", "COMPLETE", { result: "PASSED" });
            runs.finish(runId, "PASSED", undefined);
          },
        } as never),
    } as never;
    // Job captured provider.id = "alpha"; the user switches the active provider
    // to "beta" while the run is queued, BEFORE it executes.
    const job: RunJobLike = {
      data: {
        version: 1,
        runId: "rebind-1",
        prompt: makePrompt("rebind-1"),
        provider: { id: "alpha", configRevision: 1 },
        submittedAt: "t",
      } as never,
      updateProgress: async () => {},
    };
    activeProvider = "beta";
    await executeRunJob(job, deps);

    const researcher = events
      .list("rebind-1")
      .find(
        (e) => e.processor === "Researcher" && e.state === "RUNNING",
      );
    assert.ok(researcher, "Researcher/RUNNING event emitted");
    assert.match(
      String(researcher.message),
      /bound=beta/,
      "bound the ACTIVE provider at execution time, not the captured 'alpha'",
    );
    assert.equal(
      resolveCalls,
      1,
      "provider bound exactly once at execution start (an already-active run is not re-bound/mutated mid-run)",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
