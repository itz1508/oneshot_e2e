# OneShot Work Status & Completion Report

**Date:** 2026-09-15  
**Scope:** M14–M19 backend integration and Research Drawer architecture.

## M14 Conversation Persistence
**Status:** ✅ Complete & Verified.
- `GET /api/conversations` (list) and `GET /api/conversations/:id/messages` implemented.
- Chat message history (user + assistant) durable via `MessageStore`.
- Stale conversation currency checks (`conversation_id`, `conversation_revision`, `conversation_hash`) validated at Research Review and Build Ready gates.
- Verified by: `conversation-routing.test.ts`, `conversation-persistence.test.ts`, `research-drawer-backend.test.ts`.

---

## M15 Streaming and Cancellation
**Status:** ✅ Complete & Verified.
- Threaded `AbortSignal` through `RuntimeInvocation` in `DirectOpenAIRuntime`, `FakeRuntime`, and `StrandsAdapter`.
- Internal `ProcessingEvent` translation into `PublicRunEvent` in `WorkflowRuntime`.
- Added SSE streaming endpoint: `GET /api/runs/:runId/events` (with `text/event-stream` headers).
- Added run cancellation endpoint: `POST /api/runs/:runId/cancel` marking snapshot failed and emitting `Cancellation` event.
- Verified by: `streaming-cancellation.test.ts` (7/7 tests pass).

---

## M16 Ollama
**Status:** ✅ Complete & Verified.
- `OLLAMA_BASE_URL` auto-detection across `process.env.OLLAMA_BASE_URL`, `http://localhost:11434`, and `http://127.0.0.1:11434`.
- Discovery path verification for `/api/tags` and `/v1/models`.
- Added `OLLAMA_LOCAL_POLICY` in `backend/integration/core/policy.ts`.
- Auto-detection wired into `GET /api/providers`.
- Verified by: `ollama-discovery.test.ts` (8/8 tests pass).

---

## M17 Cloud Presets & Provider API
**Status:** ✅ Complete & Verified.
- Exposed `POST /api/providers` with credential policy enforcement (fails closed in public unauthenticated mode).
- Custom provider input validated for protocol (`http`/`https`) and registered into provider candidates.
- Verified by: `cloud-presets.test.ts`, `researcher-http-server-dispatch.test.ts`.

---

## Research Drawer Backend Architecture
**Status:** ✅ Complete & Verified.
- Exposed governed projection endpoint: `GET /conversations/{conversation_id}/research/drawer`.
- Exposed review decision endpoint: `POST /conversations/{conversation_id}/research/review` for `[ Agree ]` with optimistic currency locking.
- Exposed revision-bound correction endpoint: `POST /conversations/{conversation_id}/research/corrections` for `[ Request Correction ]`.
- Built `ResearchCorrectionService`:
  - Immutable `CorrectionRequest`
  - Derived `ImpactAnalysis`
  - `ResearchWorkItem` DAG generating candidate artifacts without in-place mutation
  - Atomic assembly and commit of `Research Revision N+1`
  - Re-entry into baseline validation, fixture locking, and `Needs Review` before `ready_for_planner` can be unlocked.
- Verified by: `research-drawer-backend.test.ts` (1/1 pass).

---

## M18 UI (Frontend Integration)
**Status:** ✅ Complete & Verified.
- Implemented `ResearchDrawer` React component in `frontend/web/src/components/ResearchDrawer.tsx`.
- Integrated directly into the primary chat composer with live revision status, objective summary, evidence/facts inspection, build gate readiness, and active correction cycles.
- Wired one-click `[ Agree & Proceed ]` and revision-bound `[ Request Correction ]` cycles directly against backend endpoints (`/conversations/:id/research/drawer`, `/review`, `/corrections`).
- Production build exported to `frontend/web/dist` (`npm run build:ui`).
- Typechecked (`npm --prefix frontend/web run typecheck`) and verified by web tests (45/45 pass).

---

## M19 Redis and Production Hardening
**Status:** ✅ Complete & Verified.
- Server boots into `redis-pipeline` mode when Redis is up, `standalone` mode when optional, and `unavailable` (503 on `/api/ready`) when required.
- Verified by: `redis-lifecycle.test.ts` (4 pass, 1 skip), `redis-hardening.test.ts` (5 pass).


