All verified. Final confirmations:
- **No consumer keys on `id === "standalone"`** (only the placeholder definition + a test fixture) and **`loadIntegration` has no existing caller** — so the "integration" artifact is captured at submit but never consumed to drive selection. Adding the new caller is safe.
- The inline `WorkflowRuntime` path builds the Researcher via `bindDependencies` (`workflow-runtime.ts:180`); the default BullMQ pipeline path builds it in `runResearcherStage`.
- **`streamText` is not used anywhere** — no model-token streaming exists today; only `result.text` from `generateText`.
- The `RunJobV1` contract test already expects a *real* provider id (`integration: { id: "gemini", model: "gemini-2.0-flash" }`) — so the submit-time placeholder `"standalone"` is actually inconsistent with the contract.

I now have everything needed. Here is the implementation priority document.

---

# Implementation Priority

## BLOCKER #1: Provider Selection

### How does the workflow select which provider today?

**"First installed + configured provider wins" — process-global, not per-run.**

1. At run submit (`backend/server/http-server.ts:246-250`), a **placeholder** selector is saved as the `"integration"` artifact:
   ```ts
   const selector = {
     id: "standalone",
     configRevision: 0,
     model: "standalone",
   };
   ```
2. `runResearcherStage` (`backend/pipeline/processors.ts:112`) builds the Researcher with **no** model/preference: `new ResearcherWorkflow(services.contracts, undefined, services.projectRoot)`.
3. The Researcher (`backend/agents/researcher/workflow.ts:130`) resolves the model with **no `preferredId`**:
   ```ts
   const active = await resolveActiveIntegrationModel(this.projectRoot);
   ```
4. `resolveActiveIntegrationModel` (`backend/integration/runtime.ts:139-149`) then does `statuses.find((s) => s.installed && s.configured)` — i.e. the **first** integration in catalog order (gemini → openai → anthropic) that is both installed and has an API key set.

The captured `selector.id = "standalone"` is **never read** to drive selection. I verified `loadIntegration(ctx)` (the only loader for that artifact, `backend/pipeline/context.ts:44`) has **no existing caller** — so the binding is captured and discarded.

### What ONE LINE needs to change to make it dynamic?

The selection seam itself — `backend/agents/researcher/workflow.ts:130` — pass the run's preferred id:

```diff
- const active = await resolveActiveIntegrationModel(this.projectRoot);
+ const active = await resolveActiveIntegrationModel(this.projectRoot, this.preferredIntegrationId);
```

`resolveActiveIntegrationModel(projectRoot, preferredId?)` **already accepts and honors `preferredId`** (`runtime.ts:139-149` — it does `statuses.find(s => s.id === preferredId && s.installed && s.configured)` when a preferredId is given). The seam is built; it is simply never fed a value.

> **Absolute one-liner fallback** (process-global, env-driven, no plumbing): `resolveActiveIntegrationModel(this.projectRoot, process.env.ONESHOT_PREFERRED_INTEGRATION)`. This makes selection operator-configurable but not per-run. For true per-run dynamism you also need the supporting plumbing below so `this.preferredIntegrationId` is populated from the run's captured binding.

### Current code → Fixed code

**`backend/agents/researcher/workflow.ts` — constructor (L58-65):**
```ts
// CURRENT
  constructor(
    private contracts: CanonicalContractSkill,
    private modelCapability?: unknown,
    projectRoot?: string,
  ) {
    this.projectRoot = projectRoot || process.cwd();
    this.collector = new ResearchEvidenceCollector(this.projectRoot);
  }

// FIXED (add one param)
  constructor(
    private contracts: CanonicalContractSkill,
    private modelCapability?: unknown,
    projectRoot?: string,
    private preferredIntegrationId?: string,   // ← NEW
  ) {
    this.projectRoot = projectRoot || process.cwd();
    this.collector = new ResearchEvidenceCollector(this.projectRoot);
  }
```

**`backend/agents/researcher/workflow.ts` — the ONE LINE selection seam (L130):**
```ts
// CURRENT
        const active = await resolveActiveIntegrationModel(this.projectRoot);

// FIXED
        const active = await resolveActiveIntegrationModel(this.projectRoot, this.preferredIntegrationId);
```

