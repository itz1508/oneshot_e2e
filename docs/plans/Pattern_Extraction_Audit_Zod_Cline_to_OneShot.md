# Pattern Extraction Audit — Zod & Cline → OneShot

**Status:** RESEARCH COMPLETE (no code written). Builder-ready.
**Date:** 2026-09-13
**Sources:** Zod 4.6 docs (5 pages fetched), Cline Core SDK source (9 files fetched), OneShot current state (`backend/integration/{catalog,runtime}.ts`, `backend/runtime/{run-repository,event-bus}.ts`, `app/web/app/researcher/{types,settings,providers}.ts`, `backend/schema/` 25 JSON Schema files)
**Rule:** Do NOT copy Cline architecture. Extract only small, source-grounded patterns that solve OneShot's actual missing pieces.

---

## 1. OneShot Current State Reconstruction

### Provider Surface
| File | Symbol | Gap |
|---|---|---|
| `backend/integration/catalog.ts` | `IntegrationPackageSpec` | No `capabilities` field. Cannot declare `supportsStreaming`, `supportsStructuredOutput` |
| `backend/integration/runtime.ts` | `resolveActiveIntegrationModel()` | Returns `model: any` — untyped. No capability annotation on resolved model |
| `backend/integration/installer.ts` | `installIntegration()` | No load diagnostics beyond pass/fail |
| `backend/server/http-server.ts` | POST `/:id/configure` | No validation of body beyond key presence |

### Settings Surface
| File | Symbol | Gap |
|---|---|---|
| `app/web/app/researcher/types.ts` | `ProviderSettings` | **No Zod schema.** Index signature accepts anything. No validation, normalization, or coercion |
| `app/web/app/researcher/lib/settings.ts` | `loadSettings()`, `saveSettings()` | `JSON.parse` + spread defaults — malformed data silently accepted. Secrets in localStorage |
| `app/web/app/researcher/lib/providers.ts` | `providerGateReason()` | Inline string check, not schema-validated |

### Runtime Surface
| File | Symbol | Gap |
|---|---|---|
| `backend/runtime/run-repository.ts` | `RunRepository` | No session concept separate from run. No checkpoint/restore |
| `backend/runtime/event-bus.ts` | `ProcessingEventBus` | No typed event discriminant union. Events driven by `state` string |
| `backend/runtime/workflow-runtime.ts` | workflow dispatch | No runtime mode abstraction. Only one execution path |

### Session / Events / Schema
| File | Symbol | Gap |
|---|---|---|
| `app/web/app/researcher/types.ts` | `SessionMeta` | No status/source, no history metadata, no checkpoint |
| `app/web/app/researcher/types.ts` | `ChatMessage` | Not linked to session records. No compaction state |
---

## 2. Zod Pattern Extraction

### 2.1 String Normalization → DIRECTLY USEFUL
**Source:** `.trim()`, `.toLowerCase()`, `.toUpperCase()`, `.url()`, `.regex()`, `.min()`, `.max()`
**Gap:** No normalization on API keys, model names, base URLs.
**Pattern:** `z.string().trim().toLowerCase().min(1)` for provider IDs; `z.string().url()` for base URLs.
**Target:** `types.ts:ProviderSettings` → Zod schema with normalization.

### 2.2 Metadata / GlobalRegistry → ADAPTABLE
**Source:** `z.globalRegistry`, `.meta({id, title, description, examples})`, `.describe()`
**Gap:** 25 JSON Schema files have no title/description/example annotations.
**Pattern:** Annotate key schemas via `.meta()`. Augmentation only — canonical JSON Schema authority unchanged.
**Target:** New `backend/schema/schema-metadata.ts` — Zod registry for UI-facing metadata.

### 2.3 z.toJSONSchema() Bridge → OPTIONAL
**Source:** `z.toJSONSchema(schema, {target: "draft-2020-12", metadata: registry})`, `z.fromJSONSchema()`
**Gap:** No programmatic Zod↔JSON Schema bridge.
**Pattern:** Write settings schemas in Zod, generate JSON Schema. Do NOT use for workflow contracts.
**Limitations:** bigint, symbol, Date, Map, Set, transform — unrepresentable (few used by OneShot).
**Verdict:** Use for settings schemas only. Workflow contracts stay pure JSON Schema.

### 2.4 Structured Error Formatting → DIRECTLY USEFUL
**Source:** `.issues`, `z.treeifyError()` (nested), `z.flattenError()` ({formErrors, fieldErrors}), `z.prettifyError()`
**Gap:** Validation failures produce generic strings. No field-level error mapping.
**Pattern:** `safeParse` → `z.flattenError()` → `fieldErrors.provider → ["Required"]` mapped to UI fields.
**Target:** `SettingsPanel.tsx`, configure endpoint, runtime config.

