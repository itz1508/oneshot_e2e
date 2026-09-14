I now have the complete, verified picture — including the fact that disproves the prompt's central premise. Here is the evaluation.

---

# Tavily Search API vs Strands Agents Tool Integration — Evaluation

## ⚠️ Premises corrected first (verified against the actual codebase)

Three recurring false premises in this prompt must be corrected before evaluating, or the evaluation is worthless:

| Prompt premise | Actual OneShot (verified) |
|---|---|
| "RESEARCHER stage uses Tavily" (as a tool the model calls) | **False.** The Researcher does NOT use Tavily as a model-driven tool. `ResearchEvidenceCollector.collect()` (`backend/agents/researcher/tool/evidence/collector.ts:28`) deterministically gathers prompt + context + files + `this.tavily.collect(prompt)` (`:71`, in try/catch) **before** the single model call. The model then receives evidence as text (`workflow.ts:139-148`). Tavily is **deterministic evidence gathering**, not a tool call. |
| "Can GENERATOR stage use that output?" | **No GENERATOR stage exists** (corrected three times now). The real workflow is `Researcher → ①gate → Planner → Refactor → GapAnalysis → Evaluation → TripleValidation → Confirmation → Hash → ②gate → Builder → Finalize`. Tavily evidence is consumed by the Researcher model and `buildResearchBundle` → `EvidenceRef[]`. |
| Strands `Tool` interface = `{ name, description, schema, execute(params) }` | **Wrong for the installed `@strands-agents/sdk@1.17.0`.** `Tool` is an **abstract class** with `abstract name`, `abstract description`, `abstract toolSpec`, `abstract stream(toolContext): AsyncGenerator<ToolStreamEvent, ToolResultBlock>`. There is **no `schema` field and no `execute()` method.** The practical path is the `tool()` factory (`{name, description, inputSchema: z.object, callback}`) or `new FunctionTool({name, description, inputSchema?: JSONSchema, callback})`. |

**Second key fact**: the Researcher's *actual* Tavily call goes through a **Python worker** — `TavilyEvidenceCollector` → `TavilyPythonRunner` (`bridge.ts:41`) → spawns `worker.py` → uses the **Python `tavily` SDK** (`from tavily import TavilyClient`, `worker.py:8`). The TS `@tavily/core` adapter at `app/integration/tavily/src/index.ts` exists but is **not called by the Researcher** (no caller in `backend/`). So there are two parallel Tavily integrations; only the Python-worker one is live.

---

## 1. Tavily API Structure (verified from `@tavily/core@0.7.11` README + OneShot's adapter)

| Criterion | Finding | Source |
|---|---|---|
| SDK available | ✓ `@tavily/core@0.7.11` (official JS/TS, MIT) **and** Python `tavily` SDK (used by `worker.py`). | `app/integration/tavily/node_modules/@tavily/core/package.json`; `worker.py:8` |
| Async / streaming | ✓ Promise-based. Deep research supports `stream: true` → `AsyncGenerator<Buffer>` (README L219-227). OneShot's TS adapter wraps this as `tavilyResearchStream` + a poll-loop `tavilyResearch` (`src/index.ts:154-206`). | `@tavily/core` README |
| Error handling | ✓ Structured: `TavilyKeylessLimitError` (`{capType, retryAfter, bonusEligible, continuationPaths}`), `TavilyExtractTimeoutError` (`retryable: false`), `redactTavilyError`, `ResearchNotReady` (poll). OneShot's bridge adds `redactSecret` (strips API key from errors) + a timeout (`TAVILY_TIMEOUT_SECONDS`, default 180s). | `src/index.ts:69-103`; `bridge.ts:36-77` |
| Rate limiting | ✓ Keyless mode has a shared rate-limit cap (`TavilyKeylessLimitError.retryAfter`). With a key, it's credit-based. | README L46-73 |
| Cost per request | **Credit-based (paid).** The SDK README (L289-291) explicitly delegates pricing to `https://docs.tavily.com/guides/api-credits` — the exact per-request credit cost is **not in the SDK**, so I will not fabricate a number. Tavily is not free like raw Google results. | README L289 |
| Extra capabilities | HTTPS proxy (`TAVILY_HTTP_PROXY/HTTPS_PROXY`), session/user tracking (`sessionId`/`humanId`/`clientName` → HTTP headers; `humanId` hashed), feedback API (`agentScore` per-URL for quality improvement). | README L264-285 |

## 2. Strands Agents Tool Interface (verified from installed SDK type defs)