**`backend/pipeline/processors.ts` — feed the binding (L111-117):**
```ts
// CURRENT
  const prompt = await loadPrompt(ctx);
  const researcher = new ResearcherWorkflow(
    services.contracts,
    undefined,
    services.projectRoot,
  );
  const bundle = await researcher.run(prompt, ctx.runId);

// FIXED
  const prompt = await loadPrompt(ctx);
  let preferredIntegrationId: string | undefined;
  try {
    preferredIntegrationId = (await loadIntegration(ctx)).id;   // run's captured provider
  } catch {
    /* no integration bound → fall back to first-configured */
  }
  const researcher = new ResearcherWorkflow(
    services.contracts,
    undefined,
    services.projectRoot,
    preferredIntegrationId,                                      // ← NEW
  );
  const bundle = await researcher.run(prompt, ctx.runId);
```
*(also add `loadIntegration` to the existing `import { … } from "./context.js"` at `processors.ts:4-14`)*

**`backend/server/http-server.ts` — stop saving a placeholder (L246-250):**
```ts
// CURRENT
    const selector = {
      id: "standalone",
      configRevision: 0,
      model: "standalone",
    };

// FIXED (capture the actually-configured provider; uses already-imported listIntegrationStatus + integrationPackageSpec)
    const configured = (await listIntegrationStatus(workspaceRoot))
      .find((s) => s.installed && s.configured);
    const selector = configured
      ? {
          id: configured.id,
          configRevision: 0,
          model: (process.env[integrationPackageSpec(configured.id).modelEnv]
            || integrationPackageSpec(configured.id).defaultModel).trim(),
        }
      : { id: "standalone", configRevision: 0, model: "standalone" };
```

---

## BLOCKER #2: Session/Context Persistence

### Where is session stored today?

Three durable stores under `.runtime/` (`backend/runtime/runtime-config.ts`):

| What | Store | Location | Structure |
|---|---|---|---|
| Run snapshot | `RunRepository` (`backend/runtime/run-repository.ts`) | `.runtime/run-state/<runId>.json` (atomic tmp+rename; cross-process mtime reload) | `RunSnapshot` |
| Stage artifacts | `FileArtifactStore` (`backend/runtime/artifact-store.ts`) | `.runtime/runs/<runId>/<name>.json` (atomic tmp+rename; `create()` uses hard-link) | name → JSON file |
| Event log | `AppendOnlyProcessingEventStore` (`backend/runtime/event-bus.ts`) | `.runtime/task-events/` | `ProcessingEvent[]` (append-only, event_id-deduped) |

### What data structure holds it?

**`RunSnapshot`** (`backend/contracts/schema/types.ts:48`):
```ts
export interface RunSnapshot {
  run_id: string;
  pipeline_status: "Running" | "Done";
  test_result?: "Passed" | "Failed";
  issue_type?: "Root Cause" | "Missing";
  current_processor?: string;
  events: ProcessingEvent[];            // inlined event history
  artifacts: Record<string, string>;    // artifact NAME → file PATH (not content)
  hash_proof?: HashProof;
  root_cause?: RootCause;
  help_request?: HelpRequest;
}
```

**`CapturedIntegration`** (`backend/pipeline/context.ts:16-21`) — the provider binding, saved as the `"integration"` artifact:
```ts
export interface CapturedIntegration {
  id: string;
  model: string;
  configRevision: number;
  settings?: Record<string, unknown>;
}
```

### What needs to change to persist across provider switches?

**Almost nothing — the context is already provider-agnostic and self-attributing.**

- Downstream stages consume **canonical types** (`ResearchBundle`, `Plan`, `Audit`, …), never model output or provider types. The model's raw text is converted to canonical types at the Researcher boundary (`buildResearchBundle`, `backend/agents/researcher/structured-draft.ts:65`). So switching providers between runs requires **zero** downstream changes.
- Each run's research bundle **already records which provider produced it**: `ResearcherArtifact.evidence[]` carries `source`/`provenance` (`structured-draft.ts:106-111`, fed from `modelSource`/`modelProvenance` in `workflow.ts:173-174`).
- The **only** gap: the `"integration"` artifact stores a placeholder (`id: "standalone"`) instead of the real binding. Fixing that is exactly the `http-server.ts:246` change from **Blocker #1** — it persists the real `{ id, model }`. **No `RunSnapshot` or `CapturedIntegration` schema change is required**; the interface already has `id`/`model`/`configRevision`/`settings`.

