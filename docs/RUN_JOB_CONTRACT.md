# Run Job Contract (BullMQ v6 / Redis)

Operational contract for `POST /api/runs` → BullMQ queue → embedded worker →
`RunRepository` / SSE. Code: `backend/runtime/queue.ts`, `backend/runtime/event-bus.ts`,
`backend/server/http-server.ts`. This documents the **decisions** and the
**explicitly unsupported** items.

## 1. Versioned payload

```ts
interface RunJobV1 {
  version: 1;
  runId: string;
  prompt: Prompt;
  provider: { id: string; model?: string; configRevision?: number };
  submittedAt: string; // ISO 8601
}
```

- **No secrets** in the payload, progress, Redis values, or event data. Provider
  binding + credential resolution happen **per run inside the worker**.
- `validateRunJobV1()` validates at the **worker boundary**. A malformed job is
  rejected with a clear `ROOT_CAUSE` `RunWorker/COMPLETE` event and never executed.
  The legacy `{runId, prompt, providerId, revision}` shape is accepted for rolling
  upgrades; v1 strict fields apply only when `version` is present.

## 2. Job identity & duplication

- **`jobId = runId`** (`queue.add("oneshot-run", payload, { jobId: runId })`).
  BullMQ deduplicates by `jobId`, so re-submitting the same `runId` never creates a
  second queue entry. The job *name* `oneshot-run` is the type, not a second id.
- **No ghost runs**: if enqueue fails **after** the `RunRepository` record was
  created and `ONESHOT_QUEUE_REQUIRED=true`, the run is finalized `ROOT_CAUSE`
  (`runtime queue unavailable`) and the API returns **503** — never left "queued".

## 3. Retry policy

- **`attempts = 1`** for the canonical workflow (it creates artifacts/state; auto
  retries could duplicate side effects). Raising `attempts` requires a proof of
  idempotency.
