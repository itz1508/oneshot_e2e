# Provider + Research + Runtime — Final Build Plan

**Status:** CONSOLIDATED from all prior plans. Builder-ready. No code written.
**Date:** 2026-09-13
**Sources:** `docs/plans/Strands_Integration_Implementation_Plan.md`, `docs/plans/Pattern_Extraction_Audit_Zod_Cline_to_OneShot.md`, `docs/plans/Strands_Evaluation_Case.md`, OneShot repository source, official Zod 4.6 docs, Cline Core SDK source, Strands Evals docs (10 pages)
**Governing rule:** OneShot owns the workflow and authority. Everything else is execution capability.

---

## 1. Executive Target

```text
User → Provider Settings → BYOK credential → Provider registration
  → Automatic model discovery → Model list → User selects model
  → Researcher LLM ON/OFF → Research configuration → Runtime selection
  → Local Strands OR Optional Python runtime → Provider adapter
  → Provider SDK/API → Actual model execution → Result
  → Existing OneShot Researcher → Existing OneShot validation → Execution proof
```

---

## 2. What Is Removed (from prior plans)

| Removed | Reason |
|---|---|
| ClineCore orchestrator | Different paradigm; OneShot is deterministic pipeline |
| Cline session architecture | OneShot uses RunSnapshot, not agent sessions |
| Cline hub/remote/task/checkpoint/compaction/plugin-discovery | Single-machine, not an IDE agent |
| Strands Agent Config, Model Routing | REJECTED/DEFERRED in Strands plan |
| Strands Sessions, Interrupts, Interventions | DEFERRED — not needed for minimum adapter |
| Strands workflow as OneShot workflow | REJECTED — canonical workflow must not change |
| 16 LLM-based evaluators (Output, Trajectory, Interactions, Helpfulness, Faithfulness, Coherence, Conciseness, ResponseRelevance, Harmfulness, Refusal, Stereotyping, InstructionFollowing, Multimodal×5) | Test-only bloat; 5 evaluators suffice |
| Experiment Generator, Detectors, Chaos Testing | Not runtime build; UNCONFIRMED |
| Python bridge for evaluators | Option C selected in Strands plan |
| Manual Base URL / Model URL / Endpoint entry | Automatic discovery required |
| StoredProviderSettings versioning | Defer until multi-provider required |
| Zod registries for schema metadata | No auto-UI-generation requirement proven |
| `z.fromJSONSchema()` for core contracts | JSON Schema is canonical authority |
| Cline RuntimeHost full 14-method interface | Overkill; 4-method boundary sufficient |
| SessionPendingPrompt event model | Human gates are existing HTTP endpoints |
| CoreSessionEvent discriminant union | ProcessingEvent.state is sufficient |
| Free-form provider settings index signature | Replaced by typed Zod schema |

---

## 3. Final Architecture

```text
 ┌──────────────────────────────────────────────┐
 │  OneShot Workflow (UNCHANGED)                 │
 │  Prompt → Researcher → Review → Planner → ... │
 └──────────────────┬───────────────────────────┘
                    │ single model call seam
 ┌──────────────────▼───────────────────────────┐
 │  Provider Store (non-secret projection)       │
 │  providers, activeProvider, activeModel,      │
 │  availableModels, runtimeMode, capabilities,  │
 │  researcherLlmEnabled, status, errors         │
 └──────────────────┬───────────────────────────┘
                    │
 ┌──────────────────▼───────────────────────────┐
 │  Runtime Resolver                            │
 │  Local Strands ←→ Optional Python Backend    │
 └──────┬───────────────────────┬───────────────┘
        │                       │
 ┌──────▼──────────┐   ┌───────▼──────────────┐
 │ Local Strands   │   │ Python Runtime        │
 │ Adapter (TS)    │   │ Adapter (bridge)      │
 └──────┬──────────┘   └───────┬──────────────┘
        │                       │
 ┌──────▼───────────────────────▼──────────────┐
 │  Provider Adapter (VercelModel / SDK client) │
 └──────────────────┬───────────────────────────┘
                    │
 ┌──────────────────▼───────────────────────────┐
 │  Provider SDK/API → actual model call         │
 └──────────────────┬───────────────────────────┘
                    │
 ┌──────────────────▼───────────────────────────┐
 │  OneShot Validation + 5 Evaluators + Proof    │
 └──────────────────────────────────────────────┘
```