*Optional (auditability only)* — add one optional field to `CapturedIntegration` (`backend/pipeline/context.ts:16-21`):
```ts
export interface CapturedIntegration {
  id: string;
  model: string;
  configRevision: number;
  settings?: Record<string, unknown>;
  provenance?: string;   // ← optional: e.g. "@ai-sdk/google@4.0.67"
}
```
This does not touch the locked `run-snapshot.schema.json` (the snapshot stores artifact *paths*, not the `CapturedIntegration` body), so no schema-registry change is needed.

> Note: within a single run the binding is fixed at submit. Mid-run provider switching is unnecessary — Researcher is the only model stage, and once `research_bundle` is saved, the provider is irrelevant to every downstream stage.

---

## BLOCKER #3: Streaming Response

### How does the response stream to frontend today?

**SSE** — `GET /api/runs/:id/events` (`backend/server/http-server.ts:1258-1305`).

```ts
res.writeHead(200, {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
  "x-content-type-options": "nosniff",
});
const sendEvent = (e: { sequence: number }) => {
  res.write(`id: ${e.sequence}\n`);          // Last-Event-ID for reconnect
  res.write(`event: processing\n`);
  res.write(`data: ${JSON.stringify(e)}\n\n`);
};
// replay from Last-Event-ID, then subscribe live:
const unsub = events.subscribe(runId, sendEvent);
// 15s `: keep-alive` heartbeat; browser close → unsub only (never cancels the job)
```

### What protocol (SSE/WS/polling)?

**SSE only.** Reconnect/resume via the `Last-Event-ID` header (replays events with `sequence > lastSeq`). No WebSocket, no polling. The frontend keys dedup on `event_id` so it tolerates at-least-once delivery.

**Important:** the SSE payload is `ProcessingEvent` (`backend/contracts/schema/types.ts:47`) — these are **workflow stage events** (`Researcher`/`Planner`/…/`Done` with `scope: WORKFLOW|SUPPORT|SANDBOX`), **not model tokens**. The model call itself is **non-streaming**: `generateText({ model, system, prompt })` (`workflow.ts:144`) returns `result.text` in one shot, then `parseStructuredDraft(result.text)`. I confirmed `streamText` is **not used anywhere** in the codebase.

### What needs to change for provider-agnostic streaming?

**For the existing channel: nothing.** The SSE channel is already provider-agnostic — it carries stage events with no provider-specific fields.

**For model-token streaming (a new UX feature):** the Vercel AI SDK's `streamText` is provider-agnostic **by design** — every `@ai-sdk/*` package implements the same `LanguageModel.doStream` interface. So the provider-agnosticism is free; the only new code is SSE forwarding.

```ts
// CURRENT (workflow.ts:144) — non-streaming
  const result = await generateText({
    model: activeModel,
    system: RESEARCHER_SYSTEM_PROMPT,
    prompt: promptText,
  });
  draft = parseStructuredDraft(result.text);

// FIXED — provider-agnostic streaming; accumulate, then parse
  const result = await streamText({
    model: activeModel,
    system: RESEARCHER_SYSTEM_PROMPT,
    prompt: promptText,
  });
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      // forward chunk over the run's SSE channel (provider-agnostic)
      events.emit(runId, "ResearcherStream", "Running", {
        scope: "SUPPORT",
        message: part.textDelta,
      });
    }
  }
  draft = parseStructuredDraft(await result.text);   // full text, then parse JSON
```

**Risk guardrail:** do **not** mutate the locked `ProcessingEvent` schema (`processing-event.schema.json`; the frontend dedups on `event_id` and the event bus enforces "Passed events cannot carry issue fields", `event-bus.ts:100`). Two safe options:
- **(preferred, minimal)** emit token chunks as ordinary `SUPPORT`-scoped `ProcessingEvent`s with `processor: "ResearcherStream"` (no schema change — `message` already exists). The frontend can display `message` deltas and ignore them for state transitions.
- **(heavier)** add a dedicated `event: research-token` SSE line (separate from `event: processing`) or a new `/api/runs/:id/research-stream` endpoint, leaving `event: processing` untouched.

---

## MINIMUM VIABLE CHANGES

Exact files, exact lines, before → after. **Blocker #1 + #2 are the same three edits** (the submit-time capture fixes both selection and persistence).