- **Stalled recovery**: `stalledInterval: 30s`, `maxStalledCount: 1`. A stalled job
  is **re-delivered**, not blindly re-executed. `executeRunJob` inspects run state:
  - **terminal** (`result` set) → skip, emit `COMPLETE`, do not re-execute.
  - **partial** (events, no result) → finalize `ROOT_CAUSE` ("partially executed;
    refusing to silently restart"), **never** restart from the beginning.
  - **fresh** → execute.

## 4. Worker deployment

- **Stage A (current default)**: the HTTP server process hosts API + BullMQ `Queue`
  producer + `QueueEvents` + `Worker` (`backend/index.ts`). Redis/BullMQ-backed,
  but runtime/repository objects stay in **one Node process** → file-backed
  `RunRepository` is safe.
- **Stage B (designed, NOT default)**: `backend/scripts/run-worker-cli.ts` can run
  the worker detached; `RunQueueDeps` already abstracts the per-run runtime factory.
  **Distributed workers are NOT the production default** — the file-backed repo is
  not safe for multi-process/multi-host concurrent writes. Enable only after a
  durable multi-process store (PostgreSQL or equivalent locking) lands.
- **No horizontal-scaling claim while storage is process/filesystem constrained.**

## 5. BullMQ event loading

Canonical events flow over Redis as **progress**, not generic BullMQ state:

```
events.emit(...) → job.updateProgress({kind:"processing-event", event}) → Redis
  → QueueEvents "progress" → ProcessingEventBus.ingest(event)
  → RunRepository / TaskManagement / SSE
```

The canonical event remains **`ProcessingEvent`**; BullMQ's internal stream is
operational transport, **not** permanent evidence (`RunRepository` is source of truth).

## 6. ProcessingEventBus — emit vs ingest

- `emit(...)` **creates** a new canonical event.
- `ingest(event)` accepts an already-created event from at-least-once transport:
  preserves `event_id`/`sequence`/`traceparent`/`correlation_id` (as-is, never
  regenerated); dedups by `event_id` (shared `seen` set with `emit`); persists
  **exactly once**; notifies observers/subscribers; **never re-publishes to BullMQ**.
  Idempotent — tested for duplicate delivery.

## 7. Event sequence

`run_id + sequence` is the application ordering contract — **not** Redis stream ids
or BullMQ internal ids. `ProcessingEventBus.load()` initializes the per-run sequence
from persisted history; `ingest` advances the high-water mark. A resumed run
**continues** the sequence; it never resets to 1.

## 8. QueueEvents

One `QueueEvents` for `oneshot:run` handles `progress` (→ `ingest`), `failed`
(finalize a dangling run as `ROOT_CAUSE` if the workflow produced no terminal
result — no ghost), and `stalled` (log; re-delivery + the §3 guards decide).

## 9. SSE — `GET /api/runs/:id/events`

Verifies the run exists; replays durable events; subscribes to live canonical
events. Wire format: `id: <sequence>`, `event: processing`, `data: {…}`, plus
`: keep-alive` heartbeat comments every 15s. On reconnect the client sends
`Last-Event-ID`; the server replays **only** events with `sequence > last`. The
frontend tolerates repeats by keying on `event_id`. **Closing the browser only
unsubscribes — it never cancels the BullMQ job.**

## 10. Queue status — `GET /api/runtime/queue`

```json
{ "available": true, "backend": "bullmq", "redis": "ok",
  "queue": "oneshot:run", "waiting": 2, "active": 1, "failed": 0 }
```
Never returns Redis host/credentials/passwords.

## 11. Health — `GET /api/health`

Adds `redis`, `queue`, `worker`, `providerConfiguration` (preserving existing
fields). Be precise: **Sample Mode is valid without production credentials** —
`providerConfiguration` reports `sample` and `status` stays `ok`; the server is not
marked unhealthy just because Featherless is unset. A production provider that is
active but unconfigured reports `degraded`.

## 12. Redis failure behavior

- **Startup unavailable** + queue required → health `degraded`, `POST /api/runs`
  **503**, run finalized `ROOT_CAUSE` (no ghost). **No silent inline execution
  outside BullMQ** when `ONESHOT_QUEUE_REQUIRED=true`.
- **Submission unavailable** → **503** with a safe message; the run is finalized so
  the UI must not show "Queued" indefinitely.
- **Interruption** → "Reconnecting to runtime…" is appropriate. **A run is never
  marked failed merely because an SSE client disconnected** — job/worker state
  determines execution.
- `ONESHOT_QUEUE_REQUIRED` (default unset/`false`) keeps the local-dev inline
  fallback so runs are never lost and tests run without Redis.

## 13. Cancellation — `DELETE /api/runs/:id`

- **Queued-job**: BullMQ job `waiting`/`delayed` → `job.remove()` (200,
  `canceled: true`).
- **Active-workflow**: **NOT supported** — `WorkflowRuntime` has no cooperative
  `AbortSignal` path. The API returns **501 `active cancellation not supported`**
  rather than faking it. (Future: thread `AbortSignal` through `WorkflowRuntime.run`
  and role workflows.)
- **Browser SSE disconnect**: only unsubscribes; **never** cancels the BullMQ job.
- **No queue**: 501 `cancellation not available (run queue disabled)`.

## Staged / explicitly unsupported

- **Stage B detached workers as the production default** — needs a multi-process-safe
  durable repository (PostgreSQL or equivalent locking).
- **Cooperative active run cancellation** — needs `WorkflowRuntime` `AbortSignal` support.
- **Full Redis-integration tests** — BullMQ `Queue`/`Worker`/`QueueEvents` wiring is
  correct by construction; pure logic (`executeRunJob`, `ingest`, validation, SSE,
  health, cancel) is unit-tested without Redis; live Redis tests need Redis in CI.
- **Horizontal scaling claims** — none made while storage is filesystem-constrained.

## 14. Artifact compatibility

- Artifacts remain owned by `WorkflowRuntime` / `ArtifactStore`. `executeRunJob`
  never writes, renames, or deletes artifacts; it calls `createRuntime(provider)`
  → `runtime.run(runId, prompt)` — the **exact same path** as direct execution.
  A run executing through BullMQ therefore produces **exactly the same canonical
  artifacts** (names + content) as a direct run; only the `runId` segment of the
  on-disk path differs by design. BullMQ is scheduling/lifecycle only.
- Before/after compatibility test: `run-job-contract.test.ts` → "executeRunJob
  produces the same canonical artifacts as direct execution" (direct
  `runtime.run` vs `executeRunJob`; asserts identical artifact file names +
  deep-equal content per artifact).

## 15. Provider + queue interaction

Provider configuration is resolved **before** the queued workflow enters Researcher:

```
run submitted → capture provider selection (job metadata, non-secret)
  → BullMQ waiting → BullMQ active
  → resolve credential server-side (resolveProvider) → prove provider readiness
  → ProviderBinding event → Researcher
```

- `executeRunJob` resolves the provider per run (`resolveProvider`), constructs
  it, and emits `ProviderBinding/COMPLETE` **before** `RunWorker/RUNNING` and any
  `Researcher` event — so readiness is proven before the workflow consumes it.
- Provider binding is **per run, once**, at execution start (`resolveProvider` is
  called exactly once per `executeRunJob`). No credentials in the payload,
  progress, Redis values, or event data.
- **If provider readiness fails**, it is **not hidden as a generic BullMQ/worker
  failure**: a `ProviderBinding/COMPLETE` event with `result: ROOT_CAUSE` is
  emitted carrying the real root cause, and the run is finalized `ROOT_CAUSE` with
  the real `issue`/`actual`. Any `WorkflowRootCauseError` (provider or otherwise)
  preserves its real root cause; the generic "Run worker failure" message is used
  only for unexpected non-root-cause errors.