## 4. Provider Catalog

**File:** `backend/integration/catalog.ts`

| Field | Current | Required Change |
|---|---|---|
| `capabilities` | MISSING | Add `RuntimeCapabilities { supportsStreaming, supportsStructuredOutput, supportsTools, supportsResearch }` per spec |
| Current entries | gemini, openai, anthropic | Add capabilities to each |

## 5. BYOK Credential Flow

```text
UI enters key → POST /api/integrations/:id/configure { apiKey }
  → Server writes process.env[spec.apiKeyEnv] (existing route, NO CHANGE)
  → Server attempts model discovery to validate key (NEW)
  → Discovery result + model list returned
  → Provider Store updated (non-secret only)
```

**NEVER:** localStorage for keys, keys in events, keys in logs, keys in store state.

## 6. Automatic Model Discovery

### 6.1 Discovery per Provider

| Provider | Method | SDK | Returns |
|---|---|---|---|
| OpenAI | `GET /v1/models` | `@ai-sdk/openai` | `{id, owned_by}` |
| Gemini | provider `.models()` | `@ai-sdk/google` | Model list + capabilities |
| Anthropic | `GET /v1/models` | `@ai-sdk/anthropic` | Model list |

### 6.2 Discovery Flow

```text
valid key set → SDK client → listModels() → normalize {id, displayName}
  → cache 5-min TTL → return list → if 1 model: auto-select
  → if multiple: user selects → if none: ROOT CAUSE "No models discovered"
```

### 6.3 Error Handling

```text
network error → UNAVAILABLE
auth error 401 → FAILED "Invalid API key"
empty list → FAILED "No models available"
rate limit 429 → DISCOVERING, retry with backoff
```

## 7. Researcher LLM ON/OFF

**File:** `app/web/app/researcher/types.ts`

```typescript
researcherLlmEnabled: z.boolean().default(false)
```

- **OFF:** Researcher runs without LLM (evidence only). No provider/model/runtime resolution.
- **ON:** Researcher uses selected provider + model + runtime. Provider must be READY.
---

## 8. Research Configuration

### 8.1 Settings Ownership

| Store | Fields | Location |
|---|---|---|
| **Provider Store** | `activeProvider`, `activeModel`, `availableModels`, `credentialStatus`, `runtimeMode`, `capabilities`, `discoveryStatus`, `providerError` | New: `app/web/app/researcher/lib/provider-store.ts` |
| **Research Store** | `researcherLlmEnabled`, `researchMode`, `searchCount`, `outputSchema`, `historyPolicy` | Extend: `app/web/app/researcher/types.ts` |
| **Runtime** | `runtimeMode: "local-strands" \| "python"` (resolved, not user-set) | `app/web/app/researcher/lib/providers.ts` |

### 8.2 Zod ProviderSettings Schema
**File:** `app/web/app/researcher/types.ts` — replace loose interface:

```typescript
import { z } from "zod";

export const ProviderSettingsSchema = z.object({
  researcherLlmEnabled: z.boolean().default(false),
  activeProvider: z.string().trim().min(1).optional(),
  activeModel: z.string().trim().min(1).optional(),
  runtimeMode: z.enum(["local-strands", "python"]).default("local-strands"),
  researchMode: z.enum(["fast", "balanced", "deep"]).default("balanced"),
  searchCount: z.number().int().min(1).max(10).default(3),
  outputSchema: z.enum(["default", "custom"]).default("default"),
  historyPolicy: z.enum(["save", "no-save"]).default("save"),
});

export type ProviderSettings = z.infer<typeof ProviderSettingsSchema>;
```

### 8.3 Settings Persistence
**File:** `app/web/app/researcher/lib/settings.ts`

```typescript
export function loadSettings(): ProviderSettings {
  // ... localStorage read ...
  const result = ProviderSettingsSchema.safeParse(parsed);
  if (!result.success) return DEFAULT_SETTINGS;
  return result.data; // normalized
}

export function saveSettings(settings: ProviderSettings): void {
  const result = ProviderSettingsSchema.safeParse(settings);
  if (!result.success) return; // reject invalid
  const normalized = result.data; // trimmed, coerced
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  // NOTE: apiKey is NEVER stored here — it lives in process.env via configure endpoint
}
```

