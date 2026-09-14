# Plan Part 1 — Researcher → Planner → Builder Workflow Reference Mapping

> **Scope:** Researcher, Planner, Builder, and the actual workflow connecting them only.
> **Authority:** OneShot owns the workflow. Strands/Tavily provide capabilities used through a thin integration boundary.
> **Rule:** Actual workflow → actual source → external reference pattern → required change → smallest implementation.

---

## 0. Workflow Summary (Actual Current State)

The implemented OneShot workflow for the three target stages is:

```
Prompt_id
→ Research requested?
   ├─ NO  → Planner (ResearchBundle optional)
   └─ YES → Researcher → ResearchBundle → STOP: Research Review (Human Gate #1)
             → confirm-plan → Planner → Audit → Refactor → ... → Build Ready (Human Gate #2)
             → Builder → SandboxService → BuilderWorkflowResult
```

**Key files:**

| Concern | Actual File |
|---|---|
| Researcher agent identity | `backend/agents/researcher/agent.ts` |
| Researcher workflow | `backend/agents/researcher/workflow.ts` |
| Researcher structured draft to bundle | `backend/agents/researcher/structured-draft.ts` |
| Researcher evidence collector | `backend/agents/researcher/tool/evidence/collector.ts` |
| Tavily bridge (Python spawn) | `backend/agents/researcher/tool/tavily/bridge.ts` |
| Tavily evidence collector | `backend/agents/researcher/tool/tavily/evidence.ts` |
| Tavily Python worker | `backend/agents/researcher/tool/tavily/worker.py` |
| Researcher tool registry | `backend/agents/researcher/tool/registry.ts` |
| Planner agent identity | `backend/agents/planner/agent.ts` |
| Planner workflow | `backend/agents/planner/workflow.ts` |
| Planner coverage/audit tool | `backend/agents/planner/tool/coverage.ts` |
| Builder agent identity | `backend/agents/builder/agent.ts` |
| Builder workflow | `backend/agents/builder/workflow.ts` |
| Builder skill loader | `backend/agents/builder/skill-loader.ts` |
| Canonical transition state machine | `backend/workflow/canonical-transition.ts` |
| Workflow graph (DAG) | `backend/workflow/graph.json` |
| Pipeline stage processors | `backend/pipeline/processors.ts` |
| Confirm-plan human gate | `backend/pipeline/confirm-plan.ts` |

> **Scope:** Researcher, Planner, Builder, and the actual workflow connecting them only.
> **Authority:** OneShot owns the workflow. Strands/Tavily provide capabilities used through a thin integration boundary.
> **Rule:** Actual workflow → actual source → external reference pattern → required change → smallest implementation.

---

## 0. Workflow Summary (Actual Current State)

The implemented OneShot workflow for the three target stages is:

```
Prompt_id
→ Research requested?
   ├─ NO  → Planner (ResearchBundle optional)
   └─ YES → Researcher → ResearchBundle → STOP: Research Review (Human Gate #1)
             → confirm-plan → Planner → Audit → Refactor → ... → Build Ready (Human Gate #2)
             → Builder → SandboxService → BuilderWorkflowResult
```

**Key files:**

| Concern | Actual File |
|---|---|
| Researcher agent identity | `backend/agents/researcher/agent.ts` |
| Researcher workflow | `backend/agents/researcher/workflow.ts` |
| Researcher structured draft → bundle | `backend/agents/researcher/structured-draft.ts` |
| Researcher evidence collector | `backend/agents/researcher/tool/evidence/collector.ts` |
| Tavily bridge (Python spawn) | `backend/agents/researcher/tool/tavily/bridge.ts` |
| Tavily evidence collector | `backend/agents/researcher/tool/tavily/evidence.ts` |
| Tavily Python worker | `backend/agents/researcher/tool/tavily/worker.py` |
| Researcher tool registry | `backend/agents/researcher/tool/registry.ts` |
| Planner agent identity | `backend/agents/planner/agent.ts` |
| Planner workflow | `backend/agents/planner/workflow.ts` |
| Planner coverage/audit tool | `backend/agents/planner/tool/coverage.ts` |
| Builder agent identity | `backend/agents/builder/agent.ts` |
| Builder workflow | `backend/agents/builder/workflow.ts` |
| Builder skill loader | `backend/agents/builder/skill-loader.ts` |
| Canonical transition state machine | `backend/workflow/canonical-transition.ts` |
| Workflow graph (DAG) | `backend/workflow/graph.json` |
| Pipeline stage processors | `backend/pipeline/processors.ts` |
| Confirm-plan human gate | `backend/pipeline/confirm-plan.ts` |

