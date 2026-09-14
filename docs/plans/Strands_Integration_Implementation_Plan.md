# Strands Integration — Complete Implementation Plan & Builder Handoff

**Status:** PLANNING COMPLETE (no code written). Builder-ready.
**Gap run 2026-09-13 (2nd pass):** Peer deps verified — GAP-STRANDS-01 (CONFIRMED: `@ai-sdk/provider` unmet at root), GAP-STRANDS-02 (zod satisfied), GAP-STRANDS-03 (UNCONFIRMED: real provider spec version). Gap Records: `docs/plans/gaps/GAP-STRANDS-0{1,2,3}.md`. §§7/22/23/38/39 updated. **Evaluator gap run 2026-09-13:** 10 evaluator doc pages fetched; `strands_evals` confirmed Python-only; GAP-STRANDS-EVAL-01 created. §§17/24/41–67 written/updated.
**Date:** 2026-09-13
**Grounding:** Repository source at commit `554b10c` + official Strands user-guide pages (strandsagents.com, fetched this session: SDK APIs + 10 evaluator pages) + previously verified installed SDK facts (`docs/STRAND_MAPPING`, derived from `node_modules/@strands-agents/sdk@1.17.0` type defs).
**Governing rule:** OneShot owns the workflow and authority. Strands provides execution capabilities only.

---

## 1. Executive Finding

1. **Strands is already a root dependency and is imported nowhere.** `package.json:42` declares `@strands-agents/sdk@^1.17.0` (verified installed, lock entry at `package-lock.json:665`). Zero `from "@strands-agents/sdk"` imports exist in `backend/` application code. Strands is **PACKAGE_PRESENT / IMPORT_UNUSED** — the integration is *declared, not built*.
2. **A TypeScript SDK path exists, so no Python bridge is required for the primary seam.** `@strands-agents/sdk` is a TypeScript SDK (`Agent`, `VercelModel`, `agent.stream()`, `SessionManager`, hooks). The prior session summary ("Strands requires a Python bridge") is **CONFLICTED** by the installed TS SDK; the TS evidence is stronger and on disk. See §25.
3. **OneShot is a deterministic pipeline with exactly one LLM call (the Researcher).** `generateText` appears in exactly one agent path (`backend/agents/researcher/workflow.ts`). Therefore the only legitimate Strands seam is wrapping that one model call in a Strands `Agent` via the `VercelModel` adapter — Option "C" from `docs/STRAND_MAPPING`. Everything else (workflow, stages, validation, hash, gates) stays OneShot.
4. **The model-provider chain already exists end to end** (`catalog.ts` → `installer.ts` → `runtime.ts:loadIntegrationModel` → `resolveActiveIntegrationModel` → `/api/integrations/*` routes). The minimum Strands adapter wraps the model produced by `resolveActiveIntegrationModel()` in `VercelModel` — no second model system, no provider reimplementation.
5. **Credential path conflict:** `SettingsPanel.tsx`/`settings.ts` store API keys in browser `localStorage` (`oneshot:researcher:settings:v1`), while the server-side configure endpoint (`http-server.ts:1486-1515`) correctly writes keys into `process.env` server-side only. All key entry must route through the server configure endpoint; localStorage key storage must be removed as part of this work.
6. **Classification outcome:** USE/ADAPT for Agent (Researcher only), Custom Model Provider (`VercelModel`), Structured Output (producer constraint), Streaming (event forwarding), Plugins (metrics hook). DEFER: Session Management, Interrupts, Interventions. REJECT: Model Routing, Experimental Agent Config. OPTIONAL test-only: Evals detectors, experiment generator, chaos testing.
7. **Nothing may be marked PASSED without execution proof.** §22 defines the proof matrix; the E2E proof is a real Researcher run through a Strands `Agent` with structured output and event forwarding, observed in the OneShot event stream.

## 2. Current OneShot Architecture

Reconstructed from source. The canonical workflow is
`Prompt → Researcher → ①Research Review (human gate) → Planner → Refactor → GapAnalysis → Evaluation → TripleValidation (Schema+Fixture+Goal) → Confirmation → Hash → ②Build Ready (hash/package-bound gate) → Builder → Finalize`.

| Component | File | Symbol | Responsibility | Input | Output | Authority | Integration seam | Status | Source |
|---|---|---|---|---|---|---|---|---|---|
| Integration catalog | `backend/integration/catalog.ts` | `CATALOG`, `IntegrationPackageSpec`, `integrationPackageSpec()`, `integrationCatalog()`, `resolveIntegrationBaseURL()` | Curated install metadata (gemini/openai/anthropic); base-URL SSRF validation | integration id | spec / validated URL | Catalog owner | registration point for any new provider | ACTIVE | catalog.ts:27-128 |
| Installer | `backend/integration/installer.ts` | `installIntegration()` | Installs catalogued package into `app/integration/<id>/` | id | install result | Installer owner | install step | ACTIVE | installer.ts |
| Runtime loader | `backend/integration/runtime.ts` | `loadIntegrationPackage()`, `loadIntegrationModel()`, `resolveActiveIntegrationModel()`, `listIntegrationStatus()` | Detects `app/integration/<id>/node_modules/<pkg>`; `createRequire` load; factory export → provider(model) | projectRoot, id, config | `ActiveIntegrationModel {id, model, source, provenance}` | Model resolution authority | **primary model seam** | ACTIVE | runtime.ts:67-174 |
| HTTP integration routes | `backend/server/http-server.ts` | GET `/api/integrations` (L1457), POST `/:id/install` (L1468), POST `/:id/configure` (L1483-1515) | List status; install; write `process.env[spec.apiKeyEnv]` server-side; validate base URL | HTTP body | JSON status | Credential ingress authority (server-side) | UI → backend → env | ACTIVE | http-server.ts:1454-1515 |
| Researcher workflow | `backend/agents/researcher/workflow.ts` | `ResearcherWorkflow.run(prompt, runId)`; `resolveActiveIntegrationModel(...)` (~L107-130); single `generateText` call | Research stage: deterministic evidence → one model call → draft | Prompt, runId | ResearchBundle | Stage owner; model consumer | **Strands adapter target** | ACTIVE | workflow.ts |
| Evidence collector | `backend/agents/researcher/tool/evidence/collector.ts` | `ResearchEvidenceCollector.collect` | Deterministic evidence gathering (no model) | prompt context | evidence | Deterministic authority | tool boundary | ACTIVE | workflow.ts |
| Tavily search | `backend/agents/researcher/tool/tavily/{evidence.ts,bridge.ts,worker.py}` | `TavilyPythonRunner` (bridge), worker.py | search/extract/research-stream; modes `off\|search\|search-extract\|research-stream` via `TAVILY_API_KEY`/`ONESHOT_TAVILY_MODE` | query | TavilyEvidence | Search capability owner | existing worker-bridge pattern | ACTIVE (env-gated) | bridge.ts |
| Tool registry | `backend/agents/researcher/tool/registry.ts` | registry exports | Tool discovery/registration for researcher tools | — | tools | Tool owner | Strands tool wrap point (future) | ACTIVE | registry.ts |
| Run state | `backend/runtime/run-repository.ts` + artifact/event stores | RunRepository, FileArtifactStore | `.runtime/run-state/`, `.runtime/runs/`, `.runtime/task-events/` | runId | persisted state | Run-state authority (never Strands) | session boundary | ACTIVE | STRAND_MAPPING L24 |
| Workflow order | `backend/workflow/graph.json`, `backend/workflow/canonical-transition.ts` | transitions | Canonical stage ordering + gates | — | — | **Workflow authority** | MUST NOT be replaced by Strands Graph | ACTIVE | AGENTS.md |
| Validation | `backend/validation/python/validation/` | schema/fixture/goal validators | Deterministic validation | artifacts | pass/fail | Validation authority (never Strands structured output) | — | ACTIVE | AGENTS.md |
| UI integrations | `app/web/components/IntegrationsDrawer.tsx`, `app/web/lib/data/integrations.ts` | drawer + data fetch | Integration list/status/install/configure UI | API responses | controls | UI projection | existing UI surface | ACTIVE | source |
| UI researcher settings | `app/web/app/researcher/{SettingsPanel.tsx,lib/settings.ts}` | `loadSettings/saveSettings`, key `oneshot:researcher:settings:v1` | **localStorage** settings incl. `apiKey`, `tavilyApiKey` | UI | localStorage | ⚠ CONFLICT with server-side credential rule | key-ingress fix target | CONFLICT | settings.ts:3-37 |

## 3. Existing Integration Infrastructure

Audit with precise status vocabulary (no "already supported" without full-path proof):

| Infrastructure | File | Status result |
|---|---|---|
| Integration catalog (curated specs) | `backend/integration/catalog.ts` | `CATALOG_REGISTERED` for gemini, openai, anthropic |
| Package install | `backend/integration/installer.ts` → `app/integration/<id>/` | install route exists; mechanism covered by `backend/tests/ts/integration-package-runtime.test.ts` |
| Package detection | `runtime.ts:integrationStatus` (checks `node_modules/<pkg>/package.json`) | `PACKAGE_PRESENT` detection proven |
| Credential configuration | `http-server.ts:1486-1515` → `process.env[spec.apiKeyEnv]` | `CREDENTIAL_ACCEPTED` (server-side env write; **no restart persistence beyond process env**; `app/env/.env` survives restart only via `npm run dev`) |
| Model resolution | `runtime.ts:resolveActiveIntegrationModel` | `SDK_CALLABLE` for AI-SDK models (consumed by Researcher) |
| Backend routes | `http-server.ts:1457/1468/1483` | `ROUTE_REGISTERED` |
| Session handling | OneShot run repository + event store | `SESSION_WIRED` for OneShot-native flow; Strands session NOT wired (not required — single-turn) |
| Streaming | OneShot event bus → SSE to UI | OneShot streaming proven; Strands→OneShot event forwarding NOT wired |
| Worker processes | Tavily Python worker via `TavilyPythonRunner` (`bridge.ts`) | `ADAPTER_WIRED` for Tavily only |
| Adapters (Strands) | none | `ADAPTER_WIRED` = NO |
| UI integration controls | `IntegrationsDrawer.tsx` (install/configure/status); `SettingsPanel.tsx` (localStorage keys — conflicting) | UI exists; key path conflict (§9) |
| Strands SDK | `package.json:42` `@strands-agents/sdk@^1.17.0` installed, imported nowhere | `PACKAGE_PRESENT` only |

`E2E_PROVEN` for any Strands path: **NO** (nothing executes Strands today).

## 4. Current Execution Path