---

## 9. Custom Output Schema

**File:** `backend/agents/researcher/workflow.ts` (existing `zodSchema` parameter)

```text
Research requirement → Zod schema (from user config or default)
  → passed to Strands Agent as structuredOutputSchema
  → Strands enforces as producer constraint
  → result.structuredOutput returned
  → OneShot validation validates (authority)
```

**Rule:** Strands structured output is a producer constraint. OneShot validation is the authority.

---

## 10. Search Count

**File:** `app/web/app/researcher/types.ts` — `searchCount: z.number().int().min(1).max(10).default(3)`

**Distinguish:**
- `requestedSearchCount` — user setting
- `actualCallsPerformed` — from execution trace
- `maxPermittedCalls` — cap from provider/capability

**Test:** Execution trace must prove actual calls ≤ maxPermittedCalls and match requestedSearchCount (or fewer if capped).

---

## 11. Research History

**File:** New `app/web/app/researcher/lib/research-history.ts`

```typescript
interface ResearchHistoryEntry {
  id: string;
  request: string;           // user prompt
  provider: string;
  model: string;
  runtime: string;
  researchMode: string;
  searchCount: number;
  outputSchema: string;
  sources: SourceDoc[];
  output: string;            // final draft
  executionStatus: string;
  timestamp: number;
}
```

**Storage:** localStorage (non-secret only). Cleared when `historyPolicy: "no-save"`.
**Separate from:** OneShot run state, conversation history, Strands session state.

---

## 12. Provider Store

**File:** New `app/web/app/researcher/lib/provider-store.ts`

```typescript
interface ProviderStore {
  providers: ProviderInfo[];          // from catalog
  activeProvider?: string;
  activeModel?: string;
  availableModels: ModelInfo[];       // from discovery
  runtimeMode: "local-strands" | "python";
  researcherLlmEnabled: boolean;
  capabilities: RuntimeCapabilities;
  providerStatus: ProviderStatus;
  discoveryError?: { code: string; message: string };
}
```

**Non-secret only.** No API keys. No credentials.

---

## 13. Runtime Capability Declaration

**File:** `backend/integration/catalog.ts` — `RuntimeCapabilities` per spec entry

```typescript
interface RuntimeCapabilities {
  supportsStreaming: boolean;
  supportsStructuredOutput: boolean;
  supportsTools: boolean;
  supportsResearch: boolean;
}
```

**Carried on:** `ActiveIntegrationModel` (runtime.ts), Provider Store (provider-store.ts).
**Used by:** UI (hide unsupported controls), Runtime Resolver (select compatible runtime).

---

## 14. Runtime Resolver

**File:** `app/web/app/researcher/lib/providers.ts`

```typescript
type RuntimeMode = "local-strands" | "python";

function resolveRuntimeMode(preferred?: RuntimeMode): RuntimeMode {
  if (preferred === "python" && isPythonBackendAvailable()) return "python";
  return "local-strands";
}
```

**Two runtimes only:**
- **Local Strands:** In-process TypeScript adapter (`@strands-agents/sdk`)
- **Python Backend:** Optional out-of-process bridge (only when available)

---

## 15. Local Strands Runtime

**File:** New `backend/agents/researcher/strands-adapter.ts` (from Strands plan §32)

```text
OneShot Researcher → resolveActiveIntegrationModel() → runtime resolver
  → VercelModel({ provider: active.model })
  → Agent({ model: vercelModel, systemPrompt, structuredOutputSchema })
  → agent.invoke(prompt) → AgentResult.structuredOutput
  → OneShot buildResearchBundle → OneShot validation
```

**Required:** `@strands-agents/sdk@^1.17.0` (already installed), `@ai-sdk/provider@4.0.13` at root (GAP-STRANDS-01).
**Call site:** `workflow.ts` — flag-gated (`ONESHOT_RESEARCHER_STRANDS=1`). Default path unchanged.
**Forbidden:** Constructing providers in adapter, reading API keys in adapter, Strands Graph/Swarm/SessionManager.

## 16. Optional Python Runtime