### 2.5 Coercion / Preprocess → ADAPTABLE
**Source:** `z.coerce.string()`, `z.coerce.number()`, `z.preprocess(fn, schema)`
**Gap:** No type coercion on API input boundaries.
**Pattern:** `z.coerce` for env vars (string→number), `z.preprocess` for legacy data cleanup.

### 2.6 Custom Error Maps → ADAPTABLE
**Source:** `z.config({customError})`, locale maps, per-parse error overrides
**Gap:** Hardcoded error strings scattered across codebase.
**Pattern:** Project-level error map for consistent UI vocabulary.

---

## 3. Cline Pattern Extraction

### 3.1 RuntimeHost Interface → ADAPTABLE
**Source:** `RuntimeHost` — startSession, runTurn, restoreSession, abort, stopSession, getSession, listSessions, deleteSession, subscribe, dispatchHookEvent, dispose (14 methods)
**Gap:** No runtime abstraction in OneShot.
**Pattern (minimal):** 4-method interface: `startResearch`, `streamResearch`, `abort`, `dispose`. Do NOT copy full 14-method host.

### 3.2 RuntimeHostMode → ADAPTABLE
**Source:** `"auto" | "local" | "hub" | "remote"`
**Gap:** `runtimeMode: "browser" | "python"` is a user-set string, not discovered.
**Pattern:** `resolveRuntimeMode()` — checks Python backend availability → resolved mode. UI reflects reality.

### 3.3 CoreRuntimeFeatures → DIRECTLY USEFUL
**Source:** `{ enableTools, enableSpawnAgent, enableAgentTeams, disableMcpSettingsTools, yolo }`
**Gap:** **No capability declaration exists.** UI exposes options regardless of what's supported.
**Pattern:** `OneShotRuntimeFeatures { supportsStreaming, supportsStructuredOutput, supportsResearchTools, supportsInterrupt }` on providers and resolved models.
**Target:** `catalog.ts:IntegrationPackageSpec` + `runtime.ts:ActiveIntegrationModel` + UI gating.

### 3.4 StoredProviderSettings → DIRECTLY USEFUL
**Source:** `{ version: 1, lastUsedProvider?, modes, providers: Record<string, {settings, updatedAt, tokenSource}> }` — full Zod schema
**Gap:** Flat `ProviderSettings` with no version, no per-provider entries, raw JSON localStorage.
**Pattern:** Versioned multi-provider store with Zod schema.
**Target:** New `app/web/app/researcher/lib/provider-store.ts`.

### 3.5 CoreSessionEvent Union → ADAPTABLE
**Source:** `{ type: "chunk", payload } | { type: "ended", payload } | { type: "hook", payload } | ...` — 9-variant union
**Gap:** `ProcessingEvent` uses `state` string, not type discriminant.
**Pattern:** Add `type` field for structural event identification. `state` stays for status.

### 3.6 SessionPendingPrompt → ADAPTABLE
**Source:** `{ id, prompt, delivery: "queue"|"steer", attachmentCount }`
**Gap:** Human gates are HTTP endpoints, not event-driven.
**Pattern:** PendingGate record for research_review/build_ready surfaced through events.

### 3.7 safeParse + Normalize Provider Config → DIRECTLY USEFUL
**Source:** `parseSettings(input) → ProviderSettings` → `toProviderConfig(settings) → ProviderConfig` → `safeCreateProviderConfig(input) → {success, config} | {success: false, error}`
**Gap:** No validation between key-read and factory-call. Invalid input → runtime errors.
---

## 4. What is Actually Missing

### Required Missing (blocks intended system)

| # | Missing | Impact |
|---|---|---|
| M1 | **No capability declaration** on providers/runtimes | UI cannot gate features; Strands adapter cannot know what's supported |
| M2 | **No Zod schema for ProviderSettings** | Malformed settings silently accepted; secrets in localStorage unchecked |
| M3 | **No settings normalization** | Whitespace in API keys causes silent auth failures |
| M4 | **No typed provider settings persistence** | Cannot support multiple providers; cannot migrate settings format |

### Useful Enhancement

| # | Missing | Impact |
|---|---|---|
| E1 | **No structured validation errors** | Cannot show field-level validation in UI |
| E2 | **No runtime mode resolution** | UI shows Python backend even when unavailable |
| E3 | **No Zod metadata on schemas** | Cannot auto-generate UI labels or documentation |
| E4 | **No typed event discriminant** | Brittle; UI parses strings to distinguish event kinds |
| E5 | **No settings version/audit trail** | Cannot detect or migrate stale settings |

### Reference Only (design knowledge)

| # | Pattern | Why |
|---|---|---|
| R1 | ClineCore orchestrator | OneShot's workflow is deterministic, not session-based |
| R2 | SessionRecord/HistoryRecord | OneShot uses RunSnapshot, not agent sessions |
| R3 | Plugin discovery | Declarative catalog is sufficient for 3 providers |
| R4 | Compaction/checkpoint config | OneShot has no agent conversation loop |

### Do Not Add

