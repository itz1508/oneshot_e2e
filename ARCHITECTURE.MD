# OneShot — Architecture Correction (Final)

**Status:** Model settled · boundaries defined · no behavioral code changed yet. **Precedence:** repository behavior &gt; source code &gt; approved requirements &gt; README/docs. `oneshot-audit-and-rewrite-plan.md` and the README are **non-authoritative** until re-derived from the approved implementation.

This document is the reference of record for the corrected workflow model.

---

## Part 1 — The corrected model (authoritative)

Three distinct owners, connected by two boundaries. Each owner does its job and **stops**.

```
Research            owns research          →  ResearchBundle
Design_Planning     owns planning          →  Approved Plan
Implementation RT   owns implementation    →  (separate concern)
```

### 1.1 Main Chat & the `[research]` drawer

The `[research]` control is a **configuration drawer**, not a "start now" button:

```
Normal Chat
   ├── [research] closed ──► normal chat
   └── [research] open
           ├── configure Research Model
           ├── configure external Search
           └── choose whether THIS message uses Research
```

Opening the drawer never starts a workflow. A message only uses Research if the user chooses it for that message.

### 1.2 Research is a governed skill that stops at the handoff boundary

```
ACTIVE → RECONCILING → RESEARCHING → DRAFTING
      → BASELINE_VALIDATING → REVIEW → READY_FOR_PLANNING   ◀── STOP
```

Research **stops** at `READY_FOR_PLANNING`. It does **not** become the Planner, does not build, does **not** modify the repository, and does **not** decide architecture. `READY_FOR_PLANNING` is a **handoff boundary**, not an invitation to continue.

Research may identify gaps and alternatives. It **must not select the final build decision.**

### 1.3 Design_Planning is explicitly invoked (separate control)

Distinct from Chat and Research:

```
Normal Chat
   ├── ordinary request ──► Main Chat
   ├── Research ──────────► Research workflow ──► READY_FOR_PLANNING
   └── Design_Planning ───► Planning workflow
```

Research can be an **input** to Design_Planning (via `ResearchBundle`), but it never **invokes**it. Planning is a deliberate user action.

### 1.4 Design_Planning owns only the planning boundary

```
Undefined → Discovery → Ownership Defined → Planning → Pre-Build Reviewed
                                                 ↓
                                           USER APPROVAL
                                                 ↓
                                          APPROVED PLAN   ◀── STOP
```

**Approval ends the run.** No implementation theater. Design_Planning must not simulate or claim Implementation, Build, Verification, Receipt, Promotion, or Closed.

The downstream sequence —

```
Implementation → Gap Discovery → Gap Resolution → Verification → Receipt → Promotion → Closed
```

— is the **execution lifecycle**, owned by a **separate implementation runtime**, outside Design_Planning. It may consume the Approved Plan later.

### 1.5 Planner contract

Planner **consumes** established inputs and does **not** re-research the world:

```text
Input
├── User Intent
├── Repository State
├── Existing Architecture
├── Existing Phase Receipts
├── Existing Baselines
└── ResearchBundle            (optional)

Planner performs
├── Coverage Review
├── Dependency Review
├── Structure Review
├── Fixture Review
└── Goal Review
        ↓
     Plan / audit artifact
```

Planner answers: *“Given the established intent, repo state, baseline and available research, what should be planned?”* — **not** *“let me research again and decide what the product is.*”Re-researching would recreate the exact overlap we are removing.

### 1.6 Naming rules (keep the boundary simple)

- `ResearchBundle` is now a **user-defined term** — allowed.
- Do **not** invent cousins: ~~ResearchRevision~~, ~~ResearchPackage~~, ~~ResearchArtifact~~, ~~ResearchResult~~, ~~ConfirmedResearchBundle~~, ~~ResearchContext~~.
- Persistence identity: `audit_id` (if that is the established identity).

```
Research → ResearchBundle → Planner → Plan   (+  audit_id)
```

### 1.7 Two state machines — do not conflate them

**Product / workflow state** (the thing the user drives):

```
Chat · Research · Design_Planning · Implementation · Verification · Receipt · Promotion …
```

**Agent execution discipline** (how the build agent works):

```
NEXT TODO → EXECUTE → VERIFY → TEST → EVIDENCE → MARK [x] → NEXT TODO
```

The second is **execution discipline, not product workflow.** It must never cross product ownership boundaries on its own. Example: Research TODOs run until `READY_FOR_PLANNING`, then **stop** — they do **not** auto-execute the Planner. Same for Design_Planning → Approved Plan.

---

## Part 2 — Audit: what the code ACTUALLY does today

> **Evidence note.** The previous revision of this section audited files that do not
> exist in this repository (`server/plugin.ts`, `src/hooks/useChat.ts`,
> `server/research.ts`, `server/search.ts`, `server/designPlanning.ts`,
> `src/lib/pipeline.ts`). It also cited the symbols `researchEnabled`,
> `classifyApplicability`, `PIPELINE_STATES`, `researchContext`,
> `runDesignPlanning`, and `/api/design-planning/gate` — **all of which return zero
> matches in this tree**. The section below is re-derived from the real sources and
> is the only accurate description of current behavior.

