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
| M14 Conversation Persistence | 🔄 Partially done | `backend/conversation/` store + types exist | Store implemented; not wired to HTTP API or workflow |
| M15 Streaming & Cancellation | 🔄 Partially done | `streaming-cancellation.test.ts` (6 pass) | Public event store/emitter implemented; not wired to runtime adapters or HTTP SSE endpoint |
| M16 Ollama | 🔄 Partially done | `backend/integration/provider/presets/ollama.ts` | Preset exists; dynamic discovery and routing integration not production-tested |
| M17 Cloud Presets | 🔄 Partially done | `backend/integration/provider/presets/openai.ts`, `groq.ts` | Presets exist; protected provider configuration API not exposed |
| M18 UI | ⏳ Remaining | — | Provider config + chat workspace UI; blocked on M14/M15 wiring |
| M19 Redis & Production Hardening | 🔄 Partially done | `redis-lifecycle.test.ts` (4 pass, 1 skip), `redis-hardening.test.ts` (5 pass) | Lifecycle modes implemented and tested; live Redis verification pending |

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