**File:** New `backend/agents/researcher/python-adapter.ts`

```text
OneShot Researcher → runtime resolver (python mode detected)
  → Python bridge (child_process spawn or HTTP to workspace API)
  → Python capability executes model call
  → result returned to OneShot
```

**Python discovery:** Check `app/workspace_api/` availability at startup. Only show "Python Backend" option when available.
**No separate config UI.** Uses same provider/model settings.

## 17. Credential Handling

**Path (server-side only):**
```text
UI → POST /api/integrations/:id/configure { apiKey }
  → http-server.ts:1486 (EXISTING, NO CHANGE)
  → process.env[spec.apiKeyEnv] = apiKey
  → validate by attempting model discovery
  → return { configured: true, models: [...] }
```

**NEVER in:** localStorage, event payloads, evaluator traces, logs, Provider Store, API responses.

## 18. UI Mapping

| UI Control | State Source | Behavior |
|---|---|---|
| Researcher LLM toggle | `researcherLlmEnabled` | OFF → hide provider/model/runtime. ON → show |
| Provider selector | Provider Store `providers` + catalog | Show configured providers. Show status badge |
| Model selector | Provider Store `availableModels` | Populated by discovery. Auto-select if single |
| Runtime selector | `resolveRuntimeMode()` | Show only available runtimes. Python hidden if unavailable |
| Research Mode | Research Store `researchMode` | fast / balanced / deep |
| Search Count | Research Store `searchCount` | 1–10 integer |
| Output Schema | Research Store `outputSchema` | default / custom |
| History Policy | Research Store `historyPolicy` | save / no-save |
| API Key input | Direct to configure endpoint | Never stored in localStorage. Masked display |

**No manual fields for:** Base URL, Model URL, Endpoint, Model ID.

## 19. Backend Mapping

| Backend Component | File | Change |
|---|---|---|
| Provider Catalog | `catalog.ts` | Add `capabilities` to each spec |
| Model Resolution | `runtime.ts` | Carry `capabilities` on `ActiveIntegrationModel`; add `listModels()` |
| Model Discovery | `runtime.ts` (new function) | `discoverModels(providerId): ModelInfo[]` using AI SDK |
| Configure Route | `http-server.ts` | EXISTING — no change needed |
| Researcher Workflow | `workflow.ts` | Flag-gated Strands adapter call-site; default path unchanged |
| Strands Adapter | New `strands-adapter.ts` | VercelModel wrap + invoke/stream |
| Python Adapter | New `python-adapter.ts` | Bridge to workspace API |
| Settings API | `http-server.ts` (new route) | `GET /api/researcher/settings` — return non-secret settings |

## 20. Strands Evaluator Selection

**Keep only 5 evaluators** (from 27 documented in Strands Evals SDK):

| Evaluator | Type | OneShot Use |
|---|---|---|
| **Deterministic** (Contains, Equals) | Code-based, no LLM | Regression: output contains expected keywords, exact match on schema fields |
| **Tool Selection Accuracy** | LLM-based, per-tool-call | Verify correct tool selected during research |
| **Tool Parameter Accuracy** | LLM-based, per-tool-call | Verify tool parameters traceable to input |
| **Goal Success Rate** | LLM-based, session | Binary: did Researcher achieve goal? |
| **Custom Evaluator** | Code/LLM, flexible | Test OneShot-specific conditions via metadata |

**REMOVED from build scope:** Output, Trajectory, Interactions, Helpfulness, Faithfulness, Correctness, Coherence, Conciseness, ResponseRelevance, Harmfulness, Refusal, Stereotyping, InstructionFollowing, FailureCommunication, PartialCompletion, RecoveryStrategy, Multimodal×5.

**Evaluator rule:** Evaluators supplement, never replace, OneShot Triple Validation. Evaluators are test-only.

## 21. OneShot Validation Boundary

```text
Strands execution evaluation (5 evaluators)
        +
OneShot execution proof (§22 matrix)
        +
OneShot Triple Validation (Schema + Fixture + Goal)
        ↓
VALID / NOT_VALID
```

---

## 22. Execution Proof Matrix