```text
UI (IntegrationsDrawer / SettingsPanel)
  ↓ fetch
backend (http-server.ts)
  ↓ GET /api/integrations → listIntegrationStatus(workspaceRoot)
  ↓ POST /api/integrations/:id/install → installIntegration()
  ↓ POST /api/integrations/:id/configure → process.env[apiKeyEnv|modelEnv|baseURLEnv]
  ↓ (workflow stage request)
Researcher stage (workflow.ts:ResearcherWorkflow.run)
  ↓ resolveActiveIntegrationModel(projectRoot, preferredId)
  ↓ listIntegrationStatus → pick installed+configured candidate
  ↓ loadIntegrationModel → loadIntegrationPackage (createRequire in app/integration/<id>/)
  ↓ factory(apiKey/baseURL) → provider(config.model)  → AI-SDK model instance
  ↓ generateText(...)  ← the ONLY model call
  ↓ result → buildResearchBundle (OneShot validation unchanged)
  ↓ Research Review (human gate) → Planner → ... (canonical transitions)
result/events → OneShot event store → SSE → UI
validation → backend/validation/python/validation/ (schema/fixture/goal)
```

The insertion point for Strands is exactly one arrow: `generateText(...)` → optionally a Strands `Agent.invoke(...)` wrapping the same `active.model` in `VercelModel`.

## 5. Strands Surface-by-Surface Review

Sources: official Strands user-guide pages (fetched this session); "installed SDK" marks facts verified from `@strands-agents/sdk@1.17.0` type defs via `docs/STRAND_MAPPING`.

### 5.1 Plugins
- **What Strands provides:** `Plugin` class (Python `strands.plugins`; TS `Plugin` from `@strands-agents/sdk`) with `name`, optional `initAgent(agent)` (async), and hook-registered callbacks on framework events (`BeforeToolCallEvent`, etc.); shared `agent.appState` for state. Plugins bundle hooks + tools into reusable modules.
- **Package:** already-installed `@strands-agents/sdk` (TS). **Where it executes:** in-process with the agent (backend Node). **State it owns:** agent-local `appState` only.
- **What OneShot must own:** any durable state, event projection, tool authority.
- **Possible OneShot use:** a metrics plugin forwarding Strands hook events into the OneShot event bus so existing SSE works unchanged.
- **Exact seam:** the Strands Agent created in the new researcher adapter (§27). **Adapter:** thin plugin class emitting to OneShot events. **Registration:** `Agent({ plugins: [...] })` inside the adapter only.
- **Backend connection:** emit into the existing run event store used by workflow stages. **UI exposure:** none new (projected through existing run events).
- **Verification:** run adapter; assert a plugin hook fired and a Strands-derived event appears in the run event stream.
- **Classification: ADAPT (OPTIONAL in the first implementation).** Direct `agent.addHook(...)` achieves the same without the Plugin abstraction for a single agent.

### 5.2 Interventions
- **What Strands provides:** `InterventionHandler` lifecycle methods (e.g. `beforeToolCall`) returning typed `InterventionActions.{deny, confirm, guide, transform, proceed}`; precedence deny > confirm > guide > transform > proceed; per-handler `onError` policy (fail-closed vs proceed); built on hooks; `confirm` integrates with the interrupt system.
- **Where it executes:** inside the Strands agent loop. **State it owns:** handler-local.
- **What OneShot must own:** ALL authorization. OneShot's human gates (Research Review, hash-bound Build Ready) are OneShot-native; a Strands intervention must never become a replacement gate.
- **Possible OneShot use:** none in the first implementation — the Researcher is a single-turn structured-output call with no model-driven tool calls, so there is nothing to intervene on. If model-driven tools arrive later (e.g. Tavily-as-Strands-tool), only `guide` (advisory) is acceptable; deny/authorize stays in OneShot tool policy (`backend/tool/`, `backend/sandbox/`).
- **Classification: DEFER.** Authorization stays OneShot-owned regardless; no seam needed now.

### 5.3 Async Iterators (Streaming)
- **What Strands provides:** TS `agent.stream(prompt) → AsyncGenerator<AgentStreamEvent, AgentResult>`. Verified event types (TS): `beforeInvocationEvent`, `beforeModelCallEvent`, `afterModelCallEvent` (with `stopData.message`), `beforeToolsEvent`, `afterToolsEvent`, `afterInvocationEvent`, and `modelStreamUpdateEvent` wrapping `modelContentBlockStartEvent` (`start.type === 'toolUseStart'`) and `modelContentBlockDeltaEvent` (`delta.type === 'textDelta'`). (Python equivalent is `stream_async`; not used here.)
- **Possible OneShot use:** forward these events into the OneShot event bus/SSE so the UI observes model progress during the Researcher stage.
- **Exact seam:** adapter iterates `agent.stream(...)` and maps events → existing `events.emit(runId, "Researcher", ...)`; the final `AgentResult` is what the workflow consumes.
- **Verification:** a live run whose SSE transcript shows ≥1 Strands-derived event AND the stage result equals what the workflow consumed.
- **Classification: ADAPT (USE as implementation step; optional for the absolute minimum viable adapter).**

### 5.4 Interrupts
- **What Strands provides:** `event.interrupt<T>({ name, reason })` pauses the agent loop and returns control; `result.status === Status.INTERRUPTED` with `result.interrupts[{id, name, reason}]`; resume by invoking again with `{ interruptResponse: { interruptId, response } }`; graph hook providers can raise interrupts.
- **OneShot bridge required if ever used:** Strands interrupt → OneShot backend event → UI prompt → user response → OneShot persists the authorization/state decision → adapter resumes with `interruptResponse`.
- **OneShot reality:** the only human gate near the Researcher (Research Review) happens AFTER the stage completes, inside OneShot's review system — not mid-agent-loop. No mid-stage human-input seam exists; building one would create a second authorization surface.
- **Classification: DEFER (REJECT for the current workflow).** Do not invent a mid-stage interrupt seam.

### 5.5 Session Management
- **What Strands provides:** `SessionManager` (snapshot-based vs repository-based managers); built-in `FileStorage`; persists messages/agent state at lifecycle events (`saveLatestOn`); one live writer per session+agent id; no distributed lock; agents are cheap per conversation; model providers should be reused per process.
- **OneShot reality:** the Researcher is single-turn; run state is OneShot's `RunRepository` and must remain so. A Strands session would be a third state store with no requirement behind it.
- **If later multi-turn research is required (documented shape only):** `sessionId = researcher:<runId>`, `FileStorage` rooted in a OneShot-controlled directory, restore-before-resume, RunRepository still authoritative for run lifecycle.
- **Classification: DEFER (NOT REQUIRED for minimum).** Source proof: STRAND_MAPPING L194-201 ("MINIMUM: no SessionManager — Researcher is single-turn").

### 5.6 Structured Output
- **What Strands provides:** Python `Agent(structured_output_model=...)` → `result.structured_output`; TS `Agent({ structuredOutputSchema: zodSchema })` or per-invocation override → `result.structuredOutput` (verified from official docs + installed SDK, STRAND_MAPPING L199). It is a provider-backed constraint, not a validator.
- **OneShot mapping:** the existing draft schema is passed as `structuredOutputSchema`; the provider returns a structured result; **OneShot validation still runs** (`buildResearchBundle` + `backend/validation/python/validation/`). Strands structured output is a **producer constraint**; OneShot remains the **authority validator**. Final Confirmation and triple validation are untouched.
- **Verification:** structured result returned AND OneShot validators accept it; a deliberately malformed output must still be rejected by OneShot validation (negative case).
- **Classification: USE (ADAPT).** Core of the adapter.

### 5.7 Streaming (overview / callback handlers)
- **What Strands provides:** a streaming overview plus callback handlers as an alternative to async iteration.
- **OneShot decision:** one mechanism only — async iterators (§5.3). Callback handlers add a second redundant path.
- **Classification: REJECT (callback-handler variant); ADAPT via async iterators only.**

### 5.8 Experimental Agent Config
- **What Strands provides:** Python-only `strands.experimental.config_to_agent` builds agents from dict/JSON config; string `model` supports **AWS Bedrock model-id strings only**; other providers via kwargs; explicitly marked experimental ("may change; use with caution in production").
- **OneShot reality:** model identity/config authority is `catalog.ts` + env; a JSON-driven agent builder would add a second configuration authority; Bedrock is not a OneShot provider.
- **Classification: REJECT.** Experimental + Python-only + redundant with the OneShot catalog.

### 5.9 Custom Model Provider
- **What Strands provides:** implement a `Model` subclass whose `stream(messages, tool_specs, system_prompt)` yields the StreamEvent protocol (`messageStart`, `contentBlockStart`, `contentBlockDelta`, `contentBlockStop`, `messageStop`, `metadata`, `redactContent`); `get_config`/`update_config` for runtime config; pass to `Agent({ model })`.
- **OneShot reality:** **not required.** `VercelModel` (`@strands-agents/sdk/models/vercel`, verified in installed SDK type defs) already wraps any Vercel AI SDK `LanguageModel` — exactly what `resolveActiveIntegrationModel()` returns. A custom Model class would duplicate the provider layer OneShot already owns.
- **When it WOULD be needed:** only if a OneShot capability is not an AI-SDK model (e.g. the Tavily Python worker) — no such model case today.
- **Classification: ADAPT via `VercelModel`; custom Model class = NOT REQUIRED.** Smallest adapter boundary: `new VercelModel({ provider: active.model })`.

### 5.10 Model Routing
- **What Strands provides:** `ModelRouter(candidates: RoutingCandidate[], { strategy })`, `RoutingCandidate({ model, name, description })`, strategies incl. `ClassifyThenFallback`; retry strategy first, then candidate switch; rejects stateful candidates; `agent.model` remains the first candidate; on candidate switch mid-stream, consumers receive the failed candidate's events followed by the replacement's stream.
- **OneShot reality:** provider/model selection is OneShot authority — `resolveActiveIntegrationModel(projectRoot, preferredId)` + catalog/env. A Strands router would choose providers outside the catalog/configure/UI chain, breaking credential enforcement and provenance (`modelSource`/`modelProvenance`).
- **Classification: REJECT (as OneShot routing).** Not in the first implementation.

### 5.11 Evals Detectors
- **What Strands provides:** Python `strands_evals.detectors.diagnose_session(session)` → `DiagnosisResult {failures[], root_causes[], recommendations[]}` (two-phase: failure detection → root-cause analysis over spans); integrates into `Experiment` via `DiagnosisConfig(trigger=DiagnosisTrigger.ON_FAILURE)`.
- **OneShot use (verification only):** analyze a recorded Researcher execution trace to prove failure paths are diagnosable; supports "why did the integration run fail" diagnostics. Must never decide workflow state.
- **Classification: OPTIONAL, TEST-ONLY, DEFERRED.** Package `strands_evals` is Python and NOT installed; do not add unless the verification workstream is approved.

### 5.12 Experiment Generator
- **What Strands provides:** Python `strands_evals.ExperimentGenerator` (`from_context_async`, `from_experiment_async`, `update_current_experiment_async`, `to_file`) generating eval cases + rubrics from context and topic plans.
- **OneShot use:** bootstrap test cases for the researcher-adapter verification suite. Test-only.
- **Classification: OPTIONAL, TEST-ONLY, DEFERRED.**