---

## 1. Researcher Stage

### 1.1 ORIGINAL PLAN

The Researcher was conceived as a stage that consumes `Prompt_id` and produces a `ResearchBundle` (Researcher(id), plan_id, schema_id, fixture_id, goal_id, validation_id, evidence, success criteria, success meaning). It was intended to leverage external search/research capabilities for evidence acquisition.

### 1.2 ACTUAL CURRENT WORKFLOW

**File:** `backend/agents/researcher/workflow.ts` — `ResearcherWorkflow.run(prompt, runId)`

1. Validates prompt against `urn:oneshot:schema:prompt:2`.
2. Calls `ResearchEvidenceCollector.collect(prompt)` which gathers:
   - Prompt-derived evidence (intent, requested outcome, context)
   - Configured file evidence (from `ONESHOT_RESEARCH_EVIDENCE_FILES`)
   - **Tavily web evidence** (when `TAVILY_API_KEY` is present) — optional by default
3. Produces a `StructuredResearchDraft` via one of:
   - Case A: Test draft file override (`ONESHOT_RESEARCH_TEST_DRAFT_FILE`)
   - Case B: Custom capability object with `.draft` function
   - Case C: Explicit draft generator function
   - Case D: AI SDK model (direct, from active integration via `resolveActiveIntegrationModel`)
   - Case E: ROOT_CAUSE error if no capability available
4. Calls `buildResearchBundle()` to construct the canonical `ResearchBundle`.
5. Validates bundle sub-artifacts against canonical schemas.

**Tavily integration (actual):**
- `TavilyPythonRunner` spawns `worker.py` as a child process, passing JSON via stdin, reading `{ok, result}` envelope from stdout.
- `TavilyEvidenceCollector.collect(prompt)` runs search → extract (default `search-extract` mode) or `research-stream` mode.
- `worker.py` uses `tavily.TavilyClient` for `client.search()`, `client.extract()`, `client.research()`.

**Key authority constraints (from §0A.2):**
- Tavily is a `SearchIntegration`, NOT the Researcher itself.
- Integration ≠ Researcher, Integration ≠ Planner, Integration ≠ Builder.
- Do not introduce `ProviderManager`, `ResearchProvider`, `provider.research()`.

### 1.3 REFERENCE PATTERN — Tavily