### 2.1 Routing (`backend/index.ts`)

`POST /api/agent/stream` (also `/invocations`) resolves provider/model from the
session config or env, then branches on whether live credentials exist:

```
no live credentials ──► streamPythonReasoning()  (local Python subprocess)
live credentials    ──► createMainAgent() → streamStrandsToAgUi()
```

**No research branch and no Design_Planning branch exist on this route.**

The coupling the corrected model forbids is present in a different form — a keyword
router that silently relabels a chat message (`backend/index.ts:1233-1239`):

```ts
const task = /gap|reconcil|diff/i.test(prompt)      ? "gap-analysis"
            : /plan|gate|review|stage/i.test(prompt) ? "planner"
            : /research|search|find|index/i.test(prompt) ? "researcher"
            : "general";
```

This is the same defect as the retired `classifyApplicability()` heuristic, merely
renamed: message text alone decides which lifecycle the run claims to be in. The
selected `task` label is forwarded to the Python reasoner and surfaced to the user.

### 2.2 Client state (`frontend/web/src/lib/useChatSession.ts`)

Holds sessions, provider configs, run status, tool events, and `systemStatusText`.
There is no `researchEnabled` boolean, no pre-seeded pipeline-state array, and no
per-message research choice. `App.tsx` keeps `isResearcherDrawerOpen` purely as a UI
flag — which already satisfies the §1.7 "drawer is not workflow state" requirement.

### 2.3 Research (`packages/agent-runtime/src/research/`)

- `TavilySearchBackend.search()` — one call, no lifecycle, no phases, no `REVIEW`,
  no `READY_FOR_PLANNING`.
- Honest failure: throws when `TAVILY_API_KEY` is absent; the fixture path is opt-in
  via `deterministicFixture` and is explicitly labelled "not live research". ✅
- Exposed as a `tavily_search` tool (`backend/index.ts:769`) and as a standalone
  endpoint `/api/research/query` (`backend/index.ts:804`).
- `backend/research/lifecycle.ts` defines a `ResearchLifecycleManager` with a
  6-value `ResearchPhase` enum, but it is **dead code**: referenced only by
  `backend/tests/ts/research-lifecycle.test.ts`, never imported by
  `backend/index.ts` or the agent runtime.

### 2.4 Workflow engine (`packages/agent-runtime/src/workflow/`)

`OneShotWorkflowEngine` runs one 5-stage chain behind two gates:

```text
research → planning → gap_analysis → evaluation → builder
          Gate 1 (Research Review)      Gate 2 (Build Ready, SHA-256)
```

Planning and implementation are **fused** — `planning` flows straight into
`gap_analysis`/`evaluation`/`builder`, which is exactly the conflation §1.4 requires
be split. This engine is load-bearing: it backs live SSE state, `/api/v2` actions,
and existing tests.

### 2.5 Duplication and contradictions

Three mutually inconsistent stage definitions coexist:

| Source | Stages |
| :--- | :--- |
| `packages/agent-runtime/src/workflow/types.ts:7` | 5: research, planning, gap_analysis, evaluation, builder |
| `frontend/web/src/lib/handoffs.ts:36` | 7: researcher, planner, refactor, gap_analysis, evaluation, builder, review |
| `ARCHITECTURE.MD` (corrected model) | 7 research + 6 planning + 7 execution |

`ResearchBanner.tsx:21` renders **"Research Mode Active"** unconditionally
(`App.tsx:297`). No research mode exists, so the UI asserts a state the backend does
not report — a direct violation of the no-fake-state rule.

---

## Part 3 — Gap analysis (re-derived from the verified Part 2 audit)

| # | Corrected model | Current state | Verdict |
| :-- | :--- | :--- | :--- |
| 1 | Main Chat default, no auto-workflow | `/api/agent/stream` has no research/planning branch | **Met** |
| 2 | `[research]` is a config drawer, not a trigger | `ResearcherDrawer` is a standalone search drawer; `isResearcherDrawerOpen` is UI-only | **Partial** — no model/search/per-message config yet |
| 3 | Research lifecycle → `REVIEW` → `READY_FOR_PLANNING` | `ResearchSkill` runs all 7 phases and stops | **Met** |
| 4 | Search ≠ Research | Drawer is search-only and labelled as search | **Met** |
| 5 | Research stops at the handoff boundary | `ResearchSkill` stops at `READY_FOR_PLANNING`; `researchMayEnterImplementation()` is always false | **Met** |
| 6 | Design_Planning explicitly invoked | `DesignPlanningSkill`; refuses unless `explicitlyInvoked` | **Met** |
| 7 | Design_Planning ends at `APPROVED_PLAN` | `OneShotWorkflowEngine` stops at `planning`; execution stages are refused | **Met** |
| 8 | Planner consumes `ResearchBundle`; no re-research | `DesignPlanningSkill` consumes an optional bundle and records its absence | **Met** |
| 9 | Separate implementation runtime owns execution | `ImplementationRuntime` cannot be constructed without an `ApprovedPlan` | **Met** |
| 10 | Naming: `ResearchBundle` only | `researchContext` does not exist; no cousins present | **Met** |
| 11 | UI mode separate from workflow state | No `researchEnabled` boolean exists | **Met** |
| 12 | No "Gate 1" standing in for the handoff | `Gate 1: Research Review` labels the research→planning edge | **Wrong** — it names the handoff as a generic gate |
| 13 | No fabricated state in the UI | `ResearchBanner` renders real backend phase or "Research not running" | **Met** |
| 14 | No keyword-based workflow diversion | Regex router deleted; task comes from explicit `useResearch`/`useDesignPlanning`/`task` | **Met** |