The prompt's template is incorrect. The **real** interface (`node_modules/@strands-agents/sdk/dist/src/tools/tool.d.ts`):

```ts
// REAL Strands Tool abstract base (tool.d.ts:92-144)
export abstract class Tool {
  abstract name: string;
  abstract description: string;
  abstract toolSpec: ToolSpec;            // OpenAPI JSON spec (name+description+inputSchema)
  abstract stream(toolContext: ToolContext): AsyncGenerator<ToolStreamEvent, ToolResultBlock, undefined>;
}
export interface InvokableTool<TInput, TReturn> extends Tool {
  invoke(input: TInput, context?: ToolContext): Promise<TReturn>;  // direct, non-streaming
}
```

The doc itself says: *"Most implementations should use FunctionTool rather than implementing this interface directly"* (`tool.d.ts:90`). So the practical patterns are:

```ts
// Pattern A (recommended): tool() factory with Zod
import { tool } from "@strands-agents/sdk";
import { z } from "zod";
const t = tool({
  name: "tavily_search",
  description: "Search the web via Tavily",
  inputSchema: z.object({ query: z.string(), max_results: z.number().optional() }),
  callback: async (input) => { /* ... */ return result; },   // NOT execute(params)
});

// Pattern B: FunctionTool with JSON Schema (closest to the prompt's template)
import { FunctionTool } from "@strands-agents/sdk";
const t = new FunctionTool({
  name: "tavily_search",
  description: "Search the web via Tavily",
  inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  callback: async (input, ctx) => { /* ... */ return result; },  // NOT execute(params)
});
```

