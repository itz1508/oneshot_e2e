# Integration, Dependency & UI Mapping — Implementation Plan

Status: planning artifact (discovery-derived; not Build Ready; no code in this change).
Source of truth: `docs/plans/Strands_Integration_Mapping_Discovery.md` (prior discovery) plus
direct inspection of OneShot seams on 2026-09-13. Evidence tags per §20 of the task:
SOURCE OBSERVED / DOCUMENTED / INFERRED / UNCONFIRMED.

## 1. Executive Finding

OneShot already has the full integration machinery this plan needs; the work is
**extension, not construction** (SOURCE OBSERVED):

- `backend/integration/catalog.ts` is a declarative provider catalog (package, factory
  export, credential env, model env, base URL). It contains `gemini`, `openai`,
  `anthropic` — OpenAI is already catalogued (SOURCE OBSERVED).
- `backend/integration/runtime.ts` detects installed packages under
  `app/integration/<id>/node_modules/`, loads them via `createRequire`, instantiates the
  AI-SDK provider model, and `resolveActiveIntegrationModel()` feeds the Researcher
  (SOURCE OBSERVED).
- `backend/integration/installer.ts` installs packages with
  `npm install --prefix app/integration/<id> --ignore-scripts` (SOURCE OBSERVED).
- `backend/server/http-server.ts` exposes `GET /api/integrations`,
  `POST /api/integrations/:id/install`, `POST /api/integrations/:id/configure`
  (credentials into server-side `process.env`; never returned to the browser)
  (SOURCE OBSERVED).
- Tavily research capability already exists end-to-end:
  `backend/agents/researcher/tool/tavily/{evidence.ts,bridge.ts,worker.py}` — modes
  `off | search | search-extract | research-stream`, selected by env
  (`TAVILY_API_KEY`, `ONESHOT_TAVILY_MODE`) and folded into the Researcher evidence
  collector (SOURCE OBSERVED).
- UI has an integrations surface (`app/web/components/IntegrationsDrawer.tsx`) but it is
  a **static, browser-side seed** (`lib/data/integrations.ts`) with no backend binding;
  a separate researcher-route `SettingsPanel` stores provider/API keys in
  `localStorage`, which conflicts with the credentials-stay-server-side invariant
  (SOURCE OBSERVED).

Therefore the smallest proof path is: **add capability metadata to the existing
catalog/registry (no new registry), surface the existing Tavily modes and the existing
OpenAI catalog entry through the existing `/api/integrations` endpoints, and bind the
IntegrationsDrawer to real backend status.** A Strands integration is addable later as
a second provider-family using the same declarative spec shape (documented below),
because the Researcher's model seam is AI-SDK shaped — the TypeScript
`@strands-agents/sdk` (already in root `package.json`) plugs into that seam via its
`VercelModel` adapter (verified in `node_modules/@strands-agents/sdk/dist/src/models/vercel.js`;
requires root `@ai-sdk/provider` install per GAP-STRANDS-01). A Python worker bridge
remains only a fallback if the TS peer-dep verification fails (see §5).

## 2. Existing OneShot Seams (verified)

