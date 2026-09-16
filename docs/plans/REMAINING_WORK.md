# OneShot Remaining Work (Post M13)

**Date:** 2026-09-15  
**Scope:** M14–M19 residual work only. M0–M13 are complete and verified.  

## M14 Conversation Persistence

**Status:** Core HTTP routes and durable intent store are implemented and passing tests; `MessageStore` and workflow gate currency checks remain.

**Done (verified this session):**
- `POST /api/conversations`, `POST /api/conversations/:id/messages`, `GET /api/conversations/:id`, `POST /api/conversations/:id/run`, `POST /api/conversations/:id/prompt`, `GET /api/conversations/:id/graph` exist and route to `IntentCollectionService`.
- `IntentCollectionService` uses a disk-persistent `ConversationStore`; snapshots survive process restart.
- `conversation-persistence.test.ts`, `conversation-routing.test.ts`, `intent-http.test.ts`, and `intent-collection.test.ts` all pass (12/12).

**Remaining:**
- Add `GET /api/conversations` list endpoint.
- Integrate `MessageStore` for user/assistant chat messages (currently only intent turns are persisted).
- Ensure `conversation_id`, `conversation_revision`, `conversation_hash` are validated at Research Review and Build Ready gates.

**Acceptance:**
- Conversations survive server restart.
- Stale artifacts rejected at workflow gates.
- Chat message history (user + assistant) is durable and replayable.

---

## M15 Streaming and Cancellation

**Status:** Public event vocabulary, emitter, and store implemented and unit-tested; not wired to runtime adapters or HTTP.

**Remaining:**
- Thread `AbortSignal` through `AgentRuntime.invoke()` and runtime adapters (Strands, direct OpenAI, fake).
- Translate internal `ProcessingEvent` / tool evidence into `PublicRunEvent` inside `WorkflowRuntime` or pipeline processors.
- Add HTTP endpoint (SSE or chunked) for clients to subscribe and replay events.
- Add `POST /api/runs/:runId/cancel` that aborts the in-flight run.

**Acceptance:**
- Browser can connect to a run and receive deterministic public events.
- Cancellation stops the underlying runtime without corrupting run state.
- Raw SDK events never reach the browser.

---

## M16 Ollama

**Status:** Preset exists; dynamic discovery and routing not production-tested.

**Remaining:**
- Implement `OLLAMA_BASE_URL` auto-detection (loopback, `host.docker.internal:11434`, private ranges if configured).
- Verify `/api/tags` or `/v1/models` discovery path and capability probes.
- Add local-only policy default for Ollama routes.
- Add mock and live tests gated by `ONESHOT_LIVE_TEST`.

**Acceptance:**
- Ollama endpoint discovered without manual configuration.
- Researcher run succeeds through Ollama route.

---

## M17 Cloud Presets

**Status:** OpenAI and Groq presets exist; protected configuration API not exposed.

**Remaining:**
- Expose `POST /api/providers` behind authentication.
- Validate custom provider input against header allowlist and credential policy.
- Store provider config using `CredentialReference` / `CredentialResolver`.

**Acceptance:**
- Authenticated user can add a custom OpenAI-compatible provider.
- Unauthenticated/public mode cannot store arbitrary keys.

---

## M18 UI

**Status:** Not started.

**Remaining:**
- Provider/model selection view in `frontend/web`.
- Chat workspace with conversation history.
- Streaming event subscription UI.

**Acceptance:**
- User can choose local vs cloud provider.
- User can start a conversation and observe Researcher/Planner/Builder progress.

---

## M19 Redis and Production Hardening

**Status:** Lifecycle modes implemented and unit-tested; live Redis dequeue verified against external Redis.

**Done this session:**
- Used `EXTERNAL_RENDER_REDIS_URL` from `app/env/.env` as `REDIS_URL` (local Docker unavailable).
- Added `ONESHOT_REDIS_PROBE_TIMEOUT_MS` env var and removed the hard 2000 ms probe cap so cloud Redis over TLS can handshake (was timing out at ~2.1 s).
- Documented Redis env vars in `backend/environment.ts` and `app/env/.env.example`.
- Verified server boots into `redis-pipeline` mode and `/api/health` reports `redis: ok`, `queue: ok`.
- Verified job enqueue + dequeue: `POST /api/runs` returns 202; queue goes from `waiting: 1` to `active: 1` in ~117 ms.
- Regenerated and verified `MANIFEST.sha256`.

**Remaining:**
- Complete full Researcher → `wait-human` end-to-end with a live worker (requires a longer-running window than the current tool allows; run `scripts/verify-redis-dequeue.mjs` with `STAGE_TIMEOUT_MS` extended, or run `npm run test:pipeline:e2e` against a persistent server).
- Run full `npm test` with Redis available.
- Verify `npm run dev:worker` / `npm run start:worker` in `redis-pipeline` mode.
- Decide whether `/api/health` should return HTTP 503 when `mode === "unavailable"` (currently returns 200 `status: "degraded"` while `/api/ready` already returns 503).

**Acceptance:**
- With Redis up: mode = `redis-pipeline`, runs enqueue through per-stage queues.
- With Redis down + `ONESHOT_REQUIRE_REDIS=false`: mode = `standalone`, inline execution.
- With Redis down + `ONESHOT_REQUIRE_REDIS=true`: mode = `unavailable`, `/api/ready` returns 503.
- Full test suite passes in both standalone and Redis modes.