**Correction to the prompt's template**: there is no `schema` field (it's `inputSchema`/`toolSpec`) and no `execute(params)` method (it's `callback(input, ctx)` in the factory/`FunctionTool`, or `stream(toolContext)` on the abstract base).

## 3. Can Tavily map cleanly to a Strands Tool?

**Yes — trivially (~20 lines).** Tavily's TS adapter already exports `tavilySearch`; wrapping it is mechanical. The real question is *whether OneShot should* (Section "Should you?" below).

Exact adapter code (corrected to the real Strands API; server-side only — "No Strands SDK in the browser", `Refactor_plan.md:310`):

```ts
// NEW FILE (server-side only): backend/agents/researcher/strands-tools/tavily-search.ts
import { tool } from "@strands-agents/sdk";
import { z } from "zod";                              // NEW OneShot dependency (Strands peer dep)
import { tavilySearch } from "../../../../app/integration/tavily/src/index.js";
// ^ NOTE: this uses the TS-native @tavily/core adapter, NOT the Python worker the
//   Researcher currently uses. If you want to reuse the live Python path instead,
//   import TavilyPythonRunner from "../tool/tavily/bridge.js" and call .run({op:"search",...}).

export function createTavilySearchTool() {
  return tool({
    name: "tavily_search",
    description:
      "Search the web for current/external evidence. Returns { answer, results[] }." +
      " Use for facts outside the repository. Cite returned URLs as provenance.",
    inputSchema: z.object({
      query: z.string().max(400),
      max_results: z.number().int().min(1).max(20).optional(),
      search_depth: z.enum(["basic", "advanced"]).optional(),
    }),
    callback: async (input) => {
      const apiKey = process.env.TAVILY_API_KEY;
      if (!apiKey) {
        // Strands wraps thrown errors into an error ToolResultBlock automatically (FunctionTool contract)
        throw new Error("TAVILY_API_KEY not configured");
      }
      // Credential invariant preserved: key sent only to api.tavily.com (enforced inside @tavily/core)
      const res = await tavilySearch(input.query, {
        apiKey,
        maxResults: input.max_results ?? 5,
        searchDepth: input.search_depth ?? "advanced",
      });
      // Return a compact, provenance-bearing shape (matches OneShot's TavilyEvidence)
      return {
        answer: res.answer ?? null,
        request_id: res.requestId ?? null,
        results: (res.results ?? []).map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          content: (r.content ?? "").slice(0, 12000),   // honor ONESHOT_TAVILY_MAX_EVIDENCE_BYTES
        })),
      };
    },
  });
}
```

```ts
// Register at runtime (only when Tavily is configured)
import { createTavilySearchTool } from "./strands-tools/tavily-search.js";
function getResearcherTools() {
  return process.env.TAVILY_API_KEY ? [createTavilySearchTool()] : [];
}
const agent = new Agent({ model: new VercelModel({ provider: active.model }), tools: getResearcherTools() });
```

## 4. Output Quality for OneShot Workflows

**What Tavily returns to the Researcher today** (`evidence.ts:81-192`):
`TavilyEvidence[] = { source: string; statement: string; provenance: string }[]` — **identical shape** to `GatheredEvidence` (`collector.ts:6-10`). Three modes:
- `search` → synthesized `answer` + per-result `{title, content}` snippets.
- `search-extract` (default when a key is set) → search + `extract` top-N URLs → `raw_content` (markdown).
- `research-stream` → Tavily deep-research (model `mini`/`pro`/`auto`) → a single cited report.

Each item is clipped to `ONESHOT_TAVILY_MAX_EVIDENCE_BYTES` (default 12000) — a deliberate limit, not accidental loss.

**Can the (nonexistent) "GENERATOR" stage use it directly?** N/A. The real downstream path: `gathered` (incl. Tavily) → `buildResearchBundle` (`structured-draft.ts:65`) → `EvidenceRef[]` (`:105-111`), preserving `source`/`provenance` (e.g. `tavily-search:<requestId>:<url>`).

**Format conversion needed?** **No.** `TavilyEvidence` is already `{source, statement, provenance}` — the canonical evidence shape. `buildResearchBundle` maps it 1:1 to `EvidenceRef`. **No information loss at the boundary**; provenance is preserved (required by OneShot's evidence contracts). The only reduction is the intentional `clip()` to the evidence-byte budget.

---

## Comparison vs Alternatives

| Alternative | What it gives | Why Tavily wins / loses for OneShot |
|---|---|---|
| **Tavily** (current) | search + extract (markdown) + deep-research (cited report) + answer synthesis + provenance + feedback API + keyless trial | **Wins.** Already integrated; returns the exact `{source, statement, provenance}` shape OneShot needs; provenance preserved (contract requirement); 3 modes incl. extract + deep-research; keyless mode for trial. **Loses on** cost (credit-based, not free) and that the live path is a Python worker (extra process), not the TS SDK. |
| **SerpAPI** | structured Google/Bing results, JSON, no synthesis | **Loses.** No content extraction, no answer synthesis, no deep research — you'd build extract yourself. Provenance is just URLs (weaker than Tavily's request-id + URL). Similar paid-credit cost model. No added value over Tavily for OneShot's evidence contract. |
| **Google Custom Search** | cheap JSON metadata + snippets | **Loses.** Snippets only — **no full content extraction**, no synthesis. You'd scrape pages yourself (ToS/`robots.txt` risk, no JS rendering). Violates OneShot's "preserve provenance" cleanly. Cheapest, but lowest quality for a research-evidence pipeline. |
| **Custom web scraper** | full control | **Loses.** You build search + extract + rate-limit + `robots.txt` + JS-rendering + provenance yourself — high maintenance, legal/ToS exposure, no LLM-grade synthesis. Only "wins" on zero per-request cost and full control, at large engineering cost. |

**Bottom line**: Tavily wins for OneShot because OneShot's Researcher contract is *evidence with provenance*, and Tavily is purpose-built for LLM evidence (search + extract + cited research), already returns the canonical shape, and is already integrated. The only real downside is cost (credit-based) — mitigated by the byte budget and `max_results` caps already in `evidence.ts`.

---

## Integration Effort

| Question | Answer |
|---|---|
| Lines of code for the Strands `tool()` adapter | ~25 lines (`tavily-search.ts`) + ~3 lines to register conditionally. |
| Breaking changes to OneShot? | **None, if additive.** BUT: adopting the Strands tool changes the Researcher from **deterministic gather → single model call** to a **model-driven agent loop** (the model decides when/whether to call `tavily_search`). That is an *architecture* change affecting evidence provenance and the `buildResearchBundle` contract — **not** a drop-in. |
| Can it run alongside the current implementation? | **Yes.** The current Python-worker evidence collector (`collector.ts:71`) stays. The Strands tool is a separate, opt-in path (e.g. behind `ONESHOT_RESEARCH_USE_STRANDS=1` + `tools: [...]`). Both produce `GatheredEvidence`; diff for parity. |
| New dependency | `zod` must be added to root `package.json` (Strands peer dep for `tool()`/`structuredOutputSchema`). OneShot doesn't list it today. |

---

## DELIVERABLE

### Tavily ✓ or ✗ for Strands integration

**✅ Tavily is the right tool for OneShot — but NOT as a Strands model-driven tool in the minimum path.**

- **Tavily itself: ✓.** It's already integrated correctly as *deterministic evidence gathering* (the right pattern for OneShot's provenance-bound evidence contract), returns the canonical `{source, statement, provenance}` shape, and offers extract + deep-research modes no alternative matches.
- **As a Strands `tool()` (model-driven): technically ✓ (~25 lines), architecturally ✗ for the minimum.** Wrapping is trivial, but adopting it converts the Researcher from a deterministic single-call into an agent loop where the *model* decides when to search. That changes evidence provenance flow and the `buildResearchBundle` contract — a bigger change than the adapter suggests. Keep it as an opt-in experiment, not a replacement.