| Seam | Location | Behavior | Evidence |
| --- | --- | --- | --- |
| Provider catalog | `backend/integration/catalog.ts` | Declarative `IntegrationPackageSpec`: `packageName`, `packageVersion`, `factoryExport`, `apiKeyEnv`, `baseURLEnv`, `defaultBaseURL`, `modelEnv`, `defaultModel`, `bundled` | SOURCE OBSERVED |
| Package load/status | `backend/integration/runtime.ts` | `integrationStatus` (installed = `app/integration/<id>/node_modules/<pkg>/package.json` exists; configured = api-key env non-empty), `loadIntegrationModel`, `resolveActiveIntegrationModel` (first installed+configured, optional `preferredId`) | SOURCE OBSERVED |
| Installer | `backend/integration/installer.ts` | npm-scoped install into integration-local dir; runtime package storage only | SOURCE OBSERVED |
| HTTP API | `backend/server/http-server.ts:1457–1515` | list / install / configure; configure writes `process.env` server-side; base URL validated by `resolveIntegrationBaseURL` (SSRF guards) | SOURCE OBSERVED |
| Model consumer | `backend/agents/researcher/workflow.ts` | `modelCapability` cases A–E; Case D resolves via `resolveActiveIntegrationModel`; provenance recorded (`modelSource`, `modelProvenance`); Case E = `RESEARCH_CAPABILITY_UNAVAILABLE` | SOURCE OBSERVED |
| Research capability | `backend/agents/researcher/tool/evidence/collector.ts` + `tool/tavily/*` | Tavily evidence merged into `gathered`; failure tolerated unless `ONESHOT_TAVILY_REQUIRED` | SOURCE OBSERVED |
| Skill/tool runtime | `backend/integration/skill-runtime.ts`, `backend/agents/researcher/tool/registry.ts` | timeout+provenance wrapper; `research` tool registration | SOURCE OBSERVED |
| UI integrations surface | `app/web/components/IntegrationsDrawer.tsx` + `app/web/lib/data/integrations.ts` | static seed, no API calls, support labels only | SOURCE OBSERVED |
| UI researcher settings | `app/web/app/researcher/components/SettingsPanel.tsx`, `lib/settings.ts` | provider select (openai/anthropic), API key + Tavily key in `localStorage` — browser-side | SOURCE OBSERVED |

## 3. Integration Architecture (ownership)

```text
OneShot (backend/integration + workflow)  owns: workflow, roles, state, validation,
    promotion, authorization, capability registry, credential policy
Integration (app/integration/<id> + optional adapter)  owns: SDK dependency,
    configuration, SDK->seam adapter, capability surface
External SDK (AI SDK provider pkg / strands-agents / tavily-python)  owns: provider
    capability
```

The existing catalog **is** the capability registry at the model-capability level.
Missing but small: a per-provider **capability list** on the spec (e.g.
`capabilities: ["agent_model"]`) and a Tavily spec entry. No second registry is
justified — the existing mechanism already covers discovery, status, install,
configure, availability (SOURCE OBSERVED); extension only (INFERRED).

## 4. Provider/Capability Model

OneShot's workflow requires exactly two capability kinds today (SOURCE OBSERVED):

```text
Research capability     -> consumed by Researcher evidence collection
                        -> providers: Tavily (exists); Strands http_request tool (candidate)
Agent/model capability  -> consumed by Researcher Case D via resolveActiveIntegrationModel
                        -> providers: Gemini (bundled), OpenAI, Anthropic (catalogued)
```

Resolution stays provider-agnostic: the workflow asks for "research" or "agent model";
the registry resolves whichever installed+configured integration declares that
capability. Changing provider never changes `graph.json` or `canonical-transition.ts`
(stage order and loops are integration-blind; SOURCE OBSERVED).

## 5. Strands Mapping

**Update 2026-09-13 (gap run):** the TypeScript SDK path is now the confirmed primary
route: `VercelModel` in the installed `@strands-agents-sdk` performs a **runtime**
import of `@ai-sdk/provider` (not type-only — GAP-STRANDS-01), so that package must be
root-installed (`npm i -E @ai-sdk/provider@4.0.13`). The Python bridge below is the
**fallback only** (GAP-STRANDS-03: if the installed provider packages do not satisfy
`LanguageModelV3` structurally). Spec: `docs/plans/Strands_Integration_Implementation_Plan.md` §8/§25.

Strands is also available as a **Python** SDK (`strands-agents`). Per-capability
classification (TS-SDK route superseded where marked):