**Reference:** [Tavily Agent Toolkit Overview](https://docs.tavily.com/examples/agent-toolkit/overview) — official toolkit and research primitives.
**Reference:** [Tavily Tools Reference](https://docs.tavily.com/examples/agent-toolkit/tools) — exact tool APIs.
**Reference:** [Tavily Chatbot Research Pattern](https://docs.tavily.com/examples/agent-toolkit/chatbot) — quick/deep research routing.

**Pattern relied upon — Quick/Deep Research Routing (from Chatbot example):**

The official Tavily chatbot routes between lightweight search and deep research based on query complexity:

> *"search_and_format — For simple questions... stream_research — For complex questions... You can call search_and_format multiple times. You can only use stream_research ONCE."*

This maps directly to OneShot's existing `ONESHOT_TAVILY_MODE` routing:
- `search` mode → lightweight Tavily Search only (analogous to `search_and_format`)
- `search-extract` mode → Search then Extract top URLs (analogous to `search_and_format` + `extract_and_summarize`)
- `research-stream` mode → deep multi-source investigation (analogous to `stream_research`)

**Pattern relied upon — Tool Composition (from Company Intelligence example):**


**Exact reference code (Tavily Tools Reference — search_and_answer):**

```python
from tavily_agent_toolkit import search_and_answer, ModelConfig, ModelObject

result = await search_and_answer(
    query="What are the pros and cons of Rust vs Go?",
    api_key="tvly-xxx",
    model_config=ModelConfig(model=ModelObject(model="anthropic:claude-sonnet-4-5")),
    max_number_of_subqueries=3,
)
print(result["answer"])
```

**OneShot mapping:** OneShot does NOT use the `tavily-agent-toolkit` Python package. Instead, it uses the raw `tavily` Python SDK (`tavily.TavilyClient`) via a child-process worker. This is intentional: OneShot owns the evidence consolidation and canonical validation, while Tavily provides raw search/extract/research primitives. The `worker.py` pattern of spawning a Python subprocess with stdin/stdout JSON envelopes is OneShot's existing integration boundary — it keeps the Node-side workflow in control and the Python SDK isolated.

**Exact reference code (Tavily Tools Reference — extract_and_summarize):**

```python
from tavily_agent_toolkit import extract_and_summarize, ModelConfig, ModelObject


### 1.5 FINAL PLAN — Researcher

| Workflow Step | Actual File/Function | Current Behavior | External Reference | Pattern Used | Required Change |
|---|---|---|---|---|---|
| Researcher identity | `backend/agents/researcher/agent.ts` | Declares `ResearcherAgent` with owned artifacts | — | — | No change |
| Evidence collection | `tool/evidence/collector.ts::collect()` | Gathers prompt + file + Tavily evidence | [Tavily Overview](https://docs.tavily.com/examples/agent-toolkit/overview) | Optional search integration | No change; document boundary |
| Tavily search | `tool/tavily/worker.py::_search()` | `client.search(query, include_answer, search_depth, max_results)` | [Tavily Tools](https://docs.tavily.com/examples/agent-toolkit/tools) | Raw SDK search primitive | No change |
| Tavily extract | `tool/tavily/worker.py::_extract()` | `client.extract(urls, ...)` | [Tavily Tools](https://docs.tavily.com/examples/agent-toolkit/tools) | Raw SDK extract primitive | No change |
| Tavily research stream | `tool/tavily/worker.py::_research_stream()` | `client.research(input, model, stream=True)` | [Tavily Chatbot](https://docs.tavily.com/examples/agent-toolkit/chatbot) | Deep research routing | No change |
| Tavily evidence consolidation | `tool/tavily/evidence.ts::collect()` | search-extract or research-stream mode | [Tavily Company Intelligence](https://docs.tavily.com/examples/agent-toolkit/company-intelligence) | search→extract→consolidate | No change |
| Structured draft | `workflow.ts` Cases A–E | Test file / capability / AI SDK model | — | — | No change |

---

## 2. Planner Stage

### 2.1 ORIGINAL PLAN

The Planner was conceived as a stage that consumes the accepted `ResearchBundle` and produces an `Audit` record. It was intended to review the plan across multiple coverage areas and emit findings that Refactor consumes.

### 2.2 ACTUAL CURRENT WORKFLOW

**File:** `backend/agents/planner/workflow.ts` — `PlannerWorkflow.run(bundle, runId)`

1. Constructs an `Audit` object with:
   - `audit_id`: `id("audit", runId)`
   - `researcher_id`: from bundle
   - `plan_id`: from bundle
   - `reviewed_areas`: `[...PLANNER_REVIEW_AREAS]` (11 areas)
   - `findings`: `plannerFindings(bundle)` — deterministic audit
2. Validates against `urn:oneshot:schema:audit:2`.
3. Returns `Audit`.

**File:** `backend/agents/planner/tool/coverage.ts` — `plannerFindings(b)`


### 2.3 REFERENCE PATTERN — Strands

**Reference:** [Strands Agents Workflows](https://strandsagents.com/docs/examples/python/agents_workflows/) — official multi-agent workflow pattern.
**Reference:** [Strands File Operations](https://strandsagents.com/docs/examples/python/file_operations/) — Agent + tool wiring.
**Reference:** [Strands Memory Agent](https://strandsagents.com/docs/examples/python/memory_agent/) — persistent context pattern.

**Pattern relied upon — Sequential Agent Workflow (from Agents Workflows example):**

The official Strands pattern defines a `Workflow` class that orchestrates agents in sequence:

```python
class ResearchWorkflow(Workflow):
    @workflow_step
    def research_step(self, context: WorkflowContext):
        researcher_agent = Agent(
            system_prompt="You are a Researcher Agent...",
            callback_handler=None,
            tools=[http_request]
        )
        result = researcher_agent(user_query)
        context["research_result"] = result
        return result

    @workflow_step
    def analysis_step(self, context: WorkflowContext):
        analyst_agent = Agent(
            system_prompt="You are an Analyst Agent...",
            callback_handler=None,
        )
        result = analyst_agent(context["research_result"])
        context["analysis_result"] = result
        return result
```

**OneShot mapping:** OneShot does NOT use the Strands `Workflow` class or `@workflow_step` decorator. OneShot's workflow is owned by `backend/workflow/canonical-transition.ts` (a state machine) and `backend/pipeline/processors.ts` (stage execution). The Planner is a deterministic audit function, not an LLM-driven agent. OneShot's `PlannerWorkflow.run()` is the equivalent of a Strands `@workflow_step`, but it is invoked by OneShot's own pipeline, not by the Strands workflow engine.

**Why OneShot does not adopt the Strands Workflow class:** OneShot's canonical workflow has fixed stage order, artifact ownership, human gates, and deterministic validation rules that are enforced by `canonical-transition.ts` and `BuildReviewService`. The Strands `Workflow` class is a general-purpose orchestrator that does not enforce OneShot's specific authority constraints (Research Review gate, hash/package-bound Build Ready gate, canonical schema validation). OneShot owns the workflow; Strands provides agent/tool capabilities.

**Pattern relied upon — Agent Tool Wiring (from File Operations example):**

The official Strands pattern wires tools to agents via the `tools` parameter:

```python
from strands import Agent
from strands_tools import file_read, file_write, editor

file_agent = Agent(
    system_prompt=FILE_SYSTEM_PROMPT,
    tools=[file_read, file_write, editor],
)
```

### 2.4 REQUIRED CHANGE

**None.** The Planner is correctly implemented as a deterministic audit stage. It does not need Strands agent/workflow primitives because:
1. Its logic is fully deterministic (coverage analysis).
2. It is invoked by OneShot's pipeline, not by an external orchestrator.
3. It produces a canonical `Audit` that is validated against schema.

### 2.5 FINAL PLAN — Planner

| Workflow Step | Actual File/Function | Current Behavior | External Reference | Pattern Used | Required Change |
|---|---|---|---|---|---|
| Planner identity | `backend/agents/planner/agent.ts` | Declares `PlannerAgent` with owned `audit_id` | — | — | No change |
| Planner execution | `workflow.ts::run()` | Constructs `Audit` with findings, validates | [Strands Workflows](https://strandsagents.com/docs/examples/python/agents_workflows/) | Sequential step (OneShot-owned) | No change |
| Coverage analysis | `tool/coverage.ts::plannerFindings()` | Deterministic 11-area audit | [Strands File Ops](https://strandsagents.com/docs/examples/python/file_operations/) | Tool wiring (direct call) | No change |

---

## 3. Builder Stage

### 3.1 ORIGINAL PLAN

The Builder was conceived as a stage that executes the confirmed immutable package in an isolated Sandbox only after Human Gate #2 (Build Ready / Confirm Build), then reports build execution evidence.

### 3.2 ACTUAL CURRENT WORKFLOW

**File:** `backend/agents/builder/workflow.ts` — `BuilderWorkflow.run(confirmedPackage, hash)`


---

## 4. Workflow Connecting Researcher → Planner → Builder

### 4.1 ORIGINAL PLAN

The three stages were intended to be connected by a canonical workflow with fixed stage order, artifact ownership, and human gates.

### 4.2 ACTUAL CURRENT WORKFLOW

**File:** `backend/workflow/canonical-transition.ts` — `resolveTransition(stage, outcome, iteration)`

State machine:
```
researcher → wait-human        (Research Review gate)
planner    → next → refactor
...
hash       → wait-build        (Build Ready gate)
build      → next → finalize
finalize   → done
```

**File:** `backend/pipeline/processors.ts` — stage execution functions

### 4.3 REFERENCE PATTERN — Strands

**Reference:** [Strands Agents Workflows](https://strandsagents.com/docs/examples/python/agents_workflows/) — sequential agent workflow.

**Pattern relied upon — Workflow Orchestration (from Agents Workflows example):**

The official Strands pattern uses a `Workflow` class with `@workflow_step` methods that pass context between steps:

```python
class ResearchWorkflow(Workflow):
    @workflow_step
    def research_step(self, context: WorkflowContext):
        # ... produce research_result

---

## 5. Final Review Table

| Workflow | Actual Source | External Reference | Pattern Used | Change | NEW/MODIFIED |
|---|---|---|---|---|---|
| Researcher identity | `backend/agents/researcher/agent.ts` | — | — | None | — |
| Researcher evidence collection | `backend/agents/researcher/tool/evidence/collector.ts` | [Tavily Overview](https://docs.tavily.com/examples/agent-toolkit/overview) | Optional SearchIntegration | None | — |
| Tavily search primitive | `backend/agents/researcher/tool/tavily/worker.py` | [Tavily Tools](https://docs.tavily.com/examples/agent-toolkit/tools) | `client.search()` raw SDK | None | — |
| Tavily extract primitive | `backend/agents/researcher/tool/tavily/worker.py` | [Tavily Tools](https://docs.tavily.com/examples/agent-toolkit/tools) | `client.extract()` raw SDK | None | — |
| Tavily research stream | `backend/agents/researcher/tool/tavily/worker.py` | [Tavily Chatbot](https://docs.tavily.com/examples/agent-toolkit/chatbot) | `client.research()` deep research | None | — |
| Tavily evidence consolidation | `backend/agents/researcher/tool/tavily/evidence.ts` | [Tavily Company Intelligence](https://docs.tavily.com/examples/agent-toolkit/company-intelligence) | search-extract composition | None | — |
| Researcher structured draft | `backend/agents/researcher/workflow.ts` | — | — | None | — |
| Researcher bundle construction | `backend/agents/researcher/structured-draft.ts` | — | — | None | — |
| Planner identity | `backend/agents/planner/agent.ts` | — | — | None | — |
| Planner execution | `backend/agents/planner/workflow.ts` | [Strands Workflows](https://strandsagents.com/docs/examples/python/agents_workflows/) | Sequential step (OneShot-owned) | None | — |
| Planner coverage analysis | `backend/agents/planner/tool/coverage.ts` | [Strands File Ops](https://strandsagents.com/docs/examples/python/file_operations/) | Direct tool call | None | — |
| Builder identity | `backend/agents/builder/agent.ts` | — | — | None | — |
| Builder execution | `backend/agents/builder/workflow.ts` | [Strands MCP](https://strandsagents.com/docs/user-guide/concepts/tools/mcp-tools/) | Direct subsystem call | None | — |
| Builder skill loading | `backend/agents/builder/skill-loader.ts` | — | — | None | — |
| Transition state machine | `backend/workflow/canonical-transition.ts` | [Strands Workflows](https://strandsagents.com/docs/examples/python/agents_workflows/) | Sequential workflow (OneShot-owned) | None | — |

---

## 6. Scope Verification

**Q: Does this directly belong to Researcher, Planner, Builder, or the actual workflow connecting them?**

Every row in the final review table traces to one of:
- `backend/agents/researcher/**` (Researcher)
- `backend/agents/planner/**` (Planner)
- `backend/agents/builder/**` (Builder)
- `backend/workflow/canonical-transition.ts`, `backend/workflow/graph.json` (workflow)
- `backend/pipeline/processors.ts`, `backend/pipeline/confirm-plan.ts` (workflow execution)

**Q: What exact Strands/Tavily reference establishes this implementation pattern?**

Every external reference in the table links to an official Strands or Tavily documentation URL. The patterns relied upon are:
1. **Tavily quick/deep research routing** (Chatbot example) → maps to `ONESHOT_TAVILY_MODE` routing.
2. **Tavily tool composition** (Company Intelligence example) → maps to `search-extract` mode.
3. **Strands sequential workflow** (Agents Workflows example) → OneShot owns its own equivalent via `canonical-transition.ts`.
4. **Strands agent tool wiring** (File Operations example) → OneShot uses direct deterministic calls.
5. **Strands MCP tools** (MCP Tools docs) → OneShot uses direct `SandboxService` calls instead.

**No new files or components are proposed.** The existing implementation already correctly maps to the reference patterns. OneShot owns the workflow; Tavily provides search/extract/research primitives through a thin integration boundary; Strands patterns are referenced for alignment but not adopted as orchestration primitives because OneShot's authority constraints (human gates, canonical validation, artifact ownership) are enforced by its own workflow layer.
| Researcher stage execution | `backend/pipeline/processors.ts::runResearcherStage()` | — | — | None | — |
| Planner stage execution | `backend/pipeline/processors.ts::runPlannerStage()` | — | — | None | — |
| Builder stage execution | `backend/pipeline/processors.ts::runBuildStage()` | — | — | None | — |
| Research Review gate | `backend/pipeline/confirm-plan.ts` | — | — | None | — |
| Workflow graph | `backend/workflow/graph.json` | — | — | None | — |
        context["research_result"] = result
        return result

    @workflow_step
    def analysis_step(self, context: WorkflowContext):
        # ... consume research_result
        result = analyst_agent(context["research_result"])
        return result
```

**OneShot mapping:** OneShot does NOT use the Strands `Workflow` class. OneShot's workflow is owned by:
1. `canonical-transition.ts` — the state machine that determines the next stage.
2. `processors.ts` — the actual stage execution functions.
3. `confirm-plan.ts` — the human gate implementation.
4. `graph.json` — the DAG definition.

This is intentional. OneShot's workflow has authority constraints that the Strands `Workflow` class does not enforce:
- **Research Review gate** (`wait-human` after researcher) — Planner must not start before explicit acceptance.
- **Build Ready gate** (`wait-build` after hash) — Builder must not start before hash- and package-bound Confirm Build.
- **Canonical schema validation** — every artifact is validated against `urn:oneshot:schema:*`.
- **Artifact ownership** — each artifact has a defined owner and consumer list.

The Strands `Workflow` class is a general-purpose orchestrator. OneShot's `canonical-transition.ts` is a domain-specific state machine that enforces OneShot's authority rules. OneShot owns the workflow.

### 4.4 REQUIRED CHANGE

**None.** The workflow connecting Researcher → Planner → Builder is correctly implemented and does not need Strands workflow primitives.

### 4.5 FINAL PLAN — Workflow Connection

| Workflow Step | Actual File/Function | Current Behavior | External Reference | Pattern Used | Required Change |
|---|---|---|---|---|---|
| Transition state machine | `workflow/canonical-transition.ts::resolveTransition()` | Determines next stage from current stage + outcome | [Strands Workflows](https://strandsagents.com/docs/examples/python/agents_workflows/) | Sequential workflow (OneShot-owned) | No change |
| Researcher stage execution | `pipeline/processors.ts::runResearcherStage()` | Runs `ResearcherWorkflow`, saves bundle | — | — | No change |
| Planner stage execution | `pipeline/processors.ts::runPlannerStage()` | Runs `PlannerWorkflow`, saves audit | — | — | No change |
| Builder stage execution | `pipeline/processors.ts::runBuildStage()` | Gate check + `services.builder.run()` | — | — | No change |
| Research Review gate | `pipeline/confirm-plan.ts::confirmPlan()` | Atomic Redis confirmation, queues planner | — | — | No change |
| Workflow graph | `workflow/graph.json` | DAG of nodes, edges, ownership | — | — | No change |

- `runResearcherStage()` — instantiates `ResearcherWorkflow`, runs with prompt, saves `research_bundle` artifact.
- `runPlannerStage()` — instantiates `PlannerWorkflow`, runs with bundle, saves `audit` artifact.
- `runBuildStage()` — loads confirmed package + hash proof, calls `BuildReviewService.requireApproved()`, verifies hash, calls `services.builder.run()`.

**File:** `backend/pipeline/confirm-plan.ts` — Human Gate #1 implementation

- Verifies researcher completion via durable stage marker.
- Applies plan review edits if supplied.
- Uses Redis `SET NX` for atomic confirmation.
- Queues planner job in BullMQ.

**File:** `backend/workflow/graph.json` — DAG of nodes, edges, artifact ownership, parallel groups.
1. Calls `this.sandbox.execute({confirmed_package, hash})` — delegates to `SandboxService`.
2. Finds the plan step with `responsibility === "BuilderOutput"`.
3. If execution passed, hash matched, and the step exited 0:
   - Decodes the step description from `ONESHOT_BUILDER_OUTPUT_BASE64:` prefix.
   - Validates round-trip base64 encoding.
   - Returns `final_output` + `output_step_id`.
4. Returns `BuilderWorkflowResult` (SandboxExecutionResult + final_output + output_step_id).

**Key authority constraints:**
- Builder runs ONLY after explicit, hash- and package-bound Confirm Build.
- `BuildReviewService.requireApproved()` enforces the gate.
- Builder executes already-confirmed immutable work. It does not own Intent, Research, Planning, Refinement, Gap Analysis, Evaluation, Triple Validation, Confirmation, or Hash creation.

### 3.3 REFERENCE PATTERN — Strands

**Reference:** [Strands MCP Tools](https://strandsagents.com/docs/user-guide/concepts/tools/mcp-tools/) — MCP tool integration pattern.

**Pattern relied upon — MCP Tool Integration (from MCP Tools docs):**

The official Strands pattern integrates external tools via MCPClient:

```python
from mcp import stdio_client, StdioServerParameters
from strands import Agent
from strands.tools.mcp import MCPClient

client = MCPClient(
    lambda: stdio_client(
        StdioServerParameters(command="python", args=["/path/to/server.py"])
    ),
)

with client:
    agent = Agent(tools=client.list_tools_sync())
    agent("Run the long-running task")
```

**OneShot mapping:** OneShot's Builder does NOT use MCP tools. The Builder delegates to `SandboxService.execute()` which is OneShot's own governed sandbox execution service. The sandbox is not an external MCP server — it is a core OneShot subsystem (`backend/sandbox/`) that enforces isolation, hash verification, and execution evidence collection. OneShot owns the sandbox boundary; it does not need to expose it via MCP.

**Why OneShot does not adopt MCP for Builder:** The SandboxService is already a well-defined OneShot subsystem with its own contracts (`backend/sandbox/types.ts`). Exposing it via MCP would add an unnecessary integration layer and would violate the §0A.2 boundary (Integration ≠ Builder). The Builder's `skill-loader.ts` already uses OneShot's own `SkillLoader` to load builder-specific skills.

### 3.4 REQUIRED CHANGE

**None.** The Builder correctly delegates to `SandboxService` and does not need Strands MCP tool integration.

### 3.5 FINAL PLAN — Builder

| Workflow Step | Actual File/Function | Current Behavior | External Reference | Pattern Used | Required Change |
|---|---|---|---|---|---|
| Builder identity | `backend/agents/builder/agent.ts` | Declares `BuilderAgent` with owned artifacts | — | — | No change |
| Builder execution | `workflow.ts::run()` | Delegates to `SandboxService.execute()` | [Strands MCP](https://strandsagents.com/docs/user-guide/concepts/tools/mcp-tools/) | Direct subsystem call (not MCP) | No change |
| Output recovery | `workflow.ts` | Decodes `ONESHOT_BUILDER_OUTPUT_BASE64:` step | — | — | No change |
| Skill loading | `skill-loader.ts` | Creates `SkillLoader` for builder skills | — | — | No change |
| Canonical validation | `workflow.ts` | Validates `urn:oneshot:schema:audit:2` | — | — | No change |

**OneShot mapping:** OneShot's Planner uses a deterministic tool (`plannerFindings` in `tool/coverage.ts`) that is called directly, not via an agent tool registry. The Planner does not need LLM reasoning — it performs deterministic coverage analysis. This is intentional: the Planner's output must be reproducible and auditable, not model-dependent.
Deterministic audit across 11 review areas:
- evidence sufficiency, file/subject coverage, requirement coverage, dependency coverage, goal clarity, success criteria, fixture usability, schema applicability, validation traceability, plan structure, unresolved findings.

Each finding has: `finding_id`, `area`, `finding`, `affected_plan_refs`, `evidence_ids`, `required_refinement`.

**Key authority constraint:** The Planner audits and reports; it does not edit the plan directly. Refinement is owned by Refactor.
| Bundle construction | `structured-draft.ts::buildResearchBundle()` | Canonical ResearchBundle from draft | — | — | No change |
| Canonical validation | `workflow.ts` checks loop | Validates against `urn:oneshot:schema:*` | — | — | No change |
result = await extract_and_summarize(
    urls=["https://en.wikipedia.org/wiki/Artificial_intelligence"],
    model_config=ModelConfig(model=ModelObject(model="groq:llama-3.3-70b-versatile")),
    query="What are the main ethical concerns with AI?",
    api_key="tvly-xxx",
    chunks_per_source=5,
)
print(result["results"][0]["summary"])
```

**OneShot mapping:** OneShot's `worker.py` `_extract()` calls `client.extract(**kwargs)` directly, which is the underlying SDK call that `extract_and_summarize` wraps. OneShot performs its own evidence clipping (`clip()` in `evidence.ts`) and canonical validation rather than relying on the toolkit's LLM summarization, because OneShot's `ResearchBundle` has a fixed canonical schema that must be validated deterministically.

### 1.4 REQUIRED CHANGE

**None to the workflow authority.** The Researcher workflow already correctly:
- Owns the `ResearchBundle` construction and canonical validation.
- Treats Tavily as an optional `SearchIntegration` capability.
- Keeps Tavily evidence acquisition in a separate module (`tool/tavily/`).
- Falls back to ROOT_CAUSE error when no model capability is available.

**The plan preserves the existing architecture.** The only refinement is to make the Tavily integration boundary explicit and documented per the §0A.2 authority rule.
The official pattern composes crawl → extract → search → synthesis:

> *"Crawl the company website to discover and summarize pages. Extract detailed content from specific URLs found during crawling. Search the web for external information. Synthesize everything into a structured report with citations."*

OneShot's `search-extract` mode follows this same composition: Search → Extract top-ranked URLs → consolidate evidence.
**Reference:** [Tavily Company Intelligence Pattern](https://docs.tavily.com/examples/agent-toolkit/company-intelligence) — crawl → extract → search → synthesis.