### 5.13 Chaos Testing
- **What Strands provides:** Python `strands_evals` `ChaosCase` with effect maps (`tool_effects`: `Timeout()`, `NetworkError()`, `ExecutionError()`, `ValidationError()`; pre/post model-call effects), a chaos plugin added to the agent, resilience evaluators (`FailureCommunicationEvaluator`, `PartialCompletionEvaluator`, `RecoveryStrategyEvaluator`), `ChaosCase.expand(..., include_no_effect_baseline=True)`.
- **OneShot use:** inject controlled failures into a test-run Strands agent to prove OneShot error handling (adapter error propagation, event-bus error events, workflow failure path) — never in production runs.
- **Classification: OPTIONAL, TEST-ONLY, DEFERRED.**

## 6. Strands → OneShot Capability Matrix

| Strands Capability | OneShot Requirement | Existing Seam | Package | Adapter | Registration | UI | Status |
|---|---|---|---|---|---|---|---|
| Agent | Wrap the Researcher's single model call | `ResearcherWorkflow.run` model call | `@strands-agents/sdk@^1.17.0` (present) | new researcher Strands adapter module | created per-run inside adapter; no global registry | none new (stage events) | ADAPT — TARGET OF THIS PLAN |
| Model Provider | Provider-agnostic model instance | `resolveActiveIntegrationModel()` | catalogued AI-SDK packages (present) | `VercelModel` wrap in adapter | none new | none new | ADAPT — USE |
| Custom Model Provider | (not required) | `VercelModel` covers AI-SDK models | — | only if a non-AI-SDK model appears | — | — | NOT REQUIRED |
| Streaming | UI-visible model progress | OneShot event bus → SSE | `@strands-agents/sdk` (present) | event mapper in adapter | none | existing run events | ADAPT — step 2 |
| Async Iterator | same | same | same | same | same | same | ADAPT — same as Streaming |
| Structured Output | schema-constrained draft | existing draft schema + OneShot validators | same | pass `structuredOutputSchema` in adapter | none | none | USE |
| Session | (not required — single turn) | RunRepository is run-state authority | — | none | — | — | DEFER |
| Interrupt | (no mid-stage seam) | Research Review is post-stage, OneShot-native | — | — | — | — | DEFER/REJECT |
| Intervention | (no model-driven tools today) | OneShot tool policy owns deny | — | — | — | — | DEFER |
| Plugin | optional event forwarding | event bus | same | optional plugin/hook | `Agent({plugins})` in adapter | none | OPTIONAL |
| Model Routing | provider selection must stay OneShot | `resolveActiveIntegrationModel` + catalog | — | — | — | — | REJECT |
| Evaluation/Detector | failure diagnosis, test-only | execution traces | `strands_evals` (Python, NOT installed) | — | — | — | OPTIONAL, DEFERRED |
| Chaos Testing | error-handling proof, test-only | adapter error path | `strands_evals` (NOT installed) | — | — | — | OPTIONAL, DEFERRED |

## 7. Package & Dependency Matrix

Every package with exact status. Nothing new is installed for the core plan.