Retired items from the prior revision (already satisfied, kept for traceability):
global `researchEnabled` driver, 12-state pre-seeding, `classifyApplicability()` under
its old name, `PIPELINE_STATES` duplication, `researchContext` naming, and
README-as-authority are all absent from the current tree.

---

## Part 4 — Corrected code state model

```ts
// ── Product entities ─────────────────────────────────────────────
ChatConfig       { provider, model }                    // Main Agent
ResearcherModel  { provider, model }                    // drawer: Research model
SearchConfig     { enabled: boolean, source }           // drawer: external Search
UseResearch      { forMessage: boolean }                // per-message choice

// ── Research (governed skill) ────────────────────────────────────
ResearchRun {
  phase: "ACTIVE" | "RECONCILING" | "RESEARCHING" | "DRAFTING"
       | "BASELINE_VALIDATING" | "REVIEW" | "READY_FOR_PLANNING",  // STOP
  bundle?: ResearchBundle
}

// ── Design_Planning (explicitly invoked) ─────────────────────────
DesignPlanningRun {
  phase: "UNDEFINED" | "DISCOVERY" | "OWNERSHIP_DEFINED" | "PLANNING"
       | "PRE_BUILD_REVIEWED" | "APPROVED_PLAN",                    // STOP
  auditId?: string,
  approvedPlan?: ApprovedPlan
}

// ── Downstream (separate runtime — NOT owned by Design_Planning) ──
// ImplementationRun { phase: "IMPLEMENTATION" | "GAP_DISCOVERY" | "GAP_RESOLUTION"
//                          | "VERIFICATION" | "RECEIPT" | "PROMOTION" | "CLOSED" }

drawerOpen: boolean   // UI ONLY — no workflow meaning
```

**Invariants:** `drawerOpen` ≠ Research running · Research running ≠ Design_Planning active · Design_Planning active ≠ implementation · **only** `READY_FOR_PLANNING` **hands Research to Planning, and only a user approval ends Planning.**

---

## Part 5 — Remove / mark stale

- [x] Global `researchEnabled` as a workflow driver.

- [x] Pre-seeding every message with all 12 `PIPELINE_STATES`.

- [x] `classifyApplicability()` auto-diverting chat into a lifecycle.

- [x] Research → Design_Planning coupling in `plugin.ts`.

- [x] Design_Planning running Implementation→Closed (theater) → end at APPROVED PLAN.

- [x] `researchContext` → rename to `ResearchBundle`; delete cousin names.

- [x] Duplicate `PIPELINE_STATES`.

- [x] The generic single gate standing in for "Gate 1".

- [x] README + `oneshot-audit-and-rewrite-plan.md` as authority.

---

## Part 6 — Implementation phases

1. **State model** (non-visual): add `ChatConfig`, `ResearcherModel`, `SearchConfig`, `UseResearch`, `ResearchRun`, `DesignPlanningRun`; retire the single boolean; rename `researchContext` → `ResearchBundle`.
2. **Decouple** (non-visual): cut Research→Design_Planning in `plugin.ts`; Research ends at `READY_FOR_PLANNING`; Design_Planning becomes explicitly invoked; end it at `APPROVED_PLAN`.
3. **Research skill**: implement phases `ACTIVE→…→REVIEW→READY_FOR_PLANNING` producing a `ResearchBundle` (composes Research model + optional Search).
4. **Planner contract**: consume `ResearchBundle` (optional) + repo state + baselines; run the five reviews; emit plan/`audit_id`; **no** re-research.
5. **UI**: `[research]` drawer configuring model + search + per-message use; separate Design_Planning control; state panels show workflow state only.
6. **Implementation runtime**: separate execution path consuming `Approved Plan`.

---

## Part 7 — Open seams

- Exact `ResearchBundle` ⇄ Planner field contract.
- Where `audit_id` is minted and persisted.
- `Search` adapter set + credential/offline honesty (already partly present).
- The separate implementation runtime's interface (deliberately out of scope for now).