### 1. `backend/agents/researcher/workflow.ts`
- **L58-65** constructor: add `private preferredIntegrationId?: string` param (Blocker #1).
- **L130** (the ONE LINE): `resolveActiveIntegrationModel(this.projectRoot, this.preferredIntegrationId)` (Blocker #1).
- *(optional, Blocker #3)* **L144** `generateText` → `streamText` + accumulate/forward, **L150** `parseStructuredDraft(await result.text)`.

### 2. `backend/pipeline/processors.ts`
- **L4-14** import block: add `loadIntegration` to `import { … } from "./context.js"`.
- **L111-117** `runResearcherStage`: load `loadIntegration(ctx)`, pass `preferredIntegrationId` into `new ResearcherWorkflow(...)` (Blocker #1).

### 3. `backend/server/http-server.ts`
- **L246-250** `submitRun` selector: replace the hardcoded `{ id: "standalone", … }` with the resolved configured provider (Blocker #1 + #2). Uses already-imported `listIntegrationStatus` + `integrationPackageSpec` (L48-50).

### 4. (optional auditability) `backend/pipeline/context.ts`
- **L16-21** `CapturedIntegration`: add `provenance?: string` (Blocker #2). No schema-registry change (this is an artifact body, not the snapshot).

### 5. (optional, inline path) `backend/runtime/workflow-runtime.ts` + `backend/index.ts` / `backend/scripts/run-worker-cli.ts`
- The non-default inline `WorkflowRuntime` path builds the Researcher via `bindDependencies` (`workflow-runtime.ts:180`). To honor per-run binding there too, pass the preferred id when constructing `ResearcherWorkflow` in that factory. The default BullMQ pipeline path (edit #2) is what `npm start` / E2E uses.

### 6. (optional, streaming) `backend/agents/researcher/workflow.ts` L144
- `generateText` → `streamText` (Blocker #3). Provider-agnostic by construction; only new code is the SSE forwarding loop.

**Total for the true minimum (Blockers #1 + #2): 3 files, ~6 line-level edits.** No new dependencies, no schema-registry change, no refactor.

---

## RISK ASSESSMENT

### What can break if we make these changes?

| # | Risk | Why | Mitigation |
|---|---|---|---|
| R1 | **`preferredId` set but provider not installed/configured → run fails with `RESEARCH_CAPABILITY_UNAVAILABLE`** | `resolveActiveIntegrationModel(projectRoot, preferredId)` returns `undefined` with **no fallback** to first-configured (`runtime.ts:147` `find` returns undefined). This changes behavior from "first wins" to "exact match or fail". | The submit change (http-server.ts:246) only sets a real `id` when a configured provider exists, so `loadIntegration(ctx).id` is always a configured one. *Belt-and-suspenders:* add a one-line fallback in `runtime.ts:147`: `?? statuses.find((s) => s.installed && s.configured)` after the preferredId `find`. |
| R2 | **`submitRun` now does async FS access on every run start** | `listIntegrationStatus` checks `node_modules/<pkg>/package.json` for 3 providers (`runtime.ts:44`). | Already done on `GET /api/integrations`; cost is ~3 `fs.access` calls. Acceptable. Guard with the existing `try/catch` fall-through. |
| R3 | **A provider's `node_modules` is mid-install → `installed` flickers** | `installIntegration` runs `npm install` into `app/integration/<id>/`; a run started during install could see `installed:true` but the package half-written. | `installIntegration` uses `--ignore-scripts` and validates `status.installed` after install (`installer.ts:87`). Runs started before install completes will simply not match that provider (falls back). Low risk. |
| R4 | **Inline `WorkflowRuntime` path ignores the new binding** | The default is the BullMQ pipeline; the inline path (`workflow-runtime.ts`) constructs the Researcher in `bindDependencies` and would need the same `preferredIntegrationId` plumbing. | Apply edit #5, OR accept that the inline path keeps "first-configured" (it's legacy/tests). Document it. |
| R5 | **Streaming change parses partial JSON** | If `parseStructuredDraft` runs before `streamText` completes, JSON is incomplete. | Always `await result.text` before parsing (shown above). Never parse from partial deltas. |
| R6 | **Mutating `ProcessingEvent` breaks the locked contract** | `processing-event.schema.json` + frontend dedup on `event_id` + bus invariants ("Passed events cannot carry issue fields"). | Do **not** add provider/token fields to `ProcessingEvent`. Emit tokens as `SUPPORT`-scoped events with `processor: "ResearcherStream"` using the existing `message` field (no schema change). |
| R7 | **Credential leak** | Streaming/forwarding model chunks could echo provider response bodies that contain echoed keys. | Keep the existing invariant (Tavily header + `SECRET_FIELD_RE` in `queue.ts:100`): never forward `apiKey`/`authorization`/`token`-shaped fields; model text only. |
| R8 | **`run-job-contract.test.ts` fixture uses `id:"gemini"`** | The contract test already expects a real id; the old `"standalone"` placeholder was inconsistent with it. | Our change aligns submit with the contract — this *fixes* a latent inconsistency, not a break. |

### What tests prevent breakage?

| Test file | What it guards | Why it matters here |
|---|---|---|
| `backend/tests/ts/integration-package-runtime.test.ts` | `loadIntegrationPackage`/`loadIntegrationModel`/`resolveActiveIntegrationModel` + `RESEARCH_CAPABILITY_UNAVAILABLE` when none configured (L126 `assert.rejects`). | **Extend:** assert `preferredId` is honored; assert preferredId-not-found fallback (R1). |
| `backend/tests/ts/run-job-contract.test.ts` | `validateRunJobV1` rejects malformed `integration` selector (id non-empty string, model string, configRevision number) — fixture uses `id:"gemini"`. | Guarantees the new real `selector` still passes job validation (R8). |
| `backend/tests/ts/integration-http-routes.test.ts` | `GET /api/integrations`, install, configure endpoints. | Confirms the submit change (which reuses these helpers) doesn't regress the endpoints. |
| `backend/tests/ts/workflow-runtime.test.ts` | Inline `WorkflowRuntime` → `Passed` + `hash_proof.equal` (L14-16). | Guards the inline path (R4) — if you skip edit #5, this still passes (first-configured) but won't assert per-run binding. |
| `backend/tests/ts/session-transcript-e2e.test.ts` | Run finishes `Passed`, event count, hash_proof present (L165-167). | End-to-end: researcher still produces a valid bundle with the new binding. |
| `backend/tests/ts/task-management.test.ts` | `ProcessingEventBus` emit ordering + invariants (Passed cannot carry issue fields). | Guards R6 — don't violate event-bus invariants when adding token events. |
| `backend/tests/python/test_schemas.py` | Validates `run-snapshot:2` and `processing-event:2` schemas (L24-28). | Guarantees no schema drift — critical if you're tempted to add fields to `ProcessingEvent`/`RunSnapshot`. |
| `backend/scripts/test-pipeline-e2e.mjs` + `*-recovery.mjs` | Full BullMQ pipeline reaches `DONE Passed`; checkpoint/recovery survives crashes. | The real default-path smoke test — the researcher stage must still yield a parseable bundle. |
| `npm run verify` (→ `app/scripts/verify_all.py`) | Repo-wide verification incl. manifest. | Final gate before any release-facing commit. |

### Pre-existing tests that need new assertions (not new test files)
- `integration-package-runtime.test.ts`: add "preferredId honored over first-configured" and "preferredId-not-found falls back to first-configured" (R1).
- `session-transcript-e2e.test.ts`: assert the persisted `"integration"` artifact `id` is a real provider id (not `"standalone"`) when a provider is configured (Blocker #2).

---

## Summary

- **Blocker #1 (Provider Selection)** is a single-line selection seam (`workflow.ts:130`) plus ~5 lines of plumbing across 3 files. The provider-agnostic factory + `preferredId` parameter already exist — they're just never fed a per-run value because `submitRun` saves a `"standalone"` placeholder and `loadIntegration` has no caller.
- **Blocker #2 (Session/Context Persistence)** needs **no data-structure change**. The context is already canonical/provider-agnostic and self-attributing via `ResearcherArtifact.evidence[].provenance`. The only fix is persisting the real binding instead of the placeholder — the same `http-server.ts:246` edit as Blocker #1.
- **Blocker #3 (Streaming)** already uses provider-agnostic SSE for stage events. Model-token streaming doesn't exist today; adding it via `streamText` is provider-agnostic by construction, with the only guardrail being "don't mutate the locked `ProcessingEvent` schema."
- **Minimum viable**: 3 files, ~6 line-level edits, no new dependencies, no schema-registry change, no refactor. The biggest risk (R1) is a one-line fallback in `runtime.ts:147`.

If you toggle to Act mode, I can implement edits #1-#3 (Blockers #1+#2) and extend the two tests, then run `npm run build:backend && npm test` and the pipeline E2E script to validate.