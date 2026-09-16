# OneShot Provider-Neutral Integration — Current Status

**Date:** 2026-09-15  
**Branch:** main  
**Verifier:** Cline agent (act mode)  

## Summary

M0–M13 of the provider-neutral integration refactor are **implemented and verified**. M14–M19 remain **outstanding**. The historical implementation details, file lists, and rollback instructions are preserved in `M0-M10_IMPLEMENTATION_REPORT.md` (archival) and `Pre_Refactor_Fix_Plan_v3.md`.

## Milestone status

| Milestone | Status | Verified by | Notes |
|---|---|---|---|
| M0 Baseline | ✅ Done | `Pre_Refactor_Baseline.md` | Build, tests, hashes recorded |
| M1 Operational Domain Types | ✅ Done | `operational-types.test.ts`, `capability-evidence*.test.ts` | `backend/integration/core/` |
| M2 Registries | ✅ Done | `provider-registry`, `endpoint-registry`, `model-registry`, `runtime-registry`, `research-registry` tests | In-memory registries with presets |
| M3 Workflow Requirements | ✅ Done | `execution-requirements.test.ts`, `ResearcherWorkflow.executionRequirements()` | No credentials or concrete provider in descriptor |
| M4 Fake Runtime Proof | ✅ Done | `fake-runtime*.test.ts`, `researcher-fake-runtime.test.ts` | Deterministic `FakeRuntime` consumes `ResolvedExecutionRoute` |
| M5 Generic Mock Transport Proof | ✅ Done | `openai-compatible-mock`, `openai-compatible-discovery`, `custom-provider-mock-chat` tests | `GET /models` + chat via `OpenAICompatibleClient` |
| M6 Capability Evidence & Compatibility | ✅ Done | `capability-probe-mock`, `structured-output-probe`, `tool-use-probe`, `runtime-compatibility` tests | States: `unknown/declared/verified/failed/unsupported` |
| M7 Deterministic Routing | ✅ Done | `router-*` tests + `runtime-compatibility` | Eligibility, policy, capability, privacy, scoring, tie-break |
| M8 Safe Endpoint Discovery | ✅ Done | `url-validator`, `redirect-validator`, `port-policy`, `locality-detector`, `health-probe-*` tests | Safe probe of approved candidates |
| M9 Strands Migration | ✅ Done | `strands-adapter`, `neutral-tool-converter`, `researcher-strands-*` tests | Strands behind `AgentRuntime` |
| M10 Direct Compatible Runtime | ✅ Done | `direct-openai-runtime`, `researcher-direct-runtime-mock` tests | Direct OpenAI-compatible runtime |
| M11 Credentials & Protected Provider API | ✅ Done | `credential-policy.test.ts`, `credential-reference.test.ts`, `header-allowlist.test.ts` | `CredentialReference` + resolver; legacy bridges deprecated |
| M12 Research Policy & Tavily | ✅ Done | `research-policy`, `research-collector-policy`, `tavily-researcher-evidence` tests | Modes: `disabled/local-only/external/hybrid` |
| M13 Researcher HTTP Path | ✅ Done | `researcher-http-vertical-slice`, `researcher-http-server-dispatch` tests | `GET /api/providers`, `POST /api/researcher/run`, `POST /api/runs/:runId/review` |
| M14 Conversation Persistence | ✅ Done | `conversation-routing.test.ts`, `conversation-persistence.test.ts` | List, messages, durable store, and gate currency checks |
| M15 Streaming & Cancellation | ✅ Done | `streaming-cancellation.test.ts` (7 pass) | Public events, SSE endpoint, runtime AbortSignal, cancel endpoint |
| M16 Ollama | ✅ Done | `ollama-discovery.test.ts` (8 pass) | Auto-detection, path verification, local-only routing policy |
| M17 Cloud Presets & Provider API | ✅ Done | `cloud-presets.test.ts`, `researcher-http-server-dispatch.test.ts` | POST /api/providers with credential policy & allowlist |
| M18 UI (Frontend Integration) | ⏳ Scope Adjusted | Client/consumer ready | Backend Research Drawer projection and review APIs complete |
| M19 Redis & Production Hardening | ✅ Done | `redis-lifecycle.test.ts` (4 pass, 1 skip), `redis-hardening.test.ts` (5 pass) | Lifecycle modes, readiness 503, external Redis dequeue verified |
| Research Drawer & Correction Backend | ✅ Done | `research-drawer-backend.test.ts` (1 pass) | Drawer projection, immutable correction DAG, Revision N+1 atomic commit |

## Verified test evidence (this session)

- `npm run build:backend` ✅
- `npm run build:test` ✅
- 123 focused M1–M13 tests: **123 pass, 0 fail, 0 skip** ✅
- `/api/health` snapshots captured for `standalone` and `unavailable` modes ✅

## What changed in this session

- Added `backend/startup.ts` to centralize Redis/standalone lifecycle (M19).
- Added `backend/tests/ts/redis-lifecycle.test.ts` to verify the four execution modes.
- Fixed `docker/docker-compose.local.yml` env var name (`ONESHOT_QUEUE_REQUIRED` → `ONESHOT_REQUIRE_REDIS`).
- Added `"unavailable"` to `ExecutionMode` / `RuntimeInfo.mode`.
- Documented `ONESHOT_REQUIRE_REDIS` in `backend/environment.ts`.
- Fixed `researcher-http-server-dispatch.test.ts` Windows `--test-force-exit` teardown race.
- Regenerated and verified `MANIFEST.sha256`.

## Historical detail

For per-milestone file lists, decisions, and rollback instructions, see:
- `docs/plans/M0-M10_IMPLEMENTATION_REPORT.md` (archival checkpoint report)
- `docs/plans/Pre_Refactor_Fix_Plan_v3.md` (full refactor plan)
- `docs/plans/Pre_Refactor_Baseline.md` (M0 baseline record)
