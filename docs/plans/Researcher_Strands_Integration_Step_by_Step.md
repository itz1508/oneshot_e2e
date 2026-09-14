# Researcher Strands Integration — Step-by-Step Implementation Guide

**Status:** PLANNING · **Duration:** ~2 hours · **Environment:** Windows / PowerShell, Node ≥ 24.13, npm ≥ 11.8
**Verified:** the new source files compile under the repo's strict `tsconfig.json` (`npm run build:backend` clean) and the new `node:test` passes 3/3 — confirmed against this repo before publishing.
**Approach:** Additive, behind an env flag, server-side only. No breaking changes to the existing Researcher.

> ## ⚠️ Corrections applied to the original template (read first)
> The original task template referenced a file structure and APIs that do **not** exist in this repo.
> This guide was rewritten against the **verified** codebase so every command actually runs:
>
> | Template said | Verified reality (this guide uses) |
> |---|---|
> | `app/web/runtime/workflows/researcher.ts` with `executeResearcherStage(prompt, context)` | Real Researcher = `backend/agents/researcher/workflow.ts`, class `ResearcherWorkflow`, method `run(prompt: Prompt, runId: string): Promise<ResearchBundle>` |
> | `new TavilyClient({ apiKey })` from `@tavily/core` | `@tavily/core` exports a `tavily()` **factory**: `const tvly = tavily({ apiKey })`. OneShot's live path uses a **Python worker** (`backend/agents/researcher/tool/tavily/worker.py`). |
> | Strands events `{ type: 'tool_call', toolName, toolInput }` / `{ type: 'message', role, content }` | Real `AgentStreamEvent` is a union of event **classes**: `BeforeToolCallEvent` (`event.toolUse.name`), `ModelStreamUpdateEvent` (`event.event.delta.text`), etc. `agent.stream()` returns `AsyncGenerator<AgentStreamEvent, AgentResult>`. |
> | `vitest`, `tests/`, `npm test -- --run` | This repo uses **`node:test`** + `node:assert/strict`. Tests live in `backend/tests/ts/`, compiled via `tsc -p tsconfig.test.json`, run via `npm test`. |
> | `zod: ^3.22.0` | Strands peer-depends `zod ^4.1.12`. Use `^4.1.12`. |
> | `uv .venv`, `source .venv/bin/activate` | Not how this repo works. It's Node on Windows + `app/env/.env`. PowerShell here. |
>
> **Plan compliance:** the approved `docs/Refactor_plan.md` (Non-goals §3) says *"Strands is introduced only as an adapter, not a replacement"* and §P6.1 *"No Strands SDK in the browser."* This guide respects both: Strands is used **only** inside `backend/agents/researcher/` (server), behind `ONESHOT_RESEARCH_USE_STRANDS=1`, default OFF.

**Prerequisites:**
- OneShot repo at `d:\oneshot_e2e` (this environment).
- Node ≥ 24.13 and npm ≥ 11.8 (AGENTS.md).
- No model provider configured yet is OK — the agent path is **skipped** without one; the deterministic path needs a `ONESHOT_RESEARCH_TEST_DRAFT_FILE` or a configured provider to fully run, but the **new tool unit tests** need neither.

**Success Criteria:**
- [ ] New dir `backend/agents/researcher/strands-tools/` created
- [ ] New files written: `strands-tools/tavily-search.ts`, `strands-agent.ts`
- [ ] `backend/agents/researcher/workflow.ts` modified (exact Case F inserted, behind flag)
- [ ] `app/env/.env.example` documents the flag
- [ ] `zod` added to root `package.json`; `npm install` succeeds
- [ ] `@ai-sdk/provider@4.0.13` root-installed (GAP-STRANDS-01); `@strands-agents/sdk/models/vercel` import resolves
- [ ] `npm run build:backend` succeeds; `npm run build:test` succeeds
- [ ] `npm test` passes (new `researcher-strands-adapter.test.ts` passes without any API key)
- [ ] Deterministic path unchanged & green; agent path only active when flag=1 **and** a model is configured

---

## PHASE 0: VERIFY ENVIRONMENT

### Step 0.1 — Confirm working directory
```powershell
pwd
```
Expected:
```
Path
----
d:\oneshot_e2e
```
If not, navigate:
```powershell
cd d:\oneshot_e2e
```

### Step 0.2 — Confirm Node & npm versions (repo requires Node ≥ 24.13)
```powershell
node --version
npm --version
```
Expected (your versions may be slightly higher):
```
v24.13.0   # or higher
11.8.0     # or higher
```