| # | Pattern | Why |
|---|---|---|
| D1 | hub/remote modes | Single-machine |
| D2 | fromJSONSchema for contracts | JSON Schema is canonical authority |
| D3 | MCP metadata | No MCP integration |
| D4 | Agent teams | REJECTED by Strands plan §1.3 |
| D5 | z.custom/transform for schemas | Unrepresentable in JSON Schema |

---

## 5. Builder Impact Matrix

| Pattern | Target File | Change | Risk |
|---|---|---|---|
| Zod ProviderSettings | `types.ts` | Replace interface with `z.object()` | LOW |
| Settings normalization | `settings.ts` | `safeParse` + normalize on write | LOW |
| Capability declaration | `catalog.ts`, `runtime.ts` | Add `capabilities` field | LOW |
| StoredProviderSettings | New `provider-store.ts` | Versioned multi-provider persistence | MEDIUM |
| Structured errors | `SettingsPanel.tsx` | `z.flattenError()` for field errors | LOW |
| Runtime mode resolution | `providers.ts` | Discover availability, don't user-set | LOW |
| Typed event discriminant | `event-bus.ts` | Add `type` field to ProcessingEvent | MEDIUM |
| Schema metadata | New `schema-metadata.ts` | `.meta()` annotations | LOW |

---

## 6. Implementation Order

1. Add Zod ProviderSettings schema (`types.ts`)
2. Add settings normalization (`settings.ts`)
3. Add capability declaration (`catalog.ts`, `runtime.ts`)
4. Add structured validation errors (`SettingsPanel.tsx`)
5. Add StoredProviderSettings (`provider-store.ts`)
6. Add runtime mode resolution (`providers.ts`)
7. Add typed event discriminant (`event-bus.ts`)
8. Add schema metadata (`schema-metadata.ts`)
9. Connect UI state (capability-gated controls, field errors)
10. Test complete path (schema→normalize→persist→read→validate→UI)

---

## 7. Proof Requirements

**Settings:** input → safeParse → normalize (trim/lowercase) → persist → read-back → identical normalized value

**Capabilities:** provider selected → capability from catalog → carried on resolved model → UI reads → unsupported options hidden

**Errors:** invalid input → Zod parse → flattenError → fieldErrors → UI field-level messages

**Runtime:** startup → check Python availability → resolved mode → UI reflects reality

---

## 8. Final Decision Table

| Pattern | Source | Use? | Builder Change |
|---|---|---|---|
| String normalization | Zod | ✅ YES | safeParse + normalize in settings.ts |
| .meta() / registry | Zod | ✅ YES | Annotate key schemas with metadata |
| toJSONSchema() bridge | Zod | ⚠ OPTIONAL | Generate JSON Schema for settings only |
| flattenError / treeifyError | Zod | ✅ YES | Field-level error display in UI |
| z.coerce | Zod | ⚠ OPTIONAL | Coerce query/form inputs at boundaries |
| RuntimeHost boundary | Cline | ✅ ADAPT | Minimal 4-method interface |
| RuntimeHostMode | Cline | ✅ ADAPT | Discovered, not user-set |
| CoreRuntimeFeatures | Cline | ✅ YES | Capability on providers + resolved models |
| StoredProviderSettings | Cline | ✅ YES | Versioned multi-provider persistence |
| CoreSessionEvent union | Cline | ✅ ADAPT | Add `type` discriminant to events |
| SessionPendingPrompt | Cline | ✅ ADAPT | Pending gate interaction records |
| safeCreateProviderConfig | Cline | ✅ YES | Two-phase provider creation |
| ClineCore / SessionRecord / Plugins | Cline | ❌ REFERENCE | Different paradigm |
| hub/remote / Agent teams / MCP | Cline | ❌ DO NOT ADD | REJECTED or unnecessary |

---

## 9. Builder Handoff

```text
EXTRACTED PATTERNS

REQUIRED: M1-M4 — capability declaration, Zod schema, normalization, versioned store
RECOMMENDED: E1-E5 — structured errors, runtime resolution, metadata, typed events, audit trail
REFERENCE ONLY: R1-R4 — ClineCore, SessionRecord, Plugin discovery, Compaction
DO NOT ADD: D1-D5 — hub/remote, fromJSONSchema contracts, MCP, Agent teams, custom schemas

FILES CREATE: provider-store.ts, schema-metadata.ts, runtime-adapter.ts (interface only)
FILES MODIFY: types.ts, settings.ts, providers.ts, catalog.ts, runtime.ts, event-bus.ts, SettingsPanel.tsx
FILES PRESERVE: workflow/graph.json, validation/python/, schema/*.json, pipeline/
DEPENDENCIES: zod@^4.6.4 (already installed transitively; optional direct dep)

TESTS: settings-schema.test.ts, capability-declaration.test.ts, provider-store.test.ts, field-errors.test.ts
E2E PROOF: bad key → field error, no capability → hidden toggle, round-trip → normalized output, Python unavailable → mode hidden
```