| # | Proof | Required | Source | Verified |
|---|---|---|---|---|
| 1 | `@strands-agents/sdk` installed | YES | `package.json:42` | YES — installation alone proves nothing |
| 2 | `@ai-sdk/provider` at root | YES | GAP-STRANDS-01 | NO — must install `@ai-sdk/provider@4.0.13` |
| 3 | `zod` single version | YES | GAP-STRANDS-02 | YES — `zod@4.6.4` deduped |
| 4 | Provider catalog has capabilities | YES | `catalog.ts` | NO — TO BUILD |
| 5 | Provider configured | YES | `POST /:id/configure` returns `configured: true` | NO — TO VERIFY |
| 6 | Models discovered | YES | `discoverModels()` returns list | NO — TO VERIFY with real key |
| 7 | Model selected | YES | `activeModel` populated | NO — TO VERIFY |
| 8 | Capability registered | YES | `ActiveIntegrationModel.capabilities` | NO — TO BUILD |
| 9 | Runtime resolved | YES | `resolveRuntimeMode()` returns valid mode | NO — TO VERIFY |
| 10 | Adapter callable | YES | Unit test: adapter invoked with stub | NO — TO BUILD |
| 11 | SDK called | YES | Log shows `Agent.invoke` executed (not mocked) | NO — TO VERIFY |
| 12 | Provider responded | YES | Real HTTP request, real response | NO — TO VERIFY |
| 13 | Result returned | YES | `result.structuredOutput` → `buildResearchBundle` | NO — TO VERIFY |
| 14 | OneShot validation passes | YES | Schema + Fixture + Goal all VALID | NO — TO VERIFY |
| 15 | E2E confirmed | YES | Full chain: configure→discover→select→run→validate | NO — TO VERIFY |

**Rule:** `PASSED` requires EVERY "TO VERIFY" row Verified from an actual run.

## 23. Required Dependencies

| Package | Version | Status | Reason |
|---|---|---|---|
| `@strands-agents/sdk` | `^1.17.0` | ALREADY INSTALLED | Agent + VercelModel |
| `@ai-sdk/provider` | `4.0.13` | MUST INSTALL (GAP-STRANDS-01) | VercelModel runtime import |
| `zod` | `^4.6.4` | ALREADY INSTALLED (transitive) | Schema, normalization, errors |
| `@ai-sdk/openai` | `4.0.65` | OPTIONAL | OpenAI discovery+execution |
| `@ai-sdk/google` | `4.0.67` | OPTIONAL | Gemini discovery+execution |
| `@ai-sdk/anthropic` | `4.0.52` | OPTIONAL | Anthropic discovery+execution |
| `strands_evals` | — | NOT NEEDED | Python-only; evaluators in TS |

## 24. Files to Create

| # | Path | Purpose |
|---|---|---|
| 1 | `app/web/app/researcher/lib/provider-store.ts` | Non-secret provider state projection |
| 2 | `app/web/app/researcher/lib/research-history.ts` | Research history entries |
| 3 | `backend/agents/researcher/strands-adapter.ts` | Local Strands adapter |
| 4 | `backend/agents/researcher/python-adapter.ts` | Python runtime bridge |

## 25. Files to Modify

| # | Path | Change |
|---|---|---|
| 1 | `app/web/app/researcher/types.ts` | Zod schema replaces loose interface |
| 2 | `app/web/app/researcher/lib/settings.ts` | safeParse; remove API key from localStorage |
| 3 | `app/web/app/researcher/lib/providers.ts` | resolveRuntimeMode, capability gating |
| 4 | `app/web/app/researcher/components/SettingsPanel.tsx` | Key→configure endpoint; field errors; capability-gated controls |
| 5 | `backend/integration/catalog.ts` | capabilities per spec |
| 6 | `backend/integration/runtime.ts` | capabilities + discoverModels() |
| 7 | `backend/agents/researcher/workflow.ts` | Flag-gated adapter call-site |
| 8 | `package.json` | Add `@ai-sdk/provider@4.0.13` |

## 26. Files to Preserve

`graph.json`, `canonical-transition.ts`, `validation/python/`, `schema/*.json`, `pipeline/`, `http-server.ts` routes, `IntegrationsDrawer.tsx`, generated output

## 27. Removed / Rejected

## 28. Builder Implementation Order