### Step 0.3 — Confirm Strands SDK is already installed (it's a declared dependency)
```powershell
npm ls @strands-agents/sdk --depth=0
```
Expected:
```
oneshot-production-e2e@1.3.0
`-- @strands-agents/sdk@1.17.0
```
> Strands is already a dependency but is **imported nowhere** in `backend/` source today. This guide adds the first real import.

### Step 0.4 — Confirm the real Researcher file exists (the one we will modify)
```powershell
Test-Path backend\agents\researcher\workflow.ts
```
Expected:
```
True
```
Also confirm the deterministic Tavily path we will **reuse** (not replace):
```powershell
Test-Path backend\agents\researcher\tool\tavily\bridge.ts
Test-Path backend\agents\researcher\tool\tavily\worker.py
```
Expected:
```
True
True
```

---

## PHASE 1: CREATE FOLDER STRUCTURE

### Step 1.1 — Create the Strands tools directory (server-side only)
```powershell
New-Item -ItemType Directory -Force -Path backend\agents\researcher\strands-tools | Out-Null
Test-Path backend\agents\researcher\strands-tools
```
Expected:
```
True
```

### Step 1.2 — List the existing Researcher files we are keeping untouched
```powershell
Get-ChildItem backend\agents\researcher -Recurse -File | Select-Object FullName
```
Expected (partial — these must all still be present after we finish):
```
...\researcher\workflow.ts            # MODIFIED in Phase 4 (additive, behind flag)
...\researcher\structured-draft.ts     # untouched
...\researcher\tool\evidence\collector.ts   # untouched (deterministic path)
...\researcher\tool\tavily\evidence.ts       # untouched
...\researcher\tool\tavily\bridge.ts         # REUSED by the new tool
...\researcher\tool\tavily\worker.py         # untouched (Python SDK path)
```
> Do **not** delete or rename any existing file. This integration is purely additive.

---

## PHASE 2: VERIFY & UPDATE DEPENDENCIES

Strands' `tool()` factory and `structuredOutputSchema` require **zod**. Strands peer-depends `zod ^4.1.12` (verified in `node_modules/@strands-agents/sdk/package.json`). zod is not currently a **direct** root dependency (it is already present transitively as `zod@4.6.4`, deduped under `@strands-agents/sdk`, `@modelcontextprotocol/sdk`, and `ai`).

### Step 2.1 — Confirm zod is not currently a direct dependency
```powershell
npm ls zod --depth=0
```
Expected (it is NOT a direct dep — exit code 1, "(empty)" is normal here):
```
oneshot-production-e2e@1.3.0
`-- (empty)
```

> zod is already resolvable transitively (see Step 2.1), so the code compiles/runs even before this step. Adding it as a direct dependency below is recommended hygiene to pin intent and survive future dedup changes — not strictly required.

### Step 2.2 — Add zod to root `package.json` at the Strands-compatible version
Open `d:\oneshot_e2e\package.json`. In the `"dependencies"` block (currently contains `@strands-agents/sdk`, `ai`, `bullmq`, `ioredis`, etc.), add the zod line. The block currently looks like:
```json
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.30.0",
    "@strands-agents/sdk": "^1.17.0",
    "ai": "^7.0.97",
    "ajv": "^8.20.0",
    "bullmq": "^6.3.4",
    "ioredis": "^6.0.0",
    "strands-agents-mcp-server": "^0.0.1"
  },
```
Add this line (keep keys alphabetically sorted):
```json
    "zod": "^4.1.12",
```
Resulting block:
```json
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.30.0",
    "@strands-agents/sdk": "^1.17.0",
    "ai": "^7.0.97",
    "ajv": "^8.20.0",
    "bullmq": "^6.3.4",
    "ioredis": "^6.0.0",
    "strands-agents-mcp-server": "^0.0.1",
    "zod": "^4.1.12"
  },
```
Save the file.

### Step 2.3 — Install `@ai-sdk/provider` at root (GAP-STRANDS-01 — REQUIRED)
> **Update 2026-09-13 (gap run):** earlier text claimed Strands imports `@ai-sdk/provider`
> type-only and needs no install. That is **wrong**: `VercelModel` does a **runtime**
> import (`import { APICallError } from '@ai-sdk/provider'` in
> `node_modules/@strands-agents/sdk/dist/src/models/vercel.js:1`), and the package is
> **not installed at root** (only nested under `ai/`), so the SDK import throws
> `ERR_MODULE_NOT_FOUND` today. Root-install it, pinned to `ai`'s exact version:
```powershell
npm i -E @ai-sdk/provider@4.0.13
npm ls @ai-sdk/provider
```
Expected: a top-level `@ai-sdk/provider@4.0.13` line plus the nested copies under `ai` — one effective version, no duplicates, no override in `package.json`.
> Verify the import resolves: `node -e "import('@strands-agents/sdk/models/vercel').then(()=>console.log('OK'))"` → `OK`.
>
> Note: `@ai-sdk/google` (Gemini) lives in `app/integration/gemini/node_modules` (isolated per-provider storage) — that is expected, not a conflict. Whether the installed providers satisfy Strands' expected `LanguageModelV3` shape is **GAP-STRANDS-03 (UNCONFIRMED)**: Builder must verify at adapter-build time and add a minimal spec wrapper in the adapter if needed.