## 16. Provider changes while jobs are queued

**Decision: the product rebinds.** A queued run binds the provider that is
**active at the moment execution starts**, not the `provider.id` captured in the
job metadata. The captured `provider.id` / `configRevision` is **diagnostic only**
(provenance: what was selected at submit time); `ProviderBinding` reports it as
`provider.requested`.

- **Changing the active provider in the UI affects future runs**: new
  submissions and queued runs that have not yet started bind the then-active
  provider.
- **It must not silently mutate an already-active run**: the provider is bound
  **once** at execution start (`ProviderBinding` event) and the `WorkflowRuntime`
  consumes that instance for the whole run; switching the UI active provider
  mid-run does not affect an executing run (`resolveProvider` is called once per
  `executeRunJob`).
- Captured-selector **pinning** (binding the job's `provider.id` regardless of
  the current active selection) is **not** the default. It would require
  `ProviderManager.createProvider` to accept an explicit provider id; the current
  per-run binding re-reads the active selection by design (`backend/index.ts`).

## 17. Docker / local deployment

`docker-compose.local.yml` adds Redis to the supported deployment:

- `redis`: `redis:7-alpine`, `--appendonly yes`, `restart: unless-stopped`, a real
  healthcheck (`redis-cli ping`), and a named volume for AOF persistence.
- `oneshot`: builds from the repo `Dockerfile`, `depends_on: redis` with
  `condition: service_healthy`, and `REDIS_URL: redis://redis:6379` so the queue
  is ready before the app starts.
- **Redis is not exposed publicly in production**: the `6379` host mapping is
  local-development only and bound to `127.0.0.1`; production omits the `ports:`
  block so Redis stays internal to the compose network.
- **Provider credentials are never baked into the image**: pass them via
  environment variables, Docker secrets, secret mounts (`ONESHOT_SECRETS_DIR`),
  or a cloud secret manager. The `Dockerfile` documents the secret-mount path;
  the compose only wires non-secret config (`REDIS_URL`, `ONESHOT_MODE`,
  `ONESHOT_QUEUE_REQUIRED`).

## 18. Bootstrap integration

The canonical bootstrap (`scripts/bootstrap/`) determines whether queue mode
requires Redis and proves readiness via `scripts/bootstrap/redis-readiness.mjs`
(`ensureQueueReadiness`), wired into `bootstrap/index.mjs` as a dedicated step:

```
REDIS_URL configured          → probe it
otherwise redis-server found   → start a documented local instance
otherwise Docker + policy      → launch a local redis:7-alpine container (127.0.0.1 only)
otherwise                      → ROOT_CAUSE with installation instructions
```

- `ONESHOT_QUEUE_REQUIRED` decides whether Redis is required. Queue-optional mode
  (unset/`false`) degrades to inline run execution — a valid state, not a failure.
- `ONESHOT_BOOTSTRAP_ALLOW_DOCKER=false` disables the Docker-launch path.
- **Nothing is downloaded or run silently**: every probe/start/launch step is
  logged.
- **Judge Start flow** (`scripts/judge.mjs`) proves Redis/queue readiness before
  reporting the app ready: when `ONESHOT_QUEUE_REQUIRED=true`, it asserts
  `/api/health` reports `queue: "ok"` and `redis: "ok"` (otherwise it fails with a
  root cause — it never reports "ready" without a working run queue).

## 19. Package changes

- `bullmq@^6.3.4` (the queue) and `ioredis@^6.0.0` (the Redis client) are declared
  in `package.json` `dependencies`, compatible with the declared Node engine
  (`>=24.13.0`; BullMQ 6 requires Node ≥20, ioredis 6 requires ≥16).
  `package-lock.json` pins the resolved versions.
- **Offline / deterministic install**: the repository vendors only build-time
  devDeps (`typescript`, `@types/node`, `undici-types`) under `app/vendor/npm/`.
  BullMQ/ioredis (and `@google/adk`) are registry packages whose **full transitive
  closure is not vendored** — consistent with the existing `@google/adk` policy
  documented in the `Dockerfile`. `app/bootstrap/setup.sh` and
  `scripts/bootstrap/install.mjs` attempt `npm ci --offline` first and fall back
  to a network install. Fully-offline installation of the BullMQ closure therefore
  requires additional vendoring and is **staged / not the default**.
- **Licenses**: BullMQ (MIT) and ioredis (MIT) are OSS dependencies; third-party
  notices live under `app/legal/third-party/`.
- `MANIFEST.sha256` is the reproducibility manifest. Regenerating it
  (`python app/scripts/generate_manifest.py`) is a separate reproducibility
  step — it is not part of the `npm test` gate, and this change does not modify
  it (BullMQ/ioredis are pinned in `package-lock.json`). Run the generator after
  source changes to keep it accurate.