1. Install `@ai-sdk/provider@4.0.13` at root; verify VercelModel import resolves
2. Create Zod ProviderSettings schema (`types.ts`)
3. Modify `settings.ts` — safeParse, remove localStorage secrets
4. Create `provider-store.ts` — non-secret state projection
5. Add `capabilities` to catalog + runtime
6. Implement `discoverModels()` in `runtime.ts`
7. Modify `providers.ts` — runtime resolution, capability gating
8. Create `strands-adapter.ts` — VercelModel + Agent wrap
9. Create `python-adapter.ts` — Python bridge skeleton
10. Modify `workflow.ts` — flag-gated adapter call-site
11. Modify `SettingsPanel.tsx` — configure endpoint, field errors, capability gating
12. Create `research-history.ts`
13. Verify: `npm run build:backend`, `npm --prefix app/web run typecheck`
14. Implement 5 evaluators in TS test utilities
15. Unit tests: adapter, discovery, settings schema
16. Integration test: workflow + adapter + validation
17. E2E proof per §31

## 29. Builder Stop Conditions

Builder must STOP (ROOT CAUSE / File / Observed / Expected) if:
1. `@ai-sdk/provider` cannot be installed/resolved at root
2. `discoverModels()` cannot be implemented for any provider
3. `capabilities` field breaks catalog
4. Credential handling cannot stay server-side
5. Researcher workflow seam incompatible without canonical changes
6. SDK call cannot be proven (import ≠ execution)
7. Result cannot return through `buildResearchBundle`
8. Would require editing `graph.json` / `canonical-transition.ts`
9. Required behavior is UNCONFIRMED

## 30. Test Matrix

| Test | Proves |
|---|---|
| `settings-schema.test.ts` | Valid parsed, invalid rejected, normalized |
| `capability-declaration.test.ts` | Catalog carries caps, model inherits them |
| `model-discovery.test.ts` | discoverModels returns normalized list |
| `provider-store.test.ts` | Non-secret projection, no key leakage |
| `strands-adapter.test.ts` | VercelModel wrap, invoke, errors rethrow |
| `strands-workflow-integration.test.ts` | Adapter+workflow+validation chain |
| `search-count.test.ts` | Actual calls ≤ max, trace evidence |
| `credential-safety.test.ts` | No key in localStorage, events, responses |

## 31. E2E Proof

```text
1. Build passes → npm run build:backend + typecheck
2. Deps resolve → single zod, single @ai-sdk/provider
3. Launch → Provider Settings visible
4. Enable LLM → provider/model/runtime selectors appear
5. Configure key → models discovered → user selects model
6. Select runtime → configure research → start run
7. Researcher → adapter → SDK → provider → result → validation
8. §22 all 15 rows Verified from this run
9. Error case: invalid key → FAILED → ROOT CAUSE
10. Error case: unreachable → UNAVAILABLE
```

## 32. Definition of Done

```text
1. User opens Provider Settings
2. Enables Researcher LLM → provider/model/runtime selectors appear
3. Selects provider, enters key (server-side), models auto-discovered
4. Selects model, selects runtime, configures research
5. Run starts → Researcher → adapter → SDK → provider → result → validation
6. Execution proof recorded (§22 all 15 rows Verified)
7. 5 evaluators pass
8. Complete chain demonstrated in E2E test
```

NOT sufficient: package presence, config presence, import success, valid key, discovered model, adapter existence, route presence, static test.

## 33. Final Builder Handoff

```text
BUILD_TARGET
  Provider + Research + Runtime system
  BYOK + auto model discovery + model selection + research config
  + research history + Local Strands + optional Python + execution proof

FILES CREATE (4): provider-store.ts, research-history.ts, strands-adapter.ts, python-adapter.ts
FILES MODIFY (8): types.ts, settings.ts, providers.ts, SettingsPanel.tsx, catalog.ts, runtime.ts, workflow.ts, package.json
FILES PRESERVE: graph.json, canonical-transition.ts, validation/, schema/, pipeline/, http-server routes, IntegrationsDrawer
DEPS: @strands-agents/sdk (installed), @ai-sdk/provider (install), zod (installed)
EVALUATORS: 5 only, TS implementation, test-only
PROOF: 15 rows, all must be Verified from actual run. No static shortcuts.
DONE: 8-step chain demonstrated in live E2E
```