| Strands capability | Source | Classification | Rationale |
| --- | --- | --- | --- |
| Agent execution (`Agent`, model config) | TS SDK `Agent` + `VercelModel` (verified on disk) | **ADAPT — CONFIRMED** as a provider: `new VercelModel({ provider: active.model })` satisfies the AI-SDK seam; pending GAP-STRANDS-03 spec-version check | SOURCE OBSERVED |
| Structured output (`structured_output_model`, Pydantic) | structured_output example (fetched 2026-09-13) | **ADAPT** — OneShot already gets structured drafts via AI SDK `generateText` + `parseStructuredDraft`; Strands adds nothing mandatory | SOURCE OBSERVED |
| MCP client (`MCPClient`, `list_tools_sync`) | mcp_calculator example (fetched) | **USE** as future tool edge behind `backend/tool/`/skills; never `expose_agent` (per discovery 2.1) | SOURCE OBSERVED |
| http_request tool | agents_workflows example (fetched) | **ADAPT** as research capability alternative — but OneShot already has a stricter-egress Tavily/collector path; only if a non-Tavily research source is wanted | SOURCE OBSERVED |
| Workflow primitives (multi-agent orchestration, graph loops) | agents_workflows, graph_loops_example | **REJECT** — must not become a second orchestration system (canonical invariant) | DOCUMENTED invariant |
| Memory/session (`memory_agent` example) | reference URL | **INFORM** — conversation-session only; never run state (`backend/runtime/`) | per discovery 2.2/2.3 |
| File operations tool | file_operations example | **REJECT/INFORM** — workspace path policy + sandbox admission are OneShot's; external file tooling must not bypass them | INFERRED from invariants |
| Meta-tooling (dynamic tool creation) | meta_tooling example | **INFORM** — dynamic tool surface conflicts with curated-tool rule | INFERRED |
| Knowledge-base agent | knowledge_base_agent example | **INFORM** — retrieval storage layer, additive at best | INFERRED |

**Fallback shape (only if GAP-STRANDS-03 fails):** a Python worker bridge
mirroring `tool/tavily/worker.py` (stdin/stdout JSON envelope, timeout, secret
redaction), declared as a catalog entry with `runtime: "python"` — a spec extension
that does not exist today (UNCONFIRMED as an existing seam; INFERRED as the smallest
adapter). Pip deps would be integration-local: `strands-agents` (version pin
UNCONFIRMED), plus per-capability extras.

## 6. Tavily Mapping

Tavily is **already implemented**; classification shifts from "integrate" to
"surface":

| Tavily capability | OneShot capability | Adapter | Registration | UI | Status |
| --- | --- | --- | --- | --- | --- |
| Search (`op:"search"`) | Research (evidence) | `TavilyEvidenceCollector` | implicit via collector + `TAVILY_API_KEY` | none (env-only) | EXISTS — UI exposure needed |
| Extract (`op:"extract"`) | Research (evidence) | same (`search-extract` mode) | same | none | EXISTS |
| Research stream (`op:"research_stream"`) | Research (evidence) | same (`research-stream` mode) | same | none | EXISTS |
| Crawl / Map | — | not present in `worker.py` request union | — | — | NOT FOUND in source; do not assume |

Mode selection today is env-driven (`ONESHOT_TAVILY_MODE`, defaults to
`search-extract` when `TAVILY_API_KEY` present; `off` otherwise — SOURCE OBSERVED).
The plan is to expose those exact modes as UI capability toggles bound to a backend
config surface, not to invent new Tavily endpoints. Capability defaults: search
available when key configured; extract and research-stream selectable; crawl/map
unavailable (no adapter).

## 7. OpenAI Mapping

OpenAI is already a catalogued model provider (SOURCE OBSERVED):

```text
Package:    @ai-sdk/openai@4.0.65 (catalog.ts) — integration-local npm install
Credential: OPENAI_API_KEY (configure endpoint writes it server-side)
Base URL:   OPENAI_BASE_URL, default https://api.openai.com/v1 (SSRF-validated)
Model:      OPENAI_MODEL / default gpt-5-mini
Adapter:    loadIntegrationModel -> createOpenAI({apiKey, baseURL})(model)
Registration: installed+configured status via /api/integrations; resolved by
            resolveActiveIntegrationModel (preferredId "openai" possible)
UI:         provider option already in researcher SettingsPanel (browser-side keys —
            must move to server configure flow); IntegrationsDrawer entry static
Structured output: AI SDK generateText already returns text parsed by
            parseStructuredDraft — no OpenAI-specific response-format dependency
            required (SOURCE OBSERVED)
```

Provider interchangeability: Gemini/OpenAI/Anthropic are structurally identical specs
behind the same factory-export contract — swapping them is config, not workflow change
(SOURCE OBSERVED).

## 8. Dependency Requirements

**Existing (installed, reusable — no action):**
- `ai` (Vercel AI SDK) — root, used by researcher workflow (SOURCE OBSERVED).
- `tavily-python` — Python side of the Tavily worker (present in
  `app/requirements/base.txt`). Confirm the exact pin at implementation time.
- Node/npm runtime for the scoped integration install (existing installer).

**Integration-local (installed only when the integration is installed, via existing
`POST /api/integrations/:id/install`):**
| Dependency | Purpose | Location | Confidence |
| --- | --- | --- | --- |
| `@ai-sdk/openai@4.0.65` | OpenAI model factory | `app/integration/openai/node_modules` | SOURCE OBSERVED (already catalogued) |
| `@ai-sdk/google@4.0.67` | Gemini model factory (bundled default) | `app/integration/gemini/...` | SOURCE OBSERVED |
| `@ai-sdk/anthropic@4.0.52` | Anthropic model factory | `app/integration/anthropic/...` | SOURCE OBSERVED |
| `strands-agents` (pip, version UNCONFIRMED) | future Strands capability runtime | integration-local Python env | DOCUMENTED name; version UNCONFIRMED |
| `strands-agents-tools` (pip, version UNCONFIRMED) | http_request / tool extras | same | UNCONFIRMED |
| `pydantic` | only if Strands structured output is used | app requirements | UNCONFIRMED |

**UI dependencies: none required.** The existing component set (IntegrationsDrawer,
SettingsPanel, modal, skill-toggle) can express provider selection, key-status pills,
and capability checkboxes (SOURCE OBSERVED — components exist). Do not add a UI library.

**Unnecessary dependencies:** no new registry library, no state manager, no provider
SDKs beyond the catalogued AI-SDK packages, no Strands TS SDK unless a TS-side Strands
capability is explicitly scoped.

## 9. Registration Requirements

Extend, do not replace (INFERRED; built on SOURCE OBSERVED mechanism):

1. Add optional `capabilities?: string[]` to `IntegrationPackageSpec` (gemini/openai/
   anthropic → `["agent_model"]`; a tavily entry → `["research"]`). Non-breaking.
2. Tavily registration: smallest path is to report Tavily as a capability-level status
   derived from `TAVILY_API_KEY`/`ONESHOT_TAVILY_MODE` env (reusing
   `integrationStatus`-shaped reporting) — no npm install step, since the Python
   worker already exists.
3. `/api/integrations` response gains `capabilities` (derived from spec + env) so the
   UI renders what is actually usable — real backend records, no fabrication.
4. Optional provider preference: `resolveActiveIntegrationModel` already accepts
   `preferredId` (SOURCE OBSERVED); expose it only when the UI provider-selection
   control lands.

## 10. Credential / API-Key Flow

Current, verified flow (SOURCE OBSERVED):

```text
User enters key in UI
  -> POST /api/integrations/:id/configure {apiKey, model?, baseURL?}
  -> server writes process.env[<PROVIDER>_API_KEY] (+model/baseURL env)
  -> base URL passes resolveIntegrationBaseURL (http(s), no userinfo, no private hosts)
  -> response returns status only (installed/configured booleans) — key never echoed
  -> at run time resolveActiveIntegrationModel reads env server-side
```

Assessment vs. task §8:
- Storage: server-side process env — meets the credentials-stay-server-side invariant.
  Persistence across restart requires `app/env/.env` (UNCONFIRMED whether configure
  writes to disk; per SOURCE OBSERVED it does not — known gap).
- Validity testing: configure-time check is non-empty only (SOURCE OBSERVED); a live
  probe is a possible later addition (INFERRED, not required for the smallest path).
- Invalid credentials surface at first real model call as
  `RESEARCH_CAPABILITY_UNAVAILABLE`/root-cause — no silent success (SOURCE OBSERVED).
- Multiple providers coexist; selection via `preferredId` or install/configure state.
- Provider-specific keys never enter workflow artifacts — provenance records package
  + source id only (SOURCE OBSERVED).
- **Conflict to fix in UI, not backend:** researcher-route `SettingsPanel` holds API
  keys in `localStorage` (browser-side). Plan: route key entry through
  `/api/integrations/:id/configure`; keep only non-secret UI state locally.

## 11. UI Mapping

Existing locations (SOURCE OBSERVED):
- `IntegrationsDrawer.tsx` — production integrations surface (workspace), static seed.
- `SettingsPanel.tsx` — researcher-route settings (provider select, keys).
- `skill-toggle.tsx` / `skill-panel.tsx` — existing toggle component pattern reusable
  for capability checkboxes.

Planned controls (labels illustrative; adapt to existing copy):

```text
Provider:     [ Gemini (bundled) ] [ OpenAI ] [ Anthropic ]  -> install + configure status per provider
Credential:   configured / not configured / (invalid at first use) -> status pill from /api/integrations
Capabilities: [x] Agent model   (auto from provider status)
              [x] Web search    (Tavily key configured)
              [ ] Extract       (default off; selectable)
              [ ] Deep research (research-stream; default off)
              —  Crawl / Map    (unavailable: no adapter)
```

Key rules: capabilities render from the backend response only (no static-seed truth);
extract/research-stream default off; toggles persist via the backend config surface,
not localStorage secrets.

## 12. UI → Backend → Integration Flow

```text
User enables Advanced Research (extract/research-stream toggles)
  -> Frontend state: non-secret capability selection
  -> POST /api/integrations/tavily/configure {apiKey?, mode}   (extend configure body
     with ONESHOT_TAVILY_MODE mapping)
  -> Capability registry: capabilities=["research"], mode=<selected>
  -> Researcher evidence collector: TavilyEvidenceCollector.collect(prompt)
  -> TavilyPythonRunner -> worker.py -> tavily-python SDK
  -> Evidence records (source/statement/provenance) -> ResearchBundle
  -> Researcher validates bundle against urn:oneshot:schema:researcher:2 (unchanged)

User selects OpenAI provider + enters key
  -> POST /api/integrations/openai/install   (if not installed)
  -> POST /api/integrations/openai/configure {apiKey, model?, baseURL?}
  -> resolveActiveIntegrationModel(root, "openai")
  -> loadIntegrationModel -> @ai-sdk/openai createOpenAI -> model instance
  -> Researcher Case D generateText -> parseStructuredDraft
  -> ResearchBundle with modelSource="integration:openai" (provenance)
  -> Workflow (Planner -> ... -> Done) unchanged
```

## 13. Dependency Matrix

| Integration | SDK | Package | Runtime | Credential | Capabilities | Adapter | Registration | UI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Strands | @strands-agents/sdk (TS, in root package.json) + strands-agents (Python, NOT REQUIRED for primary seam) | @strands-agents/sdk ^1.17.0 + @ai-sdk/provider@4.0.13 (root, GAP-STRANDS-01) | Node (TS) | existing integration configure endpoint (server-side env) | Agent/VercelModel (USE), structured output (ADAPT), streaming (ADAPT), session (DEFER), orchestration (REJECT) | VercelModel wrap in new `backend/integration/strands/` adapter — CONFIRMED shape | existing `/api/integrations` + flag `ONESHOT_RESEARCH_USE_STRANDS` | none new in phase 1 |
| Tavily | tavily-python | already in app/requirements (SOURCE OBSERVED) | Python worker | TAVILY_API_KEY (env) | search, extract, research_stream (all exist); crawl/map NOT FOUND | EXISTS (evidence.ts + bridge.ts + worker.py) | env-derived status — small extension | mode toggles — new |
| OpenAI | @ai-sdk/openai | @ai-sdk/openai@4.0.65 (catalog) | Node (integration-local npm) | OPENAI_API_KEY via configure endpoint | agent_model | EXISTS (loadIntegrationModel factory) | EXISTS (/api/integrations) | provider option exists in SettingsPanel; needs server-side key flow |