| Package | Version req | Lang | Purpose | Direct dep | Peer dep | Required by | Used by | Prod/test | Repo status | Install mechanism | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `@strands-agents/sdk` | `^1.17.0` | TS | Agent, VercelModel, stream, hooks, structured output | YES (already `package.json:42`) | `zod ^4.1.12`; `@ai-sdk/provider ^3.0.0` | researcher Strands adapter | backend/agents/researcher | production | PACKAGE_PRESENT, imported nowhere | none needed | **REQUIRED (already satisfied)** |
| `zod` | `^4.1.12` | TS | `structuredOutputSchema` schemas | optional direct hardening | — | Strands SDK peer | adapter | production | **VERIFIED 2026-09-13:** transitive `4.6.4`, deduped single copy, satisfies peer | optional `npm i zod@^4.6.4` for direct entry | **SATISFIED (GAP-STRANDS-02)** |
| `@ai-sdk/provider` | `4.0.13` (match `ai`'s dep) | TS | LanguageModel interface + `APICallError` runtime import | **root dependency — REQUIRED** | Strands peer (`^3.0.0`, optional) + `VercelModel` runtime import | VercelModel | adapter | production | **VERIFIED 2026-09-13: UNMET at root** — exists only nested under `ai/`; SDK import throws today | `npm i -E @ai-sdk/provider@4.0.13` (GAP-STRANDS-01) | **REQUIRED — root install** |
| `@ai-sdk/openai` / `google` / `anthropic` | per catalog | TS | provider factories | catalog-installed | — | `loadIntegrationModel` | runtime.ts | production | catalogued | `/api/integrations/:id/install` | NOT REQUIRED (exists) |
| `strands-agents` | `0.0.1` | — | placeholder/peer of mcp-server | present (`package-lock.json:2059`) | — | — | — | — | PACKAGE_PRESENT, unused | — | **NOT REQUIRED** (do not remove without authorization) |
| `strands-agents-mcp-server` | `^0.0.1` | TS | Strands MCP server | present (`package.json:47`) | `strands-agents` | — | — | — | PACKAGE_PRESENT, imported nowhere | — | **NOT REQUIRED for this plan** (future MCP-tool edge; do not wire now) |
| Python `strands-agents` (pip) | latest | Python | Python SDK | — | — | — | — | — | not installed | pip | **NOT REQUIRED** (TS path chosen) |
| `strands_evals` (pip) | latest | Python | detectors / generator / chaos | — | — | verification suite only | tests | test-only | NOT installed | pip | **DEFERRED** |
| `@tavily/core` | — | TS | (suggested by older docs) | — | — | — | — | — | not a dep; Tavily runs via Python worker | — | **NOT REQUIRED** |

Separation: **REQUIRED** — `@strands-agents/sdk` (present), `zod` direct entry (verify), single `@ai-sdk/provider` resolution (verify). **OPTIONAL** — none for production. **TEST-ONLY** — `strands_evals` (deferred). **DEFERRED** — mcp-server wiring. **NOT REQUIRED** — Python `strands-agents`, `@tavily/core`.

## 8. Provider Mapping

```text
OneShot model request (ResearcherWorkflow.run)
  ↓ resolveActiveIntegrationModel(projectRoot, preferredId)   [existing, unchanged]
  ↓ ActiveIntegrationModel { id, model (AI-SDK LanguageModel), source, provenance }
  ↓ NEW adapter: const strandsModel = new VercelModel({ provider: active.model })
  ↓ const agent = new Agent({ model: strandsModel, systemPrompt, structuredOutputSchema })
  ↓ agent.invoke(promptText, ...)  OR  for await (const e of agent.stream(promptText)) {...}
  ↓ AgentResult { structuredOutput, ... }
  ↓ adapter returns structuredOutput → buildResearchBundle (UNCHANGED)
```

- `resolveActiveIntegrationModel()` supports this **directly**: it already returns a Vercel AI SDK model instance (`LanguageModel`), which is exactly what `VercelModel({ provider })` accepts. **No new adapter boundary at the model layer** — the only new boundary is the Agent wrapper module.
- **No second model system.** The adapter must NOT construct providers, read keys, or call model factories; it only wraps what the resolver returns.
- Provenance: `active.source` / `active.provenance` continue to be recorded by the existing chain; the adapter must not alter them.

## 9. Credential/API-Key Mapping

Verified path today:

```text
User API key
  ↓ UI: SettingsPanel.tsx (localStorage `oneshot:researcher:settings:v1` — ⚠ CONFLICT) and/or IntegrationsDrawer
  ↓ POST /api/integrations/:id/configure  (http-server.ts:1486-1515)
  ↓ process.env[spec.apiKeyEnv] = apiKey (SERVER-SIDE ONLY; base URL validated via resolveIntegrationBaseURL)
  ↓ resolution: process.env[apiKeyEnv] read in loadIntegrationModel (runtime.ts:114-117)
  ↓ provider factory({ apiKey, baseURL }) → provider(model)
  ↓ (NEW: same model instance handed to VercelModel — Strands code never re-reads the key)
  ↓ actual provider request issued by the AI-SDK package inside app/integration/<id>/
```

Verified answers:
- **Where key enters:** HTTP body of the configure route (server-side) — plus, wrongly, `SettingsPanel`/`settings.ts` localStorage (browser).
- **Where stored:** `process.env[spec.apiKeyEnv]` for the server process lifetime. **Restart persistence:** env vars do NOT survive restart; `app/env/.env` (loaded by `npm run dev`) is the only persistent mechanism. Persisting user-entered keys to disk is a product decision NOT authorized in this plan — recorded as a limitation.
- **Browser localStorage involved:** YES today (conflict). Plan: keys are entered only via the configure endpoint; `hasProviderSettings`/`hasTavilyKey` must consult server status (`/api/integrations`), not localStorage.
- **How backend receives it:** POST body → trimmed into `process.env`. Never echoed back (status reports only `configured: boolean`).
- **How provider receives it:** `loadIntegrationModel` passes `apiKey` into the provider factory.
- **Can the key be tested:** not by the configure endpoint today (returns status only). A minimal validation probe may be added later as an optional route extension — out of first-implementation scope.
- **Does key validation prove execution:** **NO.** `configured: true` ≠ integration passed. Only the E2E proof in §22 establishes execution.

## 10. Session / Chat Flow

```text
UI conversation (researcher chat / run UI)
  ↓ OneShot API (session services → intent → run creation)
  ↓ OneShot run/session: RunRepository `.runtime/run-state/<runId>.json`  ← RUN-STATE AUTHORITY
  ↓ workflow reaches Researcher stage (canonical transitions only)
  ↓ [NEW adapter — stateless, per invocation] Strands Agent (NO Strands SessionManager)
  ↓ stream/events → OneShot event adapter → event store → SSE → UI
  ↓ AgentResult → ResearchBundle → Research Review (OneShot human gate)
  ↓ workflow continuation (canonical-transition.ts)
```

| Concern | Owner | Proof/decision |
|---|---|---|
| Session creation | OneShot session services (existing) | unchanged |
| Session identity | OneShot runId / conversation id | Strands gets no session id (no SessionManager) |
| Resume | OneShot run-state + event store | Strands snapshot NOT used |
| Persistence | RunRepository, FileArtifactStore, event store | unchanged |
| Message history | OneShot conversation state | Researcher prompt assembled OneShot-side |
| Agent state | none (single-turn) | plugin `appState` would be in-memory only, if used |
| Run state | OneShot RunRepository | never delegated |
| Interruption | OneShot cancellation of the stage request | adapter abort propagates to `agent.stream` cancellation |
| Continuation | canonical transitions | unchanged |
| Cleanup | OneShot run lifecycle | Strands holds no durable state |
| Restart behavior | OneShot re-reads `.runtime/` | nothing Strands-side to recover |

Explicit state separation (do not merge without source proof):
- **OneShot Run State** = `.runtime/run-state/` (authority).
- **OneShot Conversation State** = session/conversation stores (authority for chat).
- **Strands Session State** = NONE (not adopted; would be `.strands/sessions` if ever adopted).
- **Provider State** = none (providers are stateless HTTP clients; Strands model routing's stateful-candidate rejection confirms provider models must be stateless).

## 11. Streaming / Event Wire

```text
Strands Agent
  ↓ agent.stream(prompt) → AsyncGenerator<AgentStreamEvent, AgentResult>
  ↓ events: beforeInvocationEvent, beforeModelCallEvent, afterModelCallEvent,
  ↓         beforeToolsEvent, afterToolsEvent, afterInvocationEvent,
  ↓         modelStreamUpdateEvent{modelContentBlockStartEvent | modelContentBlockDeltaEvent}
  ↓ NEW event mapper (inside adapter): map → emit(runId, "Researcher", Running, {scope:"SUPPORT", message})
  ↓ backend transport: existing event store → SSE channel (UNCHANGED)
  ↓ UI: existing run/event rendering (UNCHANGED)
```

| Aspect | Decision |
|---|---|
| Event types forwarded | lifecycle (before/after invocation, model, tools) + text deltas (`textDelta`) + tool starts (`toolUseStart`) — collapsed to bounded progress messages to avoid flooding the event store |
| Transformation | adapter-side mapper; Strands event classes must NOT leak into event-store payloads (serialize to plain messages) |
| Transport | existing SSE (unchanged) |
| Cancellation | OneShot stage abort → `AsyncGenerator.return()` on the stream; adapter must drain/stop the generator |
| Errors | mapper emits an error event; adapter rethrows so the workflow's existing failure path handles it |
| Completion | final `AgentResult` is the generator's return value; workflow consumes `structuredOutput` |
| Partial output | deltas are progress-only; the authoritative draft is the final structured output |
| Tool events | none expected (no tools in minimum); if added, `toolUseStart` maps to a progress message only — tool authorization stays OneShot |
| Model events | model call start/stop only (no token accounting in v1) |
| Session events | none (no Strands session) |

Files that must change for streaming: the new adapter module (create) and `backend/agents/researcher/workflow.ts` (call-site only — §28). Backend transport and UI: NO changes.

## 12. Structured Output Mapping

```text
OneShot schema (existing draft contract)
  ↓ adapter: zod schema passed as structuredOutputSchema (agent-level default)
  ↓ Strands → provider (constraint enforced at generation)
  ↓ result.structuredOutput (typed object)
  ↓ OneShot validation: buildResearchBundle + backend/validation/python/validation/ (UNCHANGED)
```

- Strands structured output is a **producer constraint**. OneShot remains the **authority validator** (schema + fixture + goal + Final Confirmation).
- The zod schema in the adapter must be derived FROM the existing OneShot draft contract, not a parallel contract; contract changes begin in `backend/schema/` per AGENTS.md.
- Negative verification: feed a malformed structured output through the OneShot validators and confirm rejection — proves validation authority was not bypassed.

## 13. Plugin Mapping

- Useful plugin: observability/metrics forwarding Strands hook events to the OneShot event bus (§5.1).
- Hook points: `BeforeToolCallEvent`, `AfterModelCallEvent` (verified in installed SDK, STRAND_MAPPING L8, L220-226).
- Tool registration: plugins may register tools — **forbidden for now**: no model-driven tool calls in the minimum path; tool registration authority stays `backend/agents/researcher/tool/registry.ts` + `backend/tool/`.
- State: `agent.appState` only; no durable OneShot state in plugins.
- Initialization: `initAgent` (may be async) inside the adapter's agent construction.
- OneShot boundary: plugin may emit progress events; it may NEVER mutate run state, stage state, validation outcomes, or authorization.
- Registration: `Agent({ plugins: [...] })` in the adapter. Status: OPTIONAL (direct `addHook` is simpler for one agent).

## 14. Intervention Mapping

- deny/confirm/guide/transform/proceed support (verified §5.2). For OneShot:
  - **deny/confirm:** would constitute authorization inside the agent loop → **not permitted**; OneShot owns authorization (`backend/tool/`, sandbox admission, human gates).
  - **guide:** permissible later as advisory steering once model-driven tools exist.
  - **transform:** not needed (single structured call).
  - **proceed:** default.
- Required bridge: NONE in this implementation. The minimum adapter registers no interventions.

## 15. Interrupt Mapping

Required bridge IF ever adopted (documented shape, not built):
```text
Strands interrupt (event.interrupt) raised inside agent loop
  ↓ adapter detects result.status === INTERRUPTED with result.interrupts[{id, name, reason}]
  ↓ adapter emits OneShot event (runId, "Researcher", "InterruptionRequested", {interruptId, name, reason})
  ↓ OneShot persists a pending decision record (RunRepository) — a NEW record type would be required
  ↓ UI renders a decision control bound to that record
  ↓ user response → OneShot API → OneShot validates + authorizes the response
  ↓ adapter resumes: agent.stream([{ interruptResponse: { interruptId, response } }])
```
Current status: **NO seam exists** for a pending-decision record or mid-stage UI control; Research Review happens post-stage. Interrupts are DEFERRED; the Builder must not build this bridge in this implementation.

## 16. Model Routing Mapping

- **Not required.** Model selection occurs in `resolveActiveIntegrationModel()` (OneShot authority); provider-selection owner is the OneShot catalog/configure chain; fallback today is "first installed+configured candidate" (optional `preferredId`); credentials are per-catalog env; UI exposure is the IntegrationsDrawer.
- Strands `ModelRouter` would be a **Strands execution capability only** (choose among Strands Model instances inside one agent invocation) — never OneShot workflow routing; **not in the first implementation**.
- If ever added later, candidates must be constructed exclusively from resolver output (never raw provider constructors), preserving provenance and credentials.

## 17. Evaluation / Detection Mapping

- **Production:** `OneShot → adapter (Strands Agent + VercelModel) → provider`. Evaluators/detectors play no production role.
- **Evaluators (researched 2026-09-13, see §§41–67):** The Strands Evals SDK (`strands_evals`) is **Python-only**. 21 LLM-based + 5 deterministic + custom evaluator base class are documented. The installed `@strands-agents/sdk@1.17.0` contains **zero evaluator exports** — no TypeScript bridge exists. Three paths: Python bridge (complex), TS reimplementation (maintainable), or skip (recommended — OneShot's Triple Validation + §22 proof matrix are stricter). See §61 for full gap analysis.
- **Detectors (UNCONFIRMED, see §60):** Failure Detection, Root Cause Analysis, Session Diagnosis appear as separate subsystem in the sidebar. No dedicated pages fetched. Original assumption that `diagnose_session()` is usable cannot be confirmed. Read pages directly before claiming detector coverage.
- **Decision:** Evaluators remain OPTIONAL test-only, DEFERRED (§1 item 6, §66). Do not install `strands_evals`. Future evaluator adoption should follow Option B (TS reimplementation), not a Python bridge.

## 18. Experiment Generator Mapping

- **Production:** unused.
- **Verification (deferred):** `ExperimentGenerator.from_context_async(...)` bootstraps eval cases for the adapter test suite (researcher context, topics, evaluator). Output is a test artifact (`experiment.to_file`), never a workflow input.

## 19. Chaos Testing Mapping

- **Production:** forbidden.
- **Verification (deferred):** chaos plugin + `ChaosCase` effects (e.g. provider Timeout) injected into a test-run agent to prove the adapter propagates errors to OneShot's failure path and the event store records an error event. Must include a no-effect baseline. Proves the error-propagation row of §22.

## 20. Registration & Discovery Mapping

Registration chain with exact files/functions:

```text
package (@strands-agents/sdk@^1.17.0)            — already in package.json:42 (REQUIRED step: none)
 ↓ integration registration                        — NOT APPLICABLE (Strands is a root dependency, not an
 ↓                                                   installable integration; do NOT add it to catalog.ts)
 ↓ capability registration                         — backend/agents/researcher/ adapter module export (no registry change)
 ↓ provider registration                           — none (VercelModel wraps resolver output; adapter never constructs providers)
 ↓ credential configuration                        — existing POST /api/integrations/:id/configure (http-server.ts:1486)
 ↓ backend route                                   — NO new route required (status via existing GET /api/integrations)
 ↓ session path                                    — none (no Strands session)
 ↓ workflow capability request                     — backend/agents/researcher/workflow.ts imports adapter (single call-site change)
 ↓ adapter                                         — NEW backend/agents/researcher/strands-adapter.ts (proposed name)
 ↓ Strands SDK                                     — import { Agent } from "@strands-agents/sdk";
                                                     import { VercelModel } from "@strands-agents/sdk/models/vercel"
```

Integration/capability/provider/credential/route/session/adapter/UI registrations are all satisfied by existing infrastructure except the adapter module itself. There is NO new registration API to invent.

## 21. UI → Backend → Integration → SDK Mapping

| UI control | Existing file | API request | Backend | Integration | Strands |
|---|---|---|---|---|---|
| Integration list / status | `IntegrationsDrawer.tsx` + `app/web/lib/data/integrations.ts` | GET `/api/integrations` | `listIntegrationStatus` | catalog | — (unchanged) |
| Install button | `IntegrationsDrawer.tsx` | POST `/api/integrations/:id/install` | `installIntegration` | installer | — |
| API key / model / base URL entry | `IntegrationsDrawer.tsx` (configure) | POST `/api/integrations/:id/configure` | env write + URL validation | catalog env contract | — |
| Researcher settings (provider/apiKey) | `SettingsPanel.tsx` + `settings.ts` | **MUST** change to POST configure (§9) | env write | env contract | adapter consumes resolved model |
| Run execution | run UI (existing) | existing stage API | workflow → Researcher | resolver | adapter → `Agent.invoke/stream` |
| Streaming display | existing run events/SSE | existing SSE | event store | — | adapter event mapper |
| Error display | existing error events | existing SSE | workflow failure path | — | adapter rethrow |
| Integration status badge | `IntegrationsDrawer.tsx` | GET `/api/integrations` | status | status | — |

**Rule: do not create UI controls for capabilities that are not registered and executable.** Therefore: no UI controls for Strands sessions, interrupts, model routing, agent config, or evals in this implementation. The only UI change in scope is removing the localStorage key path in favor of the configure endpoint.

## 22. Execution Proof Matrix

Primary defense against false `PASSED`. A row may only be marked Verified when the cited execution actually ran in this repository.

| Proof | Required | Source/File | Verified |
|---|---|---|---|
| Package installed | YES | `package.json:42`, `package-lock.json:665` (`@strands-agents/sdk@1.17.0`) | YES (present) — installation alone proves nothing further |
| Peer deps resolve to one version | YES | **VERIFIED 2026-09-13:** `npm ls zod` → single `zod@4.6.4` deduped incl. under Strands SDK (satisfies peer `^4.1.12`). `npm ls @ai-sdk/provider` → **UNMET at root** (only nested under `ai@7.0.97`); `VercelModel` runtime-imports it (`vercel.js:1`) → see GAP-STRANDS-01 | PARTIAL — zod YES; `@ai-sdk/provider` NO (root install required) |
| Integration registered | n/a | Strands is not a catalog integration (root dep) | n/a by design |
| Capability registered (adapter module exists + imports resolve) | YES | `backend/agents/researcher/strands-adapter.ts`; `npm run build:backend` | NO — TO BUILD/VERIFY |
| Credential accepted | YES | POST configure → `configured: true` | NO — TO VERIFY at runtime |
| Provider resolved | YES | `resolveActiveIntegrationModel()` returns a model for the configured id | NO — TO VERIFY at runtime |
| Backend route registered | YES (existing) | `http-server.ts:1457/1468/1483` | YES (source) — route presence alone proves no execution |
| Session flow wired | YES (OneShot-native) | existing session/run services | YES for OneShot path; Strands session n/a |
| Workflow entry wired | YES | `workflow.ts` calls adapter when Strands mode enabled | NO — TO BUILD/VERIFY |
| Adapter callable | YES | unit test invoking adapter with a stubbed model | NO — TO BUILD/VERIFY |
| SDK call confirmed | YES | log/trace shows `Agent.invoke`/`agent.stream` executed (not a mocked passthrough) | NO — TO VERIFY |
| Result returned | YES | `result.structuredOutput` flows into `buildResearchBundle` output | NO — TO VERIFY |
| Streaming confirmed | YES (if implemented) | SSE transcript contains ≥1 Strands-derived event during a real run | NO — TO VERIFY |
| Error propagation confirmed | YES | induced provider failure → adapter rethrow → OneShot failure event recorded | NO — TO VERIFY |
| E2E execution confirmed | YES | full run: configure → run → Researcher via Strands → structured draft accepted by OneShot validation → stage completes | NO — TO VERIFY |

**Critical rule:** `PASSED` requires EVERY "TO VERIFY" row Verified from an actual run. Absent any row → `ROOT CAUSE` (§23) or `UNCONFIRMED` (§24). Nothing here has PASSED yet.

## 23. Gaps / ROOT CAUSE

| # | Gap | ROOT CAUSE | File/Symbol |
|---|---|---|---|
| G1 | Strands never executes | No adapter module exists; `@strands-agents/sdk` imported nowhere | `backend/agents/researcher/` (missing `strands-adapter.ts`) |
| G2 | **CONFIRMED 2026-09-13 (GAP-STRANDS-01):** `@ai-sdk/provider` unresolvable from Strands SDK — `VercelModel` runtime-imports `APICallError` from it (`vercel.js:1`), but the package exists only nested under `ai/` (v4.0.13), not at root; Strands declares it an *optional* peer (`^3.0.0`) so npm never installed it where the SDK can resolve it → importing `@strands-agents/sdk/models/vercel` throws `ERR_MODULE_NOT_FOUND` today | Optional peer never materialized at root | root `package.json`; `node_modules/@strands-agents/sdk/dist/src/models/vercel.js:1` |
| G3 | **RESOLVED 2026-09-13 (GAP-STRANDS-02):** `zod@4.6.4` confirmed deduped, single copy, satisfies Strands peer `^4.1.12`. Remaining exposure: transitive-only (no direct root dep). Optional hardening, not a blocker | Transitive-only declaration | root `package.json` |
| G4 | **UNCONFIRMED (GAP-STRANDS-03):** real installed integration providers (`@ai-sdk/google@4.0.67` etc., installed per-integration by `installer.ts`, not at root) may emit `LanguageModelV2` or `V4`, not the `LanguageModelV3` that `VercelModel` requires. Test fixture is a stub; cannot verify from repo alone. Builder must check at adapter-build time and add a minimal spec wrapper inside the adapter if needed | Provider packages are not in the repo to inspect | `backend/integration/installer.ts`; `models/vercel.d.ts` (`provider: LanguageModelV3`) |
| G4 | Keys in localStorage | `settings.ts` persists `apiKey`/`tavilyApiKey` browser-side, contradicting server-side credential policy | `app/web/app/researcher/lib/settings.ts:22-29`, `SettingsPanel.tsx` |
| G5 | No credential-restart persistence | configure route writes `process.env` only | `http-server.ts:1495-1497` (limitation; not silently fixed) |
| G6 | No execution proof exists | no E2E with Strands has ever run in this repo | §22 |

## 24. UNCONFIRMED Items

1. Runtime behavior of `AgentResult.structuredOutput` when the provider ignores the schema (behavior with `@ai-sdk/*@4.0.x` models UNCONFIRMED until E2E).
2. Whether `VercelModel` accepts model instances from `@ai-sdk/google@4.0.67` / `@ai-sdk/anthropic@4.0.52` without type/runtime friction (UNCONFIRMED until compiled and run).
3. Mid-stream candidate-switch semantics (n/a while Model Routing is REJECTED).
4. `strands-agents-mcp-server@0.0.1` purpose/version stability (present but unused; do not wire without confirmation).
5. Event-store write volume under `agent.stream` forwarding in practice (design decided in §11; measured impact UNCONFIRMED).
6. Python `strands_evals` exact PyPI package/version (deferred; verify at install time if approved). **Update 2026-09-13:** Package name and full API surface confirmed from 10 fetched evaluator docs. All evaluators are Python-only; no TS bridge exists. Detectors subsystem pages UNCONFIRMED. See §§41–67 for complete evaluator catalog.

## 25. CONFLICTS

| Conflict | Resolution (source-based) |
|---|---|
| Prior session summary: "Strands requires a Python bridge (incompatible with AI-SDK TS seam)" vs installed `@strands-agents/sdk@1.17.0` (TS) with `VercelModel` explicitly designed to wrap AI-SDK models | **RESOLVED: TS path.** Evidence: `package.json:42`, lock entry, `docs/STRAND_MAPPING` verified from installed type defs, official TS docs. The Python-bridge claim came from reading Strands as the Python SDK; the TS SDK needs no bridge. |
| `docs/plans/Integration_Dependency_UI_Mapping_Plan.md` (Strands REJECT orchestration, ADAPT-only, deferred behind Python worker bridge) vs this plan (TS adapter at model boundary) | **CONFLICT ACKNOWLEDGED.** Core authority conclusions are IDENTICAL (no orchestration, no Strands Graph, no session/interrupt adoption). Difference is only adapter transport (in-process TS vs Python worker). This plan supersedes on transport because it is grounded in the installed TS SDK; the Python-bridge option remains valid only if TS peer-dep verification (G2/G3) fails. |
| `SettingsPanel` localStorage keys vs server-side credential policy | **RESOLVED: server-side.** Configure endpoint is the credential authority (§9, §35). |
| AGENTS.md references `backend/workflow/adk/` which does not exist on disk | Recorded; does not affect this plan (do not create it). |

## 26. Minimum Implementation

1. One new module: `backend/agents/researcher/strands-adapter.ts` — wraps `resolveActiveIntegrationModel()` output in `VercelModel`, builds `Agent`, invokes with `structuredOutputSchema`, optionally streams events.
2. One modified file: `backend/agents/researcher/workflow.ts` — replace the `generateText(...)` call with the adapter call (single call-site; identical inputs/outputs; evidence collection and `buildResearchBundle` untouched; behind an env flag until E2E proves the adapter).
3. Peer-dep verification: **DONE 2026-09-13** — zod satisfied (GAP-STRANDS-02); `@ai-sdk/provider` UNMET at root → install `@ai-sdk/provider@4.0.13` as root dep (GAP-STRANDS-01), then verify `node -e "import('@strands-agents/sdk/models/vercel')..."` resolves.
4. UI credential fix: route `SettingsPanel` key entry through `POST /api/integrations/:id/configure`; stop storing keys in localStorage.
5. Tests: adapter unit test (stub model), workflow integration test, E2E proof run.

Nothing else. No new routes, no catalog changes, no schema changes, no workflow-authority-file changes.

## 27. Files to Create

| Path | Purpose | Owner | Dependencies | Inputs | Outputs |
|---|---|---|---|---|---|
| `backend/agents/researcher/strands-adapter.ts` | Wrap resolved AI-SDK model in `VercelModel`; construct `Agent({ model, systemPrompt, structuredOutputSchema })`; expose `invokeStructured(...)` and `streamEvents(...)`; map Strands events → plain progress messages | Researcher agent module | `@strands-agents/sdk` (root dep), `zod` | `ActiveIntegrationModel`, system prompt, zod schema, event-emit callback | `structuredOutput` / `AgentResult`; progress + error events |
| `backend/tests/ts/strands-adapter.test.ts` | Unit tests with a stubbed AI-SDK model (no network): wrap, invoke, structuredOutput returned, events forwarded, errors rethrown | backend tests | adapter, node:test | stub model | pass/fail |
| `backend/tests/ts/strands-workflow-integration.test.ts` | Prove `ResearcherWorkflow.run` uses the adapter when enabled and still passes OneShot validation; negative: malformed structured output rejected by OneShot validators | backend tests | adapter, workflow, validators | prompt fixture | pass/fail |

## 28. Files to Modify

| Path | Existing responsibility | Exact change | Reason | Dependencies | Risk |
|---|---|---|---|---|---|
| `backend/agents/researcher/workflow.ts` | Research stage: evidence → single `generateText` → bundle | Replace the single model call with the adapter invocation (same resolved model, same prompt, same schema); evidence collection and bundle construction unchanged; env flag e.g. `ONESHOT_RESEARCHER_STRANDS=1` enables it, default off until E2E proves the adapter | Introduce Strands as execution capability at the one model seam | adapter, resolver | MEDIUM — the only model call in the pipeline; mitigate with flag + identical-contract wrapper |
| `app/web/app/researcher/lib/settings.ts` | localStorage settings incl. API keys | Remove `apiKey`/`tavilyApiKey` from persisted settings; keep non-secret prefs (`runtimeMode`, `researchStyle`, provider id) | Credentials must not live in the browser | `SettingsPanel.tsx` | LOW |
| `app/web/app/researcher/components/SettingsPanel.tsx` | Key entry UI writing to localStorage | Key/model/baseURL entry POSTs `/api/integrations/:id/configure`; availability flags derive from `GET /api/integrations` | Single server-side credential path | settings.ts, http-server route | LOW-MEDIUM |
| `package.json` | dependencies | Add `"@ai-sdk/provider": "4.0.13"` (REQUIRED — GAP-STRANDS-01); optionally add `"zod": "^4.6.4"` direct | Strands `VercelModel` runtime import is unresolvable today | npm | MEDIUM (version must stay in lockstep with `ai`) |

## 29. Files That MUST NOT Change

- `backend/workflow/graph.json`, `backend/workflow/canonical-transition.ts` — canonical workflow authority (no Strands Graph).
- `backend/integration/catalog.ts`, `backend/integration/installer.ts` — Strands is NOT a catalog integration; do not register it there.
- `backend/integration/runtime.ts` — resolver is proven; no change needed.
- `backend/schema/` contracts — no payload-contract change required by this plan.
- `backend/validation/python/validation/` — validation authority untouched.
- `backend/agents/researcher/tool/tavily/*` — unrelated integration.
- `backend/server/http-server.ts` integration routes — already sufficient.
- `app/web/components/IntegrationsDrawer.tsx` and other unrelated UI — no controls for non-executable capabilities.
- `app/web/.next/`, `app/web/out/`, `app/web/dist/` — generated output.
- `backend/pipeline/` stage processors (Planner, Refactor, GapAnalysis, Evaluation, ...) — deterministic stages must never become agents.

## 30. Dependency Installation Plan

| package | version | install location | runtime/build dep | reason |
|---|---|---|---|---|
| `@strands-agents/sdk` | `^1.17.0` | root `package.json` | runtime | ALREADY INSTALLED — no action |
| `zod` | `^4.1.12` | root `package.json` (only if direct entry missing) | runtime (peer) | Strands peer; `npm i zod@^4.1.12` |
| `@ai-sdk/provider` | single hoisted version | transitive | runtime | verify only (`npm ls @ai-sdk/provider`); if multiple versions hoist → STOP (§39) |
| `strands_evals` | latest | Python env (tests only) | build/test | DEFERRED — requires explicit approval; not part of this build |

## 31. Registration Plan

Exact registration points (no new registration APIs):
1. **Integration registration:** NONE — Strands is a root dependency, not a catalog entry. Do not touch `catalog.ts`.
2. **Capability registration:** the adapter module is exported from `backend/agents/researcher/strands-adapter.ts` and imported by `workflow.ts`. No registry change.
3. **Provider registration:** none — `VercelModel` wraps the resolver output; the adapter never constructs a provider.
4. **Credential registration:** existing `POST /api/integrations/:id/configure` (`http-server.ts:1486`) → `process.env[spec.apiKeyEnv]`.
5. **Route registration:** none required.
6. **Session registration:** none (no Strands session).
7. **Adapter registration:** instantiated per-invocation inside `workflow.ts` (agents are cheap to construct; reuse the resolved model/provider instance per process).
8. **UI option registration:** none new; `SettingsPanel` binds to the existing configure endpoint.

## 32. Backend Implementation Plan

- **No new routes.** Existing routes suffice (`/api/integrations`, `/:id/install`, `/:id/configure`).
- **Module:** `backend/agents/researcher/strands-adapter.ts`:
  - `createResearcherStrandsAgent(active: ActiveIntegrationModel, systemPrompt: string, schema: ZodType)` → `Agent` with `model = new VercelModel({ provider: active.model })`.
  - `invokeStructured(agent, promptText)` → `AgentResult.structuredOutput`.
  - `streamStructured(agent, promptText, onEvent)` → iterates `agent.stream()`, maps events (§11), returns the final `AgentResult`.
  - Event mapping: Strands event classes → plain `{ kind, message }` progress objects; never persist Strands class instances.
- **Call site:** `workflow.ts` — when `process.env.ONESHOT_RESEARCHER_STRANDS === "1"` and a model resolves, use the adapter; otherwise keep the existing `generateText` path. Identical success contract; errors propagate through the existing stage failure path.
- **Forbidden in backend changes:** constructing providers in the adapter, reading API keys in the adapter, creating a Strands `Graph`/`Swarm`, adopting `SessionManager`/interrupts/interventions.

## 33. Session Implementation Plan

Session lifecycle (all OneShot-owned; nothing new):
1. Session/run creation: existing session services (unchanged).
2. Stage dispatch: canonical transitions (unchanged).
3. Adapter invocation: stateless per stage run; no session id given to Strands.
4. Persistence: run state/artifacts/events in OneShot stores (unchanged).
5. Cancellation: stage abort → generator return → adapter cleanup (no durable Strands state to clean).
6. Restart: OneShot re-reads `.runtime/`; Strands has nothing to recover.

Strands Session Management: NOT ADOPTED (§5.5).

## 34. Streaming Implementation Plan

Event/transport mapping (§11): `agent.stream()` → adapter mapper → existing event emit → existing event store → existing SSE → existing UI. Exact changes: the adapter implements the mapper; `workflow.ts` passes its event-emit callback. Backend transport and UI code: NO changes. Errors: mapper emits an error progress event, then rethrow. Cancellation: `AsyncGenerator.return()` on abort.

## 35. UI Implementation Plan

- `SettingsPanel.tsx`: replace localStorage key persistence with `POST /api/integrations/:id/configure` (body `{ apiKey, model, baseURL }`); on success, refetch `GET /api/integrations` and derive `configured`/`installed` from the response.
- `settings.ts`: drop `apiKey`/`tavilyApiKey` from `ProviderSettings` persistence; read path ignores stored secrets (one-time cleanup of the storage key is acceptable).
- `IntegrationsDrawer.tsx`: unchanged (already binds to the correct endpoints).
- NO new controls for sessions, interrupts, routing, agent config, or evals (not executable).

## 36. Verification Plan

1. Static: `npm run build:backend`, `npm --prefix app/web run typecheck`, `npm run build:test` compile.
2. Registration: adapter imports resolve; `npm ls zod`, `npm ls @ai-sdk/provider` single-version.
3. Unit: adapter tests with a stubbed model (wrap/invoke/events/error rethrow) — no network.
4. Integration: `strands-workflow-integration.test.ts` — workflow uses the adapter; OneShot validators accept valid and reject malformed structured output (negative case proves validation authority).
5. Credential: configure endpoint sets env; status shows `configured: true`; key never appears in any response body (assert).
6. Feature-flag default-off: without the flag, behavior is identical to today (`npm test` still green).

## 37. E2E Proof Plan

Full-chain proof (required before any `PASSED`):
1. Launch server (`./start-web.ps1 -NoBrowser` or `npm start`).
2. `POST /api/integrations/openai/configure` with a real key (or pre-set `OPENAI_API_KEY` with `app/integration/openai` installed via `/install`).
3. Start a run reaching the Researcher stage with `ONESHOT_RESEARCHER_STRANDS=1`.
4. Observe: SSE transcript contains Strands-derived events; a provider HTTP request is actually issued (network/log evidence); `result.structuredOutput` returned; OneShot validators accept the draft; the stage completes and canonical transitions continue.
5. Error case: invalid key → adapter error → OneShot failure event recorded; workflow does not advance.
6. Record every §22 row from this run. Any unverifiable row → ROOT CAUSE report, not PASSED.

## 38. Builder Execution Order

1. Install `@ai-sdk/provider@4.0.13` at root (GAP-STRANDS-01); verify `npm ls @ai-sdk/provider` shows one root-resolvable version and `import('@strands-agents/sdk/models/vercel')` succeeds. Optionally add direct `zod@^4.6.4` (GAP-STRANDS-02). Then verify real provider-package spec version per GAP-STRANDS-03 before designing the adapter wrapper.
2. Create `backend/agents/researcher/strands-adapter.ts` (§32 contract).
3. Create `backend/tests/ts/strands-adapter.test.ts`; run (`npm run build:test`, `npm test`) until green.
4. Modify `backend/agents/researcher/workflow.ts`: add the flag-gated adapter path (§28); keep the default path intact.
5. Create `backend/tests/ts/strands-workflow-integration.test.ts`; run until green (includes the negative validation case).
6. Static verification: `npm run build:backend`, `npm --prefix app/web run typecheck`.
7. Credential path fix: `settings.ts` + `SettingsPanel.tsx` (§35); re-run web tests (`npm --prefix app/web test`).
8. Registration/route verification: confirm no route/catalog/schema diffs are needed; run existing integration tests.
9. Session verification: confirm no Strands session artifacts exist (no `.strands/` writes); run-state remains OneShot's.
10. Streaming verification: enable the flag, run once, assert ≥1 Strands-derived event in the run event transcript.
11. E2E per §37; record §22 rows from the actual run.
12. Record the result honestly; report ROOT CAUSE/UNCONFIRMED for anything unproven. Never mark PASSED from static evidence.

## 39. Builder Stop Conditions

Builder must STOP and report (`ROOT CAUSE / File / Symbol / Observed condition / Expected condition / Required decision`) if:
1. `npm ls @ai-sdk/provider` shows multiple incompatible hoisted versions or a peer conflict → peer-dep seam unusable (G2).
2. `zod@^4.1.12` cannot be installed alongside existing deps (G3).
3. `VercelModel` rejects the resolver's model instance at compile or runtime (adapter shape unknown — §24.2).
4. `Agent({ structuredOutputSchema })` does not return `result.structuredOutput` on the installed 1.17.0 build (interface mismatch).
5. Any change would require editing `graph.json` / `canonical-transition.ts` / validation code → workflow ownership would change — STOP by rule.
6. The only way to make structured output work is to replace OneShot validation → forbidden.
7. The `SettingsPanel` refactor cannot avoid persisting keys browser-side → API-key path unsafe → STOP.
8. The adapter cannot produce events/errors through the existing event bus without modifying transport → seam does not exist → STOP and report.
9. A test cannot prove actual execution (only import/static success) → do not claim PASSED; report ROOT CAUSE.
10. Any requested behavior would create a Strands session store, interrupt bridge, or model router → out-of-authority scope → STOP.

## 40. Final Builder Handoff

```text
BUILD_TARGET

Integration: Strands Agents (TS) as the execution adapter at the Researcher's single
  model seam. NOT a catalog integration; NOT an orchestration engine.

Capability: Strands Agent (+ VercelModel + structuredOutputSchema + optional event
  streaming) wrapping the existing resolved AI-SDK model in ResearcherWorkflow.
  Deferred (do not build): SessionManager, Interrupts, Interventions, ModelRouter,
  Experimental AgentConfig. Deferred test-only: strands_evals — Python-only;
  evaluators catalogued in §§41–67; three-path analysis in §61 recommends skip for
  initial build.

Provider: none new. Provider = whatever resolveActiveIntegrationModel() returns,
  wrapped by VercelModel({ provider }). Keys come from process.env via the existing
  configure route only.

Required Packages:
  - @strands-agents/sdk@^1.17.0 — ALREADY INSTALLED (package.json:42). No install.
  - zod@^4.1.12 direct entry if `npm ls zod` lacks one (peer requirement).
  - Verify a single hoisted @ai-sdk/provider (STOP condition 1).

Required Registrations:
  - Integration: NONE (root dependency; catalog.ts untouched).
  - Capability: backend/agents/researcher/strands-adapter.ts export.
  - Provider: NONE (wrap only). Credential: existing POST /api/integrations/:id/configure.
  - Route: NONE. Session: NONE. UI option: none new.

Required Backend Changes:
  - Create backend/agents/researcher/strands-adapter.ts (createResearcherStrandsAgent,
    invokeStructured, streamStructured; event mapper per §11).
  - Modify backend/agents/researcher/workflow.ts: flag-gated
    (ONESHOT_RESEARCHER_STRANDS=1) replacement of the single generateText call.
    No other backend files.

Required Session Changes: NONE (no Strands session; run state stays RunRepository).

Required Streaming Changes: adapter-only event mapping into the existing event emit;
  no transport or UI changes.

Required UI Changes: SettingsPanel.tsx + settings.ts — remove localStorage secret
  persistence; key entry via POST /api/integrations/:id/configure; availability flags
  from GET /api/integrations. IntegrationsDrawer unchanged.

Required Tests:
  - backend/tests/ts/strands-adapter.test.ts (stub model: wrap/invoke/events/error).
  - backend/tests/ts/strands-workflow-integration.test.ts (workflow path + negative
    OneShot-validation case).
  - Existing suites stay green with the flag off (npm test, web tests).

Required E2E Proof: §37 chain executed live; §22 every row Verified from that run.
  configured:true or successful key validation is NOT execution proof.

Files Create: backend/agents/researcher/strands-adapter.ts;
  backend/tests/ts/strands-adapter.test.ts;
  backend/tests/ts/strands-workflow-integration.test.ts.

Files Modify: backend/agents/researcher/workflow.ts (flag-gated call-site);
  app/web/app/researcher/lib/settings.ts;
  app/web/app/researcher/components/SettingsPanel.tsx;
  package.json (only if zod direct entry missing).

Files Preserve: backend/workflow/graph.json; backend/workflow/canonical-transition.ts;
  backend/integration/{catalog.ts,installer.ts,runtime.ts}; backend/schema/;
  backend/validation/python/validation/; backend/agents/researcher/tool/tavily/*;
  backend/server/http-server.ts; backend/pipeline/ stage processors;
  app/web/components/IntegrationsDrawer.tsx; generated app/web/{.next,out,dist}.

Known ROOT CAUSE: G1 no adapter exists (primary); G2/G3 peer deps unverified;
  G4 localStorage keys; G5 no credential restart persistence (limitation);
  G6 no execution proof yet.

UNCONFIRMED: §24 items 1-6 (structuredOutput runtime behavior; VercelModel acceptance
  of @ai-sdk 4.x instances; mcp-server stability; event volume; strands_evals version).

CONFLICT: §25 — prior Python-bridge conclusion vs installed TS SDK (resolved: TS path,
  with Python-bridge fallback only if G2/G3 stops the build).

Stop Conditions: §39 items 1-10. On stop: report ROOT CAUSE / File / Symbol / Observed /
  Expected / Required decision. Do not silently redesign.

Definition of Done (executable proof required — documentation or static claims are
  insufficient):
  1. npm run build:backend, npm --prefix app/web run typecheck, npm run build:test pass.
  2. npm ls zod and npm ls @ai-sdk/provider show a single compatible resolution.
  3. New unit + integration tests pass; all existing suites pass with the flag off.
  4. A live E2E run per §37 completes: real provider request issued, Strands-derived
     events present in the run transcript, structuredOutput produced, OneShot validation
     accepts the draft, workflow continues; error case recorded as a failure event.
  5. §22 every row marked Verified from that run (or ROOT CAUSE reported — never PASSED
     by default).
  6. No file in "Files Preserve" was modified; no localStorage secrets remain.
```

---

*End of plan. Companion documents: `docs/STRAND_MAPPING` (installed-SDK API verification), `docs/plans/Strands_Integration_Mapping_Discovery.md` (source-of-truth audit), `docs/plans/Integration_Dependency_UI_Mapping_Plan.md` (UI/dependency mapping).*

---

## 41. Strands Evals SDK — Discovery

**Source:** All 10 Strands Evaluators documentation pages fetched live 2026-09-13 from `strandsagents.com/docs/user-guide/evals-sdk/evaluators/`. Content verified; all claims below are sourced from official docs unless marked UNCONFIRMED.

| Fact | Finding |
|---|---|
| Package | `strands_evals` (Python-only). Imports: `from strands_evals import Case, Experiment`, `from strands_evals.evaluators import ...`, `from strands_evals.mappers import StrandsInMemorySessionMapper`, `from strands_evals.telemetry import StrandsEvalsTelemetry` |
| Language | **Python-only.** Every code example uses `import asyncio`, `from strands import Agent` (Python Strands SDK), `async def`. No TypeScript examples exist in any evaluator page. |
| Installed in repo? | **NO.** `@strands-agents/evals` does not exist in npm. Only `@strands-agents/sdk@1.17.0` is installed, and it contains zero eval-related `.d.ts` files (confirmed: `dir` of `dist/` — no `evaluator`, `evaluators`, `evals` exports). The TS SDK has no evaluation module. |
| Relationship to TS SDK | Evaluators operate on `Session` objects from the Python `strands` Agent SDK (not the TS `@strands-agents/sdk`). They consume OpenTelemetry spans via `StrandsInMemorySessionMapper`. The TS SDK's trace representation is a different code path. |
| Classification | **OPTIONAL test-only** (matches §1 item 6). Evaluators cannot evaluate the TS adapter without a Python bridge or a reimplementation against OneShot's own trace/event data. |

## 42. Evaluator Architecture

Every evaluator follows the same pipeline:
```
Agent runs with OpenTelemetry tracing
  → StrandsEvalsTelemetry().setup_in_memory_exporter() captures spans
    → StrandsInMemorySessionMapper().map_to_session(spans, session_id=case.session_id)
      → Session object produced
        → task_function returns {"output": str(response), "trajectory": session}
          → Experiment.run_evaluations_async() feeds EvaluationData to each evaluator
            → Each evaluator returns list[EvaluationOutput]
```

**Required task_function contract:**
```python
def task_function(case: Case) -> dict:
    agent = Agent(
        trace_attributes={"session.id": case.session_id},  # REQUIRED for mapper
        callback_handler=None
    )
    response = agent(case.input)
    spans = telemetry.in_memory_exporter.get_finished_spans()
    mapper = StrandsInMemorySessionMapper()
    session = mapper.map_to_session(spans, session_id=case.session_id)
    return {"output": str(response), "trajectory": session}
```

**Critical constraint:** `trace_attributes={"session.id": case.session_id}` is mandatory. Without it, spans from different test cases mix in the memory exporter.

## 43. Core Types

| Type | Fields | Notes |
|---|---|---|
| `Case[InputT, OutputT]` | `name`, `input`, `expected_assertion` (opt), `expected_output` (opt), `metadata` (opt dict), `session_id` | Generic over input/output |
| `Experiment[InputT, OutputT]` | `cases`, `evaluators` | Orchestrates: runs task_function per case, feeds results to evaluators |
| `EvaluationData[InputT, OutputT]` | `case`, `actual_output`, `actual_trajectory`, `task_result`, `metadata`, `experiment` | What every evaluator receives |
| `EvaluationOutput` | `score` (0.0–1.0), `test_pass` (bool), `reason` (str), `label` (str) | Every evaluator returns `list[EvaluationOutput]` |

## 44. LLM Evaluators — Shared Parameters

All LLM-based evaluators share: `model` (optional str, judge model), `system_prompt` (optional str, custom judge prompt), `version` (optional str).

**Evaluation level:** "turn" (per-response), "session" (full session), or "per-tool-call" (per invocation). Quality evaluators are turn-level; failure/goal evaluators are session-level; tool evaluators are per-tool-call.

## 45. Output Quality Evaluators

| Evaluator | Level | Scoring | Key Behavior |
|---|---|---|---|
| **OutputEvaluator** | turn | Custom rubric (0.0–1.0) | Flexible LLM judge with user-defined rubrics |
| **HelpfulnessEvaluator** | turn | Graduated (0.0–1.0) | Helpfulness from user perspective |
| **CorrectnessEvaluator** | turn | 3-level (1.0/0.5/0.0) w/o ref; binary w/ `expected_assertion` | Auto-switches to reference mode when `expected_assertion` is set on Case |
| **CoherenceEvaluator** | turn | Graduated (0.0–1.0) | Logical flow and cohesion |
| **ConcisenessEvaluator** | turn | Graduated (0.0–1.0) | Brevity and absence of filler |
| **ResponseRelevanceEvaluator** | turn | Graduated (0.0–1.0) | Relevance to user question |
| **FaithfulnessEvaluator** | turn | Graduated (0.0–1.0) | Grounded in conversation history (not hallucinated) |
| **InstructionFollowingEvaluator** | turn | Graduated (0.0–1.0) | Explicit prompt/system instructions followed |

**OneShot relevance:** CorrectnessEvaluator (reference mode) and FaithfulnessEvaluator are most relevant for Researcher output. OneShot's Triple Validation (Schema+Fixture) already provides a deterministic superset of correctness checking.

## 46. Trajectory Evaluator

`TrajectoryEvaluator` — evaluates the sequence of tool calls (session-level). Did the agent choose the right tools in the right order? Differs from GoalSuccessRate (outcome vs path) and ToolSelectionAccuracy (holistic sequence vs per-call).

**OneShot relevance:** LOW. The Researcher has exactly one tool call (`VercelModel`); trajectory evaluation is nearly vacuous.

## 47. Interactions Evaluator (Multi-Agent)

`InteractionsEvaluator` — multi-agent coordination quality. Requires `interactions` list with `node_name`, `dependencies`, `messages` per agent node. Optional per-node `rubric`. Supports linear, parallel, and conditional flow patterns.

**OneShot relevance:** NONE. Serial, deterministic pipeline with a single LLM call — not a multi-agent system.

## 48. Goal Success Rate Evaluator

`GoalSuccessRateEvaluator` — binary (Yes 1.0 / No 0.0) session-level goal achievement. With `expected_assertion` on case, LLM compares outcome against expected assertion. "Partial success is failure" — requires full goal achievement. Use `HelpfulnessEvaluator` or `PartialCompletionEvaluator` for partial assessment.

**OneShot relevance:** HIGH for E2E. Maps to "did the Researcher produce a valid draft?" — though OneShot's Goal validation already provides this.

## 49. Failure Communication Evaluator

`FailureCommunicationEvaluator` — session-level, scalar 0.0–1.0. Evaluates how well the agent communicates tool failures (vs. silent fabrication or ignoring errors). Returns 0.5 when no tool failures exist (by design). Differs from RecoveryStrategy (communication vs action) and Faithfulness (error honesty vs factual grounding). **Cannot prove** transport errors or propagation fidelity — only the agent's textual response.

**OneShot relevance:** MEDIUM for chaos testing under induced failures. Cannot replace the §22 error-propagation proof.

## 50. Partial Completion Evaluator

`PartialCompletionEvaluator` — session-level, continuous 0.0–1.0 (fraction of sub-goals completed despite failures). Differs from GoalSuccessRate (binary vs fractional), RecoveryStrategy (outcome vs process), Helpfulness (session progress vs turn quality). Single-step tasks produce binary results by design.

**OneShot relevance:** LOW. Researcher produces a single structured output; no sub-goals to measure fractionally.

## 51. Recovery Strategy Evaluator

Referenced as `RecoveryStrategyEvaluator` in cross-references. Differs from FailureCommunication (action vs communication) and PartialCompletion (process vs outcome). **UNCONFIRMED** — no dedicated doc page fetched; Builder must read directly before implementing.

## 52. Tool Selection Accuracy Evaluator

`ToolSelectionAccuracyEvaluator` — per-tool-call, binary (Yes 1.0 / No 0.0). Examines available tools, conversation history, target tool call (name, arguments, timing). Detects wrong tool, premature call (before gathering info), missing call (should have used a tool but didn't). Each tool invocation yields one `EvaluationOutput`.

**OneShot relevance:** LOW. Researcher has exactly one tool (`VercelModel`); no selection decisions.

## 53. Tool Parameter Accuracy Evaluator

`ToolParameterAccuracyEvaluator` — per-tool-call, binary (Yes 1.0 / No 0.0). Examines available tools, conversation history, target tool call params. Key judgment: "Can each parameter value be traced back to information in the conversation history?" Detects invented values, hallucinated parameters, extraction errors. Common issues: false negatives when context incomplete, inconsistent results from LLM non-determinism (aggregate over multiple runs).

**OneShot relevance:** LOW. `VercelModel` parameters are framework-determined, not agent-chosen.

## 54. Safety Evaluators

| Evaluator | Level | Scoring | What It Detects |
|---|---|---|---|
| **RefusalEvaluator** | turn | Binary (Yes=1.0 addresses prompt, No=0.0 refuses) | Direct declines, rejections with alternative topics. NOT a refusal: initial refusal then answer, irrelevant but non-refusing response |
| **HarmfulnessEvaluator** | turn | Graduated (0.0–1.0) | Harmful content in responses |
| **StereotypingEvaluator** | turn | Graduated (0.0–1.0) | Bias and stereotypical content |

**OneShot relevance:** LOW. Researcher produces structured research output, not user-facing chat. Relevant only if safety guardrails are later added.

## 55. Multimodal Evaluators

`MultimodalOutputEvaluator`, `MultimodalOverallQualityEvaluator`, `MultimodalCorrectnessEvaluator`, `MultimodalFaithfulnessEvaluator`, `MultimodalInstructionFollowingEvaluator` — all turn-level, graduated scoring. **OneShot relevance: NONE** — no multimodal capabilities.

## 56. Deterministic Evaluators — Overview

Code-based (no LLM judge), fast, CI/CD-safe. Use alongside LLM evaluators: deterministic first pass, LLM for nuance.

| Evaluator | Input | Checks | Output | Needs Session? |
|---|---|---|---|---|
| **Equals** | `value` (str), `case_sensitive` (bool, default True) | Output == expected | Binary 1.0/0.0 | NO |
| **Contains** | `value` (str), `case_sensitive` (bool, default True) | Substring in output | Binary 1.0/0.0 | NO |
| **StartsWith** | `value` (str), `case_sensitive` (bool, default True) | Output prefix match | Binary 1.0/0.0 | NO |
| **ToolCalled** | `tool_name` (str) | Tool invoked in trajectory | Binary 1.0/0.0 | YES |
| **StateEquals** | `name` (str), `value` (opt) | Environment state matches expected | Binary 1.0/0.0 | YES |

`StateEquals` with `value=None` uses `expected_environment_state` from the Case. `ToolCalled` works with both list-based trajectories and Session objects.

## 57. Deterministic Evaluator Details — Equals

`Equals(value="expected", case_sensitive=True)` proves character-for-character identical output. Cannot prove semantic equivalence, partial correctness, or intent. Best for regression tests where exact format is contractual.

## 58. Deterministic Evaluator Details — ToolCalled & StateEquals

`ToolCalled(tool_name="calculator")` proves the named tool was invoked at least once. Cannot prove correct parameters, timing, or sequence.

## 59. Custom Evaluator

| Field | Detail |
|---|---|
| Base class | `Evaluator[InputT, OutputT]` from `strands_evals.evaluators` |
| Required methods | `evaluate(evaluation_case: EvaluationData) -> list[EvaluationOutput]`, `evaluate_async(...)` |
| Accessible data | `case` (Case object), `actual_output`, `actual_trajectory` (Session with tool calls), `task_result` (full dict), `metadata`, `experiment` |
| Return | Must return `list[EvaluationOutput]` — even for single-result evaluations |

**Can it test OneShot-specific conditions?** PARTIALLY. Custom evaluators can access `case.metadata` (arbitrary dict) and `actual_trajectory` (tool calls), but have **zero visibility into OneShot internals** (workflow state, artifact store, hash chain, build review gates). "Integration registered" can be checked via metadata; "SDK call observed" via trajectory tool calls. "Plan identity preserved" or "hash equality confirmed" cannot be tested — those are OneShot-owned.

**Example** (from docs):
```python
class KeywordEvaluator(Evaluator[str, str]):
    def __init__(self, required_keywords: list[str], case_sensitive: bool = True):
        self.required_keywords = required_keywords
        self.case_sensitive = case_sensitive

    def evaluate(self, evaluation_case):
        output_text = str(evaluation_case.actual_output)
        if not self.case_sensitive:
            output_text = output_text.lower()
            keywords = [k.lower() for k in self.required_keywords]
        else:
            keywords = self.required_keywords
        found = [kw for kw in keywords if kw in output_text]
        missing = [kw for kw in keywords if kw not in output_text]
        score = len(found) / len(keywords) if keywords else 1.0
        return [EvaluationOutput(
            score=score, test_pass=score == 1.0,
            reason=f"Found: {found}. Missing: {missing}.",
            label=f"{len(found)}/{len(keywords)} keywords"
        )]

    async def evaluate_async(self, evaluation_case):
        return self.evaluate(evaluation_case)
```

## 60. Detectors (Separate Subsystem)

The Strands Evals SDK sidebar lists Detectors as sibling to Evaluators: **Failure Detection**, **Root Cause Analysis**, **Session Diagnosis**. Separate evaluation subsystem. **UNCONFIRMED** — no dedicated detector pages fetched.

## 61. Integration Gap: Python Evals vs TS Adapter

**Fundamental gap:**

| Concern | Detail |
|---|---|
| OneShot seam | `@strands-agents/sdk@1.17.0` (TypeScript) |
| Strands evaluators | `strands_evals` (Python-only) |
| Can evaluators consume TS output? | Only through captured traces. Evaluator pipeline expects OTel spans from Python Agent SDK. TS SDK may/may not emit compatible spans. |
| TS evaluator bridge? | **NO.** Zero eval exports in SDK dist. |
| Reimplementation feasible? | **Yes.** Deterministic evaluators trivial. LLM evaluators need a model call but straightforward. ToolCalled/StateEquals need OneShot's event data. |

**Three paths:** (A) Python bridge — serialize TS output, run Python evaluators (dual-language overhead). (B) TS reimplementation — reimplement key logic against OneShot's event stream. (C) Skip — use OneShot's Triple Validation + §22 proof matrix (already stricter).

**Recommendation:** Option C for initial build. Option B if evaluators later needed.

## 62. Evaluator-to-OneShot Mapping

| Evaluator | Value | Already Covered | Notes |
|---|---|---|---|
| CorrectnessEvaluator (ref) | HIGH | Schema+Fixture validation | OneShot is deterministic, stricter |
| FaithfulnessEvaluator | MEDIUM | None | Could detect hallucination |
| GoalSuccessRateEvaluator | MEDIUM | Goal validation | OneShot more precise |
| FailureCommunicationEvaluator | MEDIUM | §22 error proof | Chaos testing; not a replacement |
| Deterministic (Contains/Equals) | HIGH | Unit tests | Trivial regression guards |
| TrajectoryEvaluator | LOW | n/a | Single-tool Researcher |
| ToolSelectionAccuracy | NONE | n/a | Single-tool Researcher |
| ToolParameterAccuracy | NONE | n/a | Framework-determined params |
| InteractionsEvaluator | NONE | n/a | Not multi-agent |
| Safety evaluators | LOW | n/a | Research output, not chat |
## 63. Implementation Recommendations

1. **Do not install `strands_evals` now.** Python-only, absent from repo, proof matrix (§22) doesn't require it.
2. **Preserve evaluator awareness as documentation** — §§41–62 let future Builder iterations reference the catalog without re-researching.
3. **If evaluators later approved:** Implement Contains/Equals in TS test utilities (zero deps). Optionally implement CorrectnessEvaluator-equivalent as LLM judge helper. Do NOT build a Python bridge.
4. **Proof matrix (§22) + verification plan (§36) are the evaluation strategy.** Every proof row is more specific and authoritative than any generic evaluator.

## 64. Evaluator Risk Registry

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Strands releases TS evaluator package | LOW | Plan update only | This doc preserves all research |
| `strands_evals` session format diverges from TS | MEDIUM | Bridge needs format translation | Skip bridge (Option C) |
| LLM evaluator non-determinism → flaky tests | HIGH | CI signal degradation | Deterministic for CI; LLM for gating only |
| Evaluator coverage creates false confidence | MEDIUM | Evaluators pass, integration broken | Proof matrix is authoritative |

## 65. Evaluator Documentation Index

All pages fetched 2026-09-13 from `strandsagents.com/docs/user-guide/evals-sdk/evaluators/`:

**Fetched & analyzed (10):** Interactions, Correctness, Refusal, GoalSuccessRate, FailureCommunication, PartialCompletion, ToolSelectionAccuracy, ToolParameterAccuracy, Deterministic, Custom.
**Sidebar-confirmed, not individually fetched (16):** Output, Trajectory, Helpfulness, Faithfulness, Coherence, Conciseness, ResponseRelevance, Harmfulness, Stereotyping, InstructionFollowing, Multimodal variants.
**UNCONFIRMED:** RecoveryStrategyEvaluator (no dedicated page found), Detectors subsystem (Failure Detection, Root Cause Analysis, Session Diagnosis — separate category).

## 66. Build-Ready Status for Evaluators

**Evaluators are NOT in the build scope.** Per §1 item 6 and §40: OPTIONAL test-only, DEFERRED. This documentation (§§41–65) exists to:

1. Ground future Builder decisions with researched facts rather than assumptions.
2. Prevent re-researching the same 10 documentation pages.
3. Document the Python-only gap — no one should try `import { CorrectnessEvaluator } from "@strands-agents/sdk"`.
4. Preserve the evaluator-to-OneShot mapping (§62) for future consideration.

## 67. Evaluator Builder Handoff

```text
EVALUATOR_STATUS: RESEARCHED / NOT IN BUILD SCOPE

Finding: Strands Evals SDK (strands_evals) is Python-only. All 10 fetched evaluator
  pages confirm Python examples only. @strands-agents/sdk@1.17.0 contains zero
  evaluator exports. No TypeScript evaluator bridge exists.

Evaluators documented: 21 LLM-based + 5 deterministic + custom base class + 3 detector
  categories. See §§44–60 for complete catalog.

Integration gap: Python evaluators cannot natively consume TypeScript Agent output.
  Three paths: Python bridge (complex), TS reimplementation (maintainable), or skip
  (current recommendation). See §61.

Recommendation: Skip evaluators for initial build. OneShot's Triple Validation
  (Schema + Fixture + Goal) and the §22 proof matrix are stricter proofs.

If evaluators are later approved:
  - Implement Contains/Equals deterministic evaluators in TS (trivial, no deps).
  - Optionally implement CorrectnessEvaluator-equivalent as LLM judge test helper.
  - Do NOT build a Python bridge.
  - Reference §§41–65 for complete evaluator catalog and semantics.

UNCONFIRMED: RecoveryStrategyEvaluator page not fetched (only cross-references);
  Detector subsystem pages not fetched; strands_evals PyPI package/version not verified.
```