### Step 2.4 — Install
```powershell
npm install
```
Expected (last lines):
```
added N packages, and audited M packages in Xs
```
> Do not proceed if `npm install` reports an `ERESOLVE` peer-dep conflict. None is expected in this repo (Strands' `@ai-sdk/provider` peer dep is optional — though it is a **runtime** import per GAP-STRANDS-01, hence the Step 2.3 root install; zod already dedupes). If one ever appears, resolve it before continuing.

### Step 2.5 — Verify both deps resolve
```powershell
npm ls zod --depth=0
npm ls @strands-agents/sdk --depth=0
```
Expected:
```
oneshot-production-e2e@1.3.0
`-- zod@4.x.x
oneshot-production-e2e@1.3.0
`-- @strands-agents/sdk@1.17.0
```

---

## PHASE 3: CREATE NEW FILES

### Step 3.1 — Create `backend/agents/researcher/strands-tools/tavily-search.ts`

Create the file and paste the complete content below. This wraps OneShot's **existing** hardened Python Tavily worker (`bridge.ts` → `worker.py`) as a Strands `tool` — it adds **no** new Tavily SDK call, **no** new credential path, and reuses the existing `redactSecret` + timeout. The runner is injectable so the test can mock it.

```powershell
New-Item -ItemType File -Path backend\agents\researcher\strands-tools\tavily-search.ts -Force | Out-Null
```

File contents — paste exactly:
```typescript
// backend/agents/researcher/strands-tools/tavily-search.ts
//
// Strands tool adapter for Tavily search — SERVER-SIDE ONLY.
// ("No Strands SDK in the browser" — docs/Refactor_plan.md P6.1)
//
// Reuses OneShot's existing hardened Python Tavily worker (worker.py) via
// TavilyPythonRunner — it already enforces credential redaction (redactSecret)
// and a timeout (TAVILY_TIMEOUT_SECONDS). This adapter only exposes that path
// to the model as a Strands tool. It adds NO new Tavily SDK call.

import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import {
  TavilyPythonRunner,
  type TavilyRunner,
  type TavilyRequest,
} from "../tool/tavily/bridge.js";

const tavilySearchInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(400)
    .describe("The research query to search the web for."),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("Maximum number of search results to return (1-20)."),
  search_depth: z
    .enum(["basic", "advanced"])
    .default("advanced")
    .describe("Search depth: 'advanced' is slower but more thorough."),
});

type SearchResponse = {
  answer?: string;
  results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
  request_id?: string;
};

/**
 * Build the Strands `tavily_search` tool.
 *
 * @param projectRoot OneShot project root (passed to the Python worker).
 * @param runner      Optional TavilyRunner for tests; defaults to TavilyPythonRunner.
 */
export function createTavilySearchTool(projectRoot: string, runner?: TavilyRunner) {
  const r = runner ?? new TavilyPythonRunner(projectRoot);
  return tool({
    name: "tavily_search",
    description:
      "Search the web for current/external evidence via Tavily. " +
      "Returns { answer, request_id, results[] } where each result has " +
      "{ title, url, content }. Cite returned URLs as provenance.",
    inputSchema: tavilySearchInputSchema,
    callback: async (input) => {
      if (!(process.env.TAVILY_API_KEY || "").trim()) {
        // Strands wraps thrown errors into an error ToolResultBlock automatically.
        throw new Error("TAVILY_API_KEY not configured");
      }
      const request: TavilyRequest = {
        op: "search",
        query: input.query,
        include_answer: "advanced",
        search_depth: input.search_depth,
        max_results: input.max_results,
      };
      const res = await r.run<SearchResponse>(request);
      const requestId = res.request_id ?? "unknown";
      return {
        answer: res.answer ?? null,
        request_id: requestId,
        results: (res.results ?? []).map((item) => ({
          title: item.title ?? "",
          url: item.url ?? "",
          // Honor the evidence byte budget used by the deterministic path.
          content: (item.content ?? "").slice(0, 12000),
        })),
      };
    },
  });
}
```

Type-check this one file in isolation (the import targets resolve after Phase 2's `npm install`):
```powershell
npx tsc --noEmit --module nodenext --moduleResolution nodenext backend\agents\researcher\strands-tools\tavily-search.ts
```
> Isolated `tsc` on a single file may report project-wide resolution noise; the authoritative check is `npm run build:backend` in Phase 7. If the isolated check shows only cross-file import errors, proceed.

### Step 3.2 — Create `backend/agents/researcher/strands-agent.ts`

This wraps OneShot's already-resolved model (`LanguageModelV3` from `resolveActiveIntegrationModel`) in Strands' `VercelModel`, builds a Strands `Agent` with the `tavily_search` tool, and streams. The **contract** is intentionally identical to the deterministic path: the agent produces **text**, which the existing `parseStructuredDraft(text)` then turns into the `StructuredResearchDraft`. No new return shape is introduced downstream.

```powershell
New-Item -ItemType File -Path backend\agents\researcher\strands-agent.ts -Force | Out-Null
```

File contents — paste exactly:
```typescript
// backend/agents/researcher/strands-agent.ts
//
// Strands Agent adapter for the Researcher's single model-driven step.
// SERVER-SIDE ONLY ("No Strands SDK in the browser" — docs/Refactor_plan.md P6.1).
//
// Used only when process.env.ONESHOT_RESEARCH_USE_STRANDS === "1".
// Default (flag off) keeps the deterministic generateText() path unchanged.

import {
  Agent,
  BeforeToolCallEvent,
  type AgentResult,
  type AgentStreamEvent,
} from "@strands-agents/sdk";
import { VercelModel } from "@strands-agents/sdk/models/vercel";
import { createTavilySearchTool } from "./strands-tools/tavily-search.js";

export interface StrandsResearcherInput {
  /** OneShot project root (passed to the Tavily Python worker). */
  projectRoot: string;
  /** Fully-built prompt text (same string the deterministic path sends to generateText). */
  promptText: string;
  /** The Researcher system prompt (RESEARCHER_SYSTEM_PROMPT from workflow.ts). */
  systemPrompt: string;
  /** LanguageModelV3 from resolveActiveIntegrationModel() — wrapped in VercelModel. */
  activeModel: unknown;
}

export interface StrandsResearcherResult {
  /** The model's full assistant text. Fed to parseStructuredDraft() downstream. */
  text: string;
  /** How many tool calls the model made (telemetry). */
  toolCalls: number;
  /** Wall-clock latency in ms (telemetry). */
  latencyMs: number;
}

/**
 * Run the Researcher's model step as a Strands Agent.
 *
 * Flow:
 *   activeModel (LanguageModelV3) → new VercelModel({provider}) → new Agent({model, tools, systemPrompt})
 *   → agent.stream(promptText) → count BeforeToolCallEvent → capture AgentResult (return value)
 *   → result.toString() → text
 *
 * The text is then parsed by the SAME parseStructuredDraft() the deterministic
 * path uses, so the ResearchBundle contract is unchanged.
 */
export async function runResearcherAsStrandsAgent(
  input: StrandsResearcherInput,
): Promise<StrandsResearcherResult> {
  const start = Date.now();

  const model = new VercelModel({ provider: input.activeModel as any });
  const agent = new Agent({
    model,
    systemPrompt: input.systemPrompt,
    tools: [createTavilySearchTool(input.projectRoot)],
  });

  let toolCalls = 0;
  let result: AgentResult | undefined;

  // agent.stream() is AsyncGenerator<AgentStreamEvent, AgentResult>.
  // Use a manual loop so we can capture the AgentResult RETURN value
  // (for await...of does not expose the generator's return value).
  const gen = agent.stream(input.promptText);
  while (true) {
    const { value, done } = await gen.next();
    if (done) {
      result = value as AgentResult;
      break;
    }
    const event = value as AgentStreamEvent;
    if (event instanceof BeforeToolCallEvent) toolCalls += 1;
  }

  // result.toString() returns structuredOutput (JSON) if set, else the text blocks.
  const text = result?.toString() ?? "";
  return { text, toolCalls, latencyMs: Date.now() - start };
}
```

### Step 3.3 — (No barrel file needed.)
OneShot's `backend/` uses direct relative `.js` imports (ESM convention), not a public barrel. The two files above are imported directly by `workflow.ts` (Phase 4) and the test (Phase 6). Do **not** create an `index.ts` barrel — it would diverge from the surrounding module convention.

---

## PHASE 4: MODIFY THE EXISTING RESEARCHER (additive, behind a flag)

This is the only edit to an existing source file. It adds **Case F** inside the existing Case E block, gated by `ONESHOT_RESEARCH_USE_STRANDS=1`. Default OFF → the existing `generateText` path is byte-for-byte unchanged.

### Step 4.1 — Add the import (top of `backend/agents/researcher/workflow.ts`)

Open `backend\agents\researcher\workflow.ts`. The import of `resolveActiveIntegrationModel` is at **line 16**:
```typescript
import { resolveActiveIntegrationModel } from "../../integration/runtime.js";
```
Add this new line immediately **after** line 16:
```typescript
import { runResearcherAsStrandsAgent } from "./strands-agent.js";
```

### Step 4.2 — Insert Case F into the `activeModel` block (lines 138–150)

**BEFORE** (current lines 138–150):
```typescript
      if (activeModel) {
        const evidenceText = gathered
          .map((e) => `[${e.source}] ${e.statement}`)
          .join("\n");
        const promptText = `User Intent: ${prompt.intent}\nRequested Outcome: ${prompt.requested_outcome}\nContext:\n${evidenceText}`;

        const result = await generateText({
          model: activeModel,
          system: RESEARCHER_SYSTEM_PROMPT,
          prompt: promptText,
        });

        draft = parseStructuredDraft(result.text);
      } else {
```

**AFTER** (replace the above block with this — note the `generateText` body is unchanged, just nested under `else`):
```typescript
      if (activeModel) {
        const evidenceText = gathered
          .map((e) => `[${e.source}] ${e.statement}`)
          .join("\n");
        const promptText = `User Intent: ${prompt.intent}\nRequested Outcome: ${prompt.requested_outcome}\nContext:\n${evidenceText}`;

        if (process.env.ONESHOT_RESEARCH_USE_STRANDS === "1") {
          // Case F (experimental): Strands Agent with a model-driven tavily_search tool.
          // Produces text → the SAME parseStructuredDraft path → identical ResearchBundle.
          const strands = await runResearcherAsStrandsAgent({
            projectRoot: this.projectRoot,
            promptText,
            systemPrompt: RESEARCHER_SYSTEM_PROMPT,
            activeModel,
          });
          draft = parseStructuredDraft(strands.text);
        } else {
          const result = await generateText({
            model: activeModel,
            system: RESEARCHER_SYSTEM_PROMPT,
            prompt: promptText,
          });
          draft = parseStructuredDraft(result.text);
        }
      } else {
```

> The `else` branch (lines 151–163, the `RESEARCH_CAPABILITY_UNAVAILABLE` throw) is **untouched**. When the flag is OFF, execution is identical to today. When the flag is ON but `activeModel` is falsy, the existing ROOT_CAUSE error still fires — the agent path is never reached without a model.

### Step 4.3 — Verify the edit didn't change the default path
The deterministic `generateText` call must still be present verbatim inside the new `else`:
```powershell
Select-String -Path backend\agents\researcher\workflow.ts -Pattern "generateText" -SimpleMatch
```
Expected (one match, inside the `else`):
```
backend\agents\researcher\workflow.ts:NNN:          const result = await generateText({
```

---

## PHASE 5: DOCUMENT THE FLAG

### Step 5.1 — Add the flag to `app/env/.env.example`

Open `app\env\.env.example`. The Tavily block is around **lines 32–45** and begins with:
```
# ── Optional Tavily Researcher Evidence ───────────────────────────────────────
```
Immediately **after** the Tavily block (after the line `# ONESHOT_TAVILY_MAX_EVIDENCE_BYTES=12000`, around line 45), insert:
```
# ── Researcher Strands Agent path (experimental) ─────────────────────────────
# OFF by default. When =1 AND a model provider is configured, the Researcher runs
# as a Strands Agent with a model-driven tavily_search tool (vs deterministic gather).
# Leave OFF for production. Requires a configured provider (gemini/openai/anthropic)
# AND TAVILY_API_KEY for the tool to do anything useful.
# ONESHOT_RESEARCH_USE_STRANDS=0
```

### Step 5.2 — Verify the edit
```powershell
Select-String -Path app\env\.env.example -Pattern "ONESHOT_RESEARCH_USE_STRANDS"
```
Expected:
```
app\env\.env.example:NN:# ONESHOT_RESEARCH_USE_STRANDS=0
```

---

## PHASE 6: CREATE THE TEST (`node:test`, no API key required)

OneShot uses `node:test` + `node:assert/strict` — **not** vitest. Tests live in `backend/tests/ts/`, are compiled by `tsc -p tsconfig.test.json`, and run by `npm test`. This test mocks the `TavilyRunner` (exactly like the existing `backend/tests/ts/tavily-researcher-evidence.test.ts` does), so it needs **no API key, no model, no network**.

### Step 6.1 — Create the test file
```powershell
New-Item -ItemType File -Path backend\tests\ts\researcher-strands-adapter.test.ts -Force | Out-Null
```

File contents — paste exactly:
```typescript
// backend/tests/ts/researcher-strands-adapter.test.ts
//
// Unit tests for the Strands Tavily tool + gate flag. No API key, no model,
// no network: the TavilyRunner is mocked (same pattern as
// tavily-researcher-evidence.test.ts).

import test from "node:test";
import assert from "node:assert/strict";

import { createTavilySearchTool } from "../../agents/researcher/strands-tools/tavily-search.js";
import type {
  TavilyRunner,
  TavilyRequest,
} from "../../agents/researcher/tool/tavily/bridge.js";

function withEnv(
  values: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const before = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(values)) {
    before.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  return fn().finally(() => {
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

test("tavily_search tool: name + canonical result mapping via mocked runner", async () => {
  await withEnv({ TAVILY_API_KEY: "test-key-not-a-secret" }, async () => {
    const requests: TavilyRequest[] = [];
    const runner: TavilyRunner = {
      async run<T>(request: TavilyRequest): Promise<T> {
        requests.push(request);
        assert.equal(request.op, "search");
        if (request.op === "search") {
          assert.equal(request.include_answer, "advanced");
          assert.equal(request.search_depth, "advanced");
          assert.equal(request.max_results, 5);
        }
        return {
          answer: "synthesized answer",
          request_id: "r1",
          results: [
            {
              title: "Authoritative source",
              url: "https://example.com/source",
              content: "Extracted content",
              score: 0.99,
            },
          ],
        } as T;
      },
    };

    const t = createTavilySearchTool(".", runner);
    assert.equal(t.name, "tavily_search");

    const out = (await t.invoke(
      { query: "test query", max_results: 5, search_depth: "advanced" },
    )) as {
      answer: string | null;
      request_id: string;
      results: Array<{ title: string; url: string; content: string }>;
    };

    assert.equal(out.request_id, "r1");
    assert.equal(out.answer, "synthesized answer");
    assert.ok(Array.isArray(out.results));
    assert.equal(out.results.length, 1);
    assert.equal(out.results[0].url, "https://example.com/source");
    assert.equal(out.results[0].content, "Extracted content");
    assert.equal(requests.length, 1);
  });
});

test("tavily_search tool: throws when TAVILY_API_KEY is missing", async () => {
  await withEnv({ TAVILY_API_KEY: undefined }, async () => {
    const runner: TavilyRunner = {
      async run<T>(): Promise<T> {
        throw new Error("runner must not be called when the key is absent");
      },
    };
    const t = createTavilySearchTool(".", runner);
    await assert.rejects(
      () =>
        t.invoke(
          { query: "q", max_results: 5, search_depth: "advanced" },
        ),
      /TAVILY_API_KEY not configured/,
    );
  });
});

test("gate flag: ONESHOT_RESEARCH_USE_STRANDS is OFF by default", () => {
  // The workflow.ts gate checks `=== "1"`. Absent or any other value = deterministic path.
  delete process.env.ONESHOT_RESEARCH_USE_STRANDS;
  assert.notEqual(process.env.ONESHOT_RESEARCH_USE_STRANDS, "1");
});
```

> This test does **not** exercise `runResearcherAsStrandsAgent` end-to-end, because that requires a **real configured model** (gemini/openai/anthropic) — there is no mock `LanguageModelV3` in this repo. The full agent loop is validated manually in Phase 12 with a real key + provider. The test above covers what can be proven deterministically: the tool contract, the credential guard, and the gate default.

---

## PHASE 7: BUILD

### Step 7.1 — Compile the backend (this is the authoritative type-check for the new files)
```powershell
npm run build:backend
```
`npm run build:backend` = `tsc -p tsconfig.json`. Expected (last lines):
```
> tsc -p tsconfig.json
```
(no errors = success). If you see `error TS2307: Cannot find module 'zod'` → Phase 2's `npm install` didn't complete; re-run it. If you see `Cannot find module '@strands-agents/sdk/models/vercel'` → the install is corrupt; `npm install` again.

### Step 7.2 — Compile the tests
```powershell
npm run build:test
```
`npm run build:test` = `tsc -p tsconfig.test.json`. Expected (no errors). This is the authoritative check that the new test file type-checks (mocked runner, tool `.invoke`, etc.).

### Step 7.3 — Confirm the compiled outputs exist
```powershell
Test-Path dist\backend\agents\researcher\strands-tools\tavily-search.js
Test-Path dist\backend\agents\researcher\strands-agent.js
Test-Path dist\backend\tests\ts\researcher-strands-adapter.test.js
```
Expected:
```
True
True
True
```
> If the new `.js` outputs are missing, `tsconfig.json`/`tsconfig.test.json` is not including the new paths. Check `tsconfig.json` `include`/`exclude`; the backend glob must cover `backend/agents/researcher/strands-tools/**`.

---

## PHASE 8: RUN TESTS

### Step 8.1 — Run the full backend test suite (compiles + runs everything, including existing tests)
```powershell
npm test
```
`npm test` = `npm run build:backend && tsc -p tsconfig.test.json && node --test --test-concurrency=1 --test-force-exit dist/backend/tests/ts/*.test.js`.

Expected (tail of output) — the new test file passes 3 tests, and the pre-existing `tavily-researcher-evidence.test.ts` still passes (it is unchanged):
```
✔ tavily_search tool: name + canonical result mapping via mocked runner (X ms)
✔ tavily_search tool: throws when TAVILY_API_KEY is missing (X ms)
✔ gate flag: ONESHOT_RESEARCH_USE_STRANDS is OFF by default (X ms)
...
# tests N
# pass  N
# fail  0
```
> `# fail 0` is the success criterion. If any test fails, read the assertion — the most likely cause is a `tsc`/zod resolution error (re-check Phase 2) or a `tsconfig` include gap (Phase 7.3).

### Step 8.2 — Confirm the deterministic Tavily path is still green (unchanged test)
```powershell
node --test dist\backend\tests\ts\tavily-researcher-evidence.test.js
```
Expected: 3 tests pass (`search-extract`, `research-stream`, `disabled-when-no-key`). These are the pre-existing tests; they must be unaffected because we changed no Tavily code.

### Step 8.3 — Confirm the agent path is NOT reachable without the flag + a model
The gate test (Step 6.1, 3rd test) already asserts the default. To confirm at runtime that the flag is off in your shell:
```powershell
echo $env:ONESHOT_RESEARCH_USE_STRANDS   # PowerShell: prints nothing or $null = off
```
Expected: empty (flag off → deterministic path is the production default).

---

## PHASE 9: VERIFY FILE STRUCTURE

### Step 9.1 — List all new files
```powershell
Get-ChildItem -Recurse -File backend\agents\researcher\strands-tools, backend\agents\researcher\strands-agent.ts, backend\tests\ts\researcher-strands-adapter.test.ts | Select-Object FullName
```
Expected:
```
...\backend\agents\researcher\strands-agent.ts
...\backend\agents\researcher\strands-tools\tavily-search.ts
...\backend\tests\ts\researcher-strands-adapter.test.ts
```

### Step 9.2 — Confirm the only modified existing files
```powershell
git status --short
```
Expected (the `M` entries are the only existing files touched):
```
 M app/env/.env.example
 M backend/agents/researcher/workflow.ts
 M package.json
 M package-lock.json
?? backend/agents/researcher/strands-agent.ts
?? backend/agents/researcher/strands-tools/tavily-search.ts
?? backend/tests/ts/researcher-strands-adapter.test.ts
```
> No existing file was **deleted or renamed**. No backup files were created (this guide does not use `.backup` files — `git` is the rollback).

### Step 9.3 — Confirm the flag is documented and zod is in package.json
```powershell
Select-String -Path app\env\.env.example -Pattern "ONESHOT_RESEARCH_USE_STRANDS"
Select-String -Path package.json -Pattern '"zod"'
```
Expected:
```
app\env\.env.example:NN:# ONESHOT_RESEARCH_USE_STRANDS=0
package.json:NN:    "zod": "^4.1.12"
```

---

## PHASE 10: COMMIT (only when authorized)

> Per the repo `AGENTS.md`: *"Commit and push only when authorized by the user."* Do not run `git commit` until explicitly approved. The steps below are the exact commands to run once authorized.

### Step 10.1 — Stage the precise paths (no `git add .`)
```powershell
git add backend/agents/researcher/strands-agent.ts `
  backend/agents/researcher/strands-tools/tavily-search.ts `
  backend/tests/ts/researcher-strands-adapter.test.ts `
  backend/agents/researcher/workflow.ts `
  app/env/.env.example `
  package.json package-lock.json
```

### Step 10.2 — Review the staged diff
```powershell
git status --short
git diff --cached backend/agents/researcher/workflow.ts
```
Confirm: the `workflow.ts` diff only adds the import + the `if (process.env.ONESHOT_RESEARCH_USE_STRANDS === "1")` branch; the `generateText` body sits unchanged under the new `else`.

### Step 10.3 — Commit (run only when authorized)
```powershell
git commit -m "feat(researcher): add Strands Agent path behind ONESHOT_RESEARCH_USE_STRANDS flag

Additive only; default OFF keeps the deterministic generateText path unchanged.
- strands-tools/tavily-search.ts: Strands tool() wrapping existing TavilyPythonRunner
- strands-agent.ts: VercelModel + Agent + agent.stream() -> text (same parseStructuredDraft)
- workflow.ts: Case F inside Case E, gated by ONESHOT_RESEARCH_USE_STRANDS=1
- researcher-strands-adapter.test.ts: node:test, mocked runner, no key/model needed
- package.json: add zod ^4.1.12 (Strands peer dep)

Plan: docs/Refactor_plan.md (Strands as adapter, not replacement; no Strands in browser)."
```

### Step 10.4 — Verify the commit
```powershell
git log --oneline -1
```
Expected:
```
<sha> feat(researcher): add Strands Agent path behind ONESHOT_RESEARCH_USE_STRANDS flag
```

---

## PHASE 11: POST-IMPLEMENTATION CHECKLIST

### Step 11.1 — Full suite green (no regressions)
```powershell
npm test
```
Expected: `# fail 0` (existing tests + the 3 new tests all pass).

### Step 11.2 — Deterministic path is the default
```powershell
$env:ONESHOT_RESEARCH_USE_STRANDS = $null
npm test
```
Expected: same `# fail 0`. The agent path is never entered when the flag is unset.

### Step 11.3 — Agent path stays dormant without a model
Even with the flag ON, no model provider configured → `resolveActiveIntegrationModel` returns `undefined` → the existing `RESEARCH_CAPABILITY_UNAVAILABLE` ROOT_CAUSE fires (Case E `else`, unchanged). The agent path is only reached when **both** the flag is `1` **and** a model is configured. By design.

---

## PHASE 12: NEXT STEPS (DECISION POINT)

You now have two paths. Pick ONE.

### OPTION A — Stop here (deterministic path only; agent path archived behind the flag)
The agent path exists but is gated OFF. To keep it permanently off in your env:
```powershell
Add-Content app\env\.env "ONESHOT_RESEARCH_USE_STRANDS=0"
```
No further action. The deterministic `generateText` path remains the production default.

### OPTION B — Test the agent path end-to-end (requires provisioning)
The agent path needs **two** things the unit tests don't have: a configured model provider AND a Tavily key.
```powershell
# 1. Configure a provider (gemini is bundled; openai/anthropic need install via the UI's [+] Add Integration):
#    POST /api/integrations/gemini/configure  { apiKey, model }
#    (or set GOOGLE_GENERATIVE_AI_API_KEY + GEMINI_MODEL in app/env/.env)

# 2. Add Tavily key + enable the flag in app/env/.env:
Add-Content app\env\.env "`nTAVILY_API_KEY=your_key_here"
Add-Content app\env\.env "`nONESHOT_RESEARCH_USE_STRANDS=1"

# 3. Restart the server/worker so they reload .env, then start a run:
#    POST /api/runs { intent, requested_outcome, research_direction }

# 4. Observe: the Researcher stage now runs as a Strands Agent.
#    - The SSE stream (GET /api/runs/:id/events) still emits the same ProcessingEvents.
#    - The ResearchBundle produced must still validate (urn:oneshot:schema:researcher:2 etc.)
#      because parseStructuredDraft + buildResearchBundle are unchanged.

# 5. Parity check: run the SAME prompt with the flag ON and OFF; diff the resulting
#    research_bundle artifacts. The contract (types) must match; content may differ.
```

### Step 12.1 — Rollback (if Option B fails or you choose Option A)
Because no existing file was deleted/renamed and the change is additive behind a flag:
```powershell
# Soft rollback: just turn the flag off (no code revert needed)
$env:ONESHOT_RESEARCH_USE_STRANDS = "0"
# Full rollback (if authorized): revert the single commit
git revert HEAD
```

---

## VERIFICATION QUICK REFERENCE

| What | Command |
|---|---|
| Build backend | `npm run build:backend` |
| Build tests | `npm run build:test` |
| Run all tests | `npm test` |
| Run only the new test (compiled) | `node --test dist\backend\tests\ts\researcher-strands-adapter.test.js` |
| Confirm flag is OFF | `echo $env:ONESHOT_RESEARCH_USE_STRANDS` (empty = off) |
| Confirm zod installed | `npm ls zod --depth=0` |
| Confirm Strands installed | `npm ls @strands-agents/sdk --depth=0` |
| Confirm gate wiring | `Select-String -Path backend\agents\researcher\workflow.ts -Pattern "ONESHOT_RESEARCH_USE_STRANDS"` |
| Confirm new files compiled | `Test-Path dist\backend\agents\researcher\strands-agent.js` |

---

## FILES SUMMARY

**New (3):**
- `backend/agents/researcher/strands-tools/tavily-search.ts` — Strands `tool()` wrapping the existing `TavilyPythonRunner`
- `backend/agents/researcher/strands-agent.ts` — `VercelModel` + `Agent` + `agent.stream()` → text
- `backend/tests/ts/researcher-strands-adapter.test.ts` — `node:test`, mocked runner (no key/model)

**Modified (3):**
- `backend/agents/researcher/workflow.ts` — +1 import, +Case F behind `ONESHOT_RESEARCH_USE_STRANDS=1` (default OFF)
- `app/env/.env.example` — +flag documentation
- `package.json` / `package-lock.json` — +`zod ^4.1.12`

**Untouched (intentionally):** `structured-draft.ts`, `tool/evidence/collector.ts`, `tool/tavily/*` (evidence/bridge/worker), every other stage, the pipeline, the workflow transitions, the SSE channel, the run repository. The ResearchBundle contract is unchanged; the agent path feeds the same `parseStructuredDraft` → `buildResearchBundle` boundary.

**End of guide.**