## 14. Capability Matrix

| OneShot Capability | Provider | External Capability | Compatibility | Adapter Required | Optional UI | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Agent/model (Researcher Case D) | Gemini | AI SDK Google provider | DIRECT MATCH | No | Provider select | EXISTS |
| Agent/model | OpenAI | AI SDK OpenAI provider | DIRECT MATCH | No | Provider select | EXISTS (needs UI wiring) |
| Agent/model | Anthropic | AI SDK Anthropic provider | DIRECT MATCH | No | Provider select | EXISTS (catalog) |
| Agent/model | Strands | TS SDK Agent via `VercelModel({ provider: active.model })` | DIRECT MATCH (pending GAP-STRANDS-03 spec check) | Yes — small adapter module | Deferred (phase 1 backend) | CONFIRMED shape; see Strands_Integration_Implementation_Plan.md |
| Research/evidence | Tavily | search | DIRECT MATCH | No | Toggle | EXISTS (env-gated) |
| Research/evidence | Tavily | extract | DIRECT MATCH | No | Toggle (default off) | EXISTS (env-gated) |
| Research/evidence | Tavily | research stream | PARTIAL MATCH (single report evidence record) | No | Toggle (default off) | EXISTS (env-gated) |
| Research/evidence | Tavily | crawl / map | NO MATCH | — | — | NOT FOUND in worker |
| Research/evidence | Strands | http_request tool | PARTIAL MATCH | Yes (egress policy wrap) | Deferred | DOCUMENTED; adapter not built |
| Orchestration | Strands swarms/graph/workflows | dynamic orchestration | NO MATCH | — | — | REJECT (canonical invariant) |

## 15. UI Dependency Matrix

| UI Feature | Existing UI Location | Backend Dependency | Integration Dependency | New Dependency | New Component | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Provider selection | SettingsPanel (researcher route); IntegrationsDrawer (static) | `/api/integrations` (exists) | catalog (exists) | none | reuse existing components | MODIFY — bind to backend, server-side keys |
| API key configuration | SettingsPanel (localStorage — must change) | configure endpoint (exists) | configure endpoint (exists) | none | reuse modal pattern | MODIFY — route through backend |
| Advanced Research (mode) | none | configure body extension (mode) | Tavily collector (exists) | none | small section in drawer or settings | NEW (thin) |
| Research capability selection | none | `/api/integrations` capabilities field (new) | capabilities spec field (new) | none | reuse skill-toggle pattern | NEW (thin) |
| Ground Work selection | not found in source | — | — | — | — | NOT FOUND / UNCONFIRMED — no such capability exists today; do not invent |
| Integration status display | IntegrationsDrawer (static seed) | `/api/integrations` (exists) | runtime status (exists) | none | none | MODIFY — replace seed with live data |

## 16. Minimum Required Changes (smallest proof path)

1. Catalog extension: optional `capabilities` field on `IntegrationPackageSpec`; tag
   gemini/openai/anthropic with `["agent_model"]` (backend/integration/catalog.ts).
2. Tavily capability reporting: surface `tavily` in `/api/integrations` with
   `configured = TAVILY_API_KEY present`, `capabilities = ["research"]`, current mode
   from `ONESHOT_TAVILY_MODE` (backend/integration/runtime.ts or server route).
3. Configure endpoint extension: accept `mode` and map to `ONESHOT_TAVILY_MODE`
   (backend/server/http-server.ts).
4. UI: bind IntegrationsDrawer (and SettingsPanel provider/key flow) to
   `GET /api/integrations` + configure endpoint; render capability toggles
   (extract/research-stream default off) from the backend response; remove browser-side
   secret storage.
5. Verification: with only `OPENAI_API_KEY` (or Gemini) + `TAVILY_API_KEY` set through
   the UI, run one workflow execution end-to-end; confirm provenance fields and that
   `graph.json` semantics were untouched (diff check).

No schema changes (backend/schema/ untouched); no workflow changes; no new
dependencies beyond the already-catalogued packages.

## 17. Deferred Work

- Strands MCP tools / further capabilities (TS-SDK phase 1 ships Agent+VercelModel only;
  Python bridge is fallback per GAP-STRANDS-03).
- Configure-time credential validity probe (live model ping).
- Credential persistence to `app/env/.env` or a server-side secret store across
  restarts (current configure is process-env only).
- Strands MCP client tool edge behind `backend/tool/` (curated tools only).
- Provider preference UI (uses existing `preferredId`).
- Crawl/Map research capabilities (no Tavily adapter exists in worker.py today).
- AG-UI / chat-style Researcher UX (per discovery 2.11 — Inform).

## 18. Unconfirmed Items

- `strands-agents` pip version pins and exact extras per capability (DOCUMENTED name
  only).
- Whether the configure endpoint should/does persist credentials beyond process
  lifetime (SOURCE OBSERVED: it does not).
- Strands Agent-as-model adapter shape — **RESOLVED 2026-09-13:** `VercelModel` in the
  installed TS SDK is the confirmed adapter (`new VercelModel({ provider: active.model })`).
  Remaining UNCONFIRMED: whether installed provider packages emit `LanguageModelV3`
  (GAP-STRANDS-03; Builder must verify at adapter-build time).
- Tavily crawl/map APIs exist publicly but have no OneShot adapter (NOT FOUND in
  source; external API surface UNCONFIRMED in-repo).
- TS SDK `@strands-agents/sdk` capabilities beyond structured output example
  (DOCUMENTED partially on the structured_output page; rest UNCONFIRMED).

## 19. Conflicts

| Conflict | Resolution in this plan |
| --- | --- |
| Researcher SettingsPanel stores API keys in localStorage (browser-readable) | Route all key entry through `/api/integrations/:id/configure`; keep non-secret state only |
| IntegrationsDrawer static seed can misrepresent availability | Render only backend-reported status/capabilities |
| Strands workflow primitives vs. canonical workflow | Strands orchestration REJECTed; only runtime-level capabilities (MCP tools, http_request) considered, behind OneShot tool edges |
| Strands model capability vs. AI-SDK TS seam | RESOLVED via TS SDK `VercelModel` adapter (GAP-STRANDS-01 root install + GAP-STRANDS-03 spec check); Python bridge only as fallback |
| Tavily failure semantics (`ONESHOT_TAVILY_REQUIRED=false` tolerates failure) | Keep as-is; UI toggles must not claim guaranteed research success |

Layer separation verified (task §19): SDK ≠ Integration ≠ Capability Registry;
Capability ≠ Role; External Agent ≠ OneShot Role; External Workflow ≠ OneShot
Workflow; Conversation Session ≠ Run State; Telemetry ≠ Evidence; Credential ≠
Workflow Authority. No mapping above collapses any of these.

## 20. Implementation Order

1. Catalog `capabilities` field + provider tagging (backend only; no behavior change).
2. `/api/integrations` response: include capabilities + Tavily status/mode.
3. Configure endpoint: accept Tavily `mode`.
4. UI: live IntegrationsDrawer + server-side key flow; capability toggles
   (extract/research-stream, default off).
5. Web typecheck + tests (`npm --prefix app/web test`), backend tests (`npm test`),
   then one live Researcher run with OpenAI/Gemini + Tavily configured via UI.
6. Regenerate + verify manifest if any source file set changes.

Steps 1–3 are the backend proof (capability appears in `/api/integrations`); step 4 is
the UI proof (control drives backend); step 5 is the end-to-end proof that a valid key
+ enabled capability executes the existing workflow unchanged.