### Exact code (Tavily → Strands adapter)

Provided in **Section 3** above — corrected to the **real** Strands API (`tool()` factory + `callback`, not the prompt's `implements Tool { schema; execute() }`), reusing OneShot's existing `@tavily/core` TS adapter, server-side only, credential invariant preserved.

### Benchmark results (quality score 1-10)

**Honest disclosure**: I cannot produce live benchmark numbers. The `TAVILY_API_KEY` is commented out in `app/env/.env.example:35`, I have no key, and I'm in read-only plan mode with no live API egress. Fabricating a "quality score" would violate OneShot's own invariant (AGENTS.md: *"do not fabricate progress, evidence, successful execution, or hash equality"*). So instead of a fabricated number, here is the **methodology + a reasoned qualitative estimate**:

**5-query benchmark methodology** (run once a key is provisioned):
1. Pick 5 representative prompts from `backend/tests/ts/tavily-researcher-evidence.test.ts` + `app/fixtures/research/` (deterministic, replayable).
2. Run each through (a) current Python-worker path and (b) the Strands-`tool()` path, identical model.
3. Score each on: **relevance** (result addresses intent), **accuracy** (claims verifiable from cited URLs), **completeness** (coverage of `research_direction`), **provenance integrity** (every statement has a `source`+`provenance`), **latency**, **credit cost**.
4. Assert parity: both paths produce the same `ResearchBundle` shape (the contract boundary).

**Reasoned qualitative estimate (grounded in the adapter's actual behavior, not a live measurement):**

| Dimension | Score (1-10, estimate) | Rationale |
|---|---|---|
| Relevance | 8 | `search_depth: "advanced"` + `include_answer: "advanced"` + query capped to intent+outcome+direction (`evidence.ts:61-68`) targets results well. |
| Accuracy | 8 (search-extract) / 9 (research-stream) | `extract` returns raw page markdown (verifiable); `research-stream` returns a cited report. Snippet-only `search` is weaker (7). |
| Completeness | 7 | Capped by `max_results` (default 5, max 20) and `ONESHOT_TAVILY_MAX_EVIDENCE_BYTES` (12000) — deliberate budget, not a flaw. |
| Provenance integrity | 9 | Every item carries `source` (URL) + `provenance` (`tavily-search:<reqId>:<url>` etc.) — exactly OneShot's `EvidenceRef` requirement. The strongest dimension. |
| Integration cleanliness | 9 | Returns the exact `{source, statement, provenance}` shape; zero conversion. |
| Cost efficiency | 6 | Credit-based; mitigated by `max_results`/byte caps. Cheaper than building a scraper, pricier than free Google snippets. |

**Weighted overall (estimate): ~8/10 for OneShot's specific evidence-with-provenance contract.** This is a reasoned estimate, not a live measurement — run the 5-query methodology above to convert it to a real score.

### Recommendation

**Use Tavily. Do not switch to SerpAPI/Google Custom Search/a custom scraper.** Tavily is already integrated, already returns OneShot's canonical evidence shape with provenance, and offers extract + deep-research no alternative matches. The only real drawback is credit cost, which OneShot already mitigates via `max_results`/byte caps.

**On the Strands-tool question specifically**: keep Tavily as **deterministic evidence** (current, correct). If you want to *experiment* with model-driven tool calling, the Strands `tool()` adapter in Section 3 is ~25 lines and can run **alongside** the current path behind a flag — but treat it as a separate experiment, because it changes the Researcher from deterministic-gather to an agent loop and shifts *when/whether* Tavily is called from code to the model. That is an architecture decision, not an adapter.

---

## Implementation Strategy (if you proceed with the Strands-tool experiment)

### Step 1 — Test Tavily with the Strands pattern
Create `backend/agents/researcher/strands-tools/tavily-search.ts` (Section 3 code). Add `zod` to root `package.json`.

### Step 2 — Register in a tool registry (conditional)
`getResearcherTools()` returns `[createTavilySearchTool()]` only when `TAVILY_API_KEY` is set (Section 3). No static "register all" step.

### Step 3 — Test in workflow (behind a flag)
```ts
const agent = new Agent({
  model: new VercelModel({ provider: active.model }),   // reuse OneShot's resolved model
  systemPrompt: RESEARCHER_SYSTEM_PROMPT,
  tools: getResearcherTools(),                          // [] by default → single-turn; [tavily] → agent loop
});
const result = await agent.invoke(promptText);
```

### Step 4 — Compare output quality
Diff `ResearchBundle` from (a) current Python-worker path vs (b) Strands-tool path for the 5 benchmark queries. Score relevance/accuracy/completeness/provenance. **Winner moves forward; loser stays as fallback.**

### Decision tree
```
Tavily-as-Strands-tool test
├─ Quality ✓ (≥8/10) + Integration ✓ (~25 lines, additive)
│  └─ PROCEED: offer Strands-tool path behind a flag alongside the deterministic path
├─ Quality ✓ + Integration ✗ (e.g. provenance lost in tool result shape)
│  └─ KEEP current deterministic Tavily; don't adopt the Strands tool
└─ Quality ✗ (worse than deterministic gather) + High cost
   └─ KEEP deterministic Tavily; do NOT adopt the Strands tool
```

### Action items (in order)
1. **Provision a `TAVILY_API_KEY`** (it's commented out in `.env.example:35`) — required for any live test. I cannot run this for you (no key, plan mode).
2. **Add `zod`** to root `package.json` (Strands peer dep); verify `@ai-sdk/provider` hoist (`npm ls @ai-sdk/provider`).
3. Write the Strands adapter (Section 3, ~25 lines, server-side only).
4. Run the 5-query benchmark (Step 4) with the real key; record real scores (replaces my estimate).
5. Decide: Strands-tool ✓ (ship behind flag) or ✗ (keep deterministic).
6. If ✓: integrate behind `ONESHOT_RESEARCH_USE_STRANDS=1`, keep the deterministic path as default/fallback.

---

## Summary of what I did and what you should know

I evaluated Tavily vs the Strands tool pattern by verifying **both sides against the actual installed code**, not the prompt's premises:

1. **Corrected the false premises**: the Researcher does NOT use Tavily as a model tool (it's deterministic evidence gathering via a **Python worker**, `worker.py:8`); there is no "GENERATOR" stage; and the Strands `Tool` interface is **not** `{schema, execute}` (it's an abstract class with `toolSpec`/`stream`, practical path = `tool()` factory / `FunctionTool` with `callback`).
2. **Verified the real Tavily wiring**: `ResearchEvidenceCollector` composes `TavilyEvidenceCollector` (`collector.ts:22`) → `TavilyPythonRunner` → Python `tavily` SDK. Tavily returns `{source, statement, provenance}[]` — **already** OneShot's canonical evidence shape, so `buildResearchBundle` consumes it with **zero conversion and no provenance loss**.
3. **Verified the real `@tavily/core@0.7.11`**: async + streaming (deep research `AsyncGenerator`), structured errors (`TavilyKeylessLimitError` with `retryAfter`), rate limiting (keyless cap + credit-based), proxy + session tracking + feedback API. Cost is credit-based (paid); exact per-request cost is on `docs.tavily.com/guides/api-credits`, not in the SDK — I did not fabricate a number.
4. **Delivered the verdict**: **Tavily ✓** — keep it as deterministic evidence (current, correct). The Strands `tool()` adapter is feasible (~25 lines, real API, code provided) and can run alongside behind a flag, but adopting it changes the Researcher from deterministic-gather to a model-driven agent loop — an architecture decision, not a drop-in. Recommended alternatives (SerpAPI/Google Custom Search/custom scraper) all lose to Tavily on extraction + synthesis + provenance.
5. **Was honest about benchmarks**: I cannot produce a live quality score (no key, plan mode, and fabricating one violates OneShot's "no fabricated evidence" rule). I provided a concrete 5-query methodology + a clearly-labeled reasoned estimate (~8/10 for OneShot's provenance-bound contract), to be replaced by real numbers once a key is provisioned.

**Bottom line**: Keep Tavily. If you want to experiment with model-driven tool calling via Strands, use the Section 3 adapter behind a flag — but the deterministic path is the correct default for OneShot's evidence contract.