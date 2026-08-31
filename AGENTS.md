# AGENTS.md — OneShot Production E2E Master Operational Manual & Comprehensive File Registry

Welcome to the **OneShot Production E2E (v1.3.0)** repository. This document is the definitive, fully indexed operational manual, architectural authority, tool catalog, script execution runbook, and exhaustive file map for AI agents operating within this repository.

---

## 1. System Overview & Technology Stack

OneShot is an enterprise-grade deterministic AI execution platform combining strict Draft 2020-12 schema validation, multi-turn conversational intent collection, verifiable multi-provider AI research (Google ADK & Featherless), multi-stage planning, refactoring, triple validation (Schema, Fixture, Goal), RFC 8785 canonicalization, cryptographic SHA-256 hashing, isolated process/container sandbox execution, and a standalone Workspace API control plane.

```text
+---------------------------------------------------------------------------------------------------------+
|                                     CANONICAL WORKFLOW PIPELINE                                         |
|                                                                                                         |
|  Chat/Intent ──> Prompt ──> Researcher ──> Planner ──> Refactor ──> Gap Analysis ──> Evaluation        |
|                                                                                              │          |
|  Sandbox Execution <── DONE <── HASH <── CREATE HASH <── CONFIRMED <── Triple Validation <───┘          |
+---------------------------------------------------------------------------------------------------------+
                                                     │
           +-----------------------------------------+-----------------------------------------+
           │                                         │                                         │
           v                                         v                                         v
+-----------------------------+           +-----------------------------+           +-----------------------------+
|       PIPELINE ROLES        |           |      SUBSYSTEM DOMAINS      |           |       REUSABLE SKILLS       |
|   (backend/role/<role>/)    |           |     (backend/<domain>/)     |           |     (skill/ & backend/)     |
+-----------------------------+           +-----------------------------+           +-----------------------------+
| • Researcher (SOP)          |           | • Intent Store & Turns      |           | • oneshot-canonical-contract|
| • Planner (SOP)             |           | • Append-Only Event Store   |           | • oneshot-task-runtime      |
| • Refactor (SOP)            |           | • Checkpoint Store          |           | • oneshot-intent-collection |
| • Gap Analysis (SOP)        |           | • Hardened Sandbox Runtime  |           | • oneshot-sandbox-runtime   |
| • Evaluation (SOP)          |           | • Fast REST & SSE Server    |           | • oneshot-init              |
+-----------------------------+           +-----------------------------+           +-----------------------------+
```

### Multi-Tier Ownership & Authority Separation
1. **JSON Schema Draft 2020-12 ([`schema/`](file:///d:/oneshot_e2e/schema)):** The single source of truth for artifact, event, and validation payload structures.
2. **Python Canonical Engine ([`validation/`](file:///d:/oneshot_e2e/validation)):** Strict Pydantic parsing, reference resolution, deterministic fixture evaluation, schema parity proofs, RFC 8785 canonicalization (JCS), and SHA-256 verification.
3. **TypeScript Runtime ([`backend/`](file:///d:/oneshot_e2e/backend)):** Multi-turn Intent collection, role execution, research provider adapter routing, Task Management event store, W3C trace propagation, checkpoint projections, and HTTP/SSE streaming.
4. **Sidecar Control Plane ([`workspace_api/`](file:///d:/oneshot_e2e/workspace_api)):** FastAPI control plane managing users, multi-tenant workspaces, encrypted API keys, provider routing, rate limiting, and token analytics.
5. **Read-Only UI ([`ui/`](file:///d:/oneshot_e2e/ui)):** Pure event-driven frontend visualizing real-time pipeline execution, audit graphs, task events, and hash proofs.

### The Invariant: Authority Separation
$$\text{ROLE} \neq \text{SKILL} \neq \text{TOOL} \neq \text{WORKFLOW}$$
* **Workflow:** Defines canonical execution ordering and stage transitions.
* **Role:** Owns its designated pipeline responsibility (SOP in `backend/role/<role>/SKILL.md`).
* **Skill Registry:** Discovers, indexes, resolves, and activates reusable capabilities ([`backend/skill/`](file:///d:/oneshot_e2e/backend/skill)).
* **Skill:** Declares a reusable capability ([`skill/<name>/SKILL.md`](file:///d:/oneshot_e2e/skill)).
* **Tool / Runtime:** Executes concrete operations ([`backend/tool/registry.ts`](file:///d:/oneshot_e2e/backend/tool/registry.ts) or Python RPC).

---

## 2. Canonical Workflow & Execution Trace

The pipeline executes through 27 deterministic phases from initial chat message to completed sandbox execution:

```text
Chat / Multi-turn Intent Collection
 └── Intent(id) revision
      └── Prompt_id
           └── Researcher
                └── Researcher(id)
                     └── Planner
                          └── audit_id
                               └── Refactor
                                    └── same plan_id
                                         └── Gap Analysis
                                              └── gap_0 + plan_id
                                                   └── Evaluation
                                                        └── plan_id
                                                             ├── Schema Validation ──┐
                                                             ├── Fixture Validation ──┼─ Triple Validation
                                                             └── Goal Validation ────┘      │
                                                                                            v
                                                                                       all VALID
                                                                                            │
                                                                                            v
                                                                                        CONFIRMED
                                                                                            │
                                                                                            v
                                                                                       CREATE HASH
                                                                                            │
                                                                                            v
                                                                                          HASH
                                                                                            │
                                                                                            v
                                                                                          DONE
                                                                                            │
                                                                                            v
                                                                                    Sandbox Execution
```

### Complete 27-Phase Execution Trace Table

| Phase | Phase Name | Primary File / Handler | Input Artifacts | Output Artifacts / Invariants |
| :---: | :--- | :--- | :--- | :--- |
| **1** | Multi-Turn Intent Turn | [`backend/intent/intent-collection.ts`](file:///d:/oneshot_e2e/backend/intent/intent-collection.ts) | Chat message + `conversation_id` | Appends turn, creates/updates `Intent(id)` revision. |
| **2** | Intent Information Gate | [`backend/intent/intent-collection.ts`](file:///d:/oneshot_e2e/backend/intent/intent-collection.ts) | `Intent` revision | If user info is missing: emits `ROOT CAUSE` + single targeted `help_request`. No retry loops. |
| **3** | Canonical Prompt Creation | [`backend/intent/intent-collection.ts`](file:///d:/oneshot_e2e/backend/intent/intent-collection.ts) | Complete `Intent` | `Prompt(id)` with `intent`, `requested_outcome`, `context`, and `research_direction`. |
| **4** | Provider Resolution | [`backend/role/researcher/provider-resolver.ts`](file:///d:/oneshot_e2e/backend/role/researcher/provider-resolver.ts) | Config (`ONESHOT_MODE`) | Resolves `Sample`, `ADK + Gemma 2`, `Featherless`, or Custom Module. |
| **5** | Research Draft Generation | [`backend/role/researcher/workflow.ts`](file:///d:/oneshot_e2e/backend/role/researcher/workflow.ts) | `Prompt(id)` | Generates draft containing requirements, dependencies, plan steps, assertions, and criteria. |
| **6** | Research Bundle Consolidation | [`backend/role/researcher/workflow.ts`](file:///d:/oneshot_e2e/backend/role/researcher/workflow.ts) | Structured Draft | Consolidates evidence into `EvidenceRef[]`, creates initial `ResearcherArtifact` and `Plan`. |
| **7** | Researcher Artifact Validation| [`backend/role/researcher/workflow.ts`](file:///d:/oneshot_e2e/backend/role/researcher/workflow.ts) | Researched artifacts | Proves Draft 2020-12 schema conformance for all 6 bundle artifacts. |
| **8** | Planner Audit Inspection | [`backend/role/planner/workflow.ts`](file:///d:/oneshot_e2e/backend/role/planner/workflow.ts) | `ResearcherArtifact` + `Plan` | Inspects 7 audit areas: requirements, dependencies, goals, fixtures, schema, traceability, structure. |
| **9** | Audit Findings Emission | [`backend/role/planner/workflow.ts`](file:///d:/oneshot_e2e/backend/role/planner/workflow.ts) | Inspection findings | Emits `Audit(audit_id)` containing structured `AuditFinding[]` with evidence references. |
| **10** | Refactor Plan Ingestion | [`backend/role/refactor/workflow.ts`](file:///d:/oneshot_e2e/backend/role/refactor/workflow.ts) | `Plan` + `Audit` | Validates finding references and target plan step alignment. |
| **11** | Plan Step Refinement | [`backend/role/refactor/workflow.ts`](file:///d:/oneshot_e2e/backend/role/refactor/workflow.ts) | `Plan` + `AuditFinding[]` | Applies refinements. **Preserves identical `plan_id`**, increments `revision` and records `revision_evidence`. |
| **12** | Refactored Plan Validation | [`backend/role/refactor/workflow.ts`](file:///d:/oneshot_e2e/backend/role/refactor/workflow.ts) | Refactored `Plan` | Proves refactored plan conforms strictly to `urn:oneshot:schema:plan:1`. |
| **13** | Gap Analysis Inspection | [`backend/role/gap-analysis/workflow.ts`](file:///d:/oneshot_e2e/backend/role/gap-analysis/workflow.ts) | Refactored `Plan` | Checks for missing branches, unmapped criteria, or dangling references. |
| **14** | Gap Resolution & Verification| [`backend/role/gap-analysis/workflow.ts`](file:///d:/oneshot_e2e/backend/role/gap-analysis/workflow.ts) | Gaps identified | Resolves all identified gaps, performs fresh recheck, verifies `gap_0: true`, emits `GapAnalysis` (`PASSED`). |
| **15** | Evaluation Criteria Check | [`backend/role/evaluation/workflow.ts`](file:///d:/oneshot_e2e/backend/role/evaluation/workflow.ts) | `gap_0` + `Plan` | Evaluates plan against 9-point criteria matrix (requirements, goals, fixtures, schemas, execution meaning). |
| **16** | Evaluation Result Emission | [`backend/role/evaluation/workflow.ts`](file:///d:/oneshot_e2e/backend/role/evaluation/workflow.ts) | Check results | Emits `Evaluation` artifact (`result: PASSED`, `evidence: EvaluationEvidence[]`). |
| **17** | Schema Validation Engine | [`backend/workflow/triple-validation.ts`](file:///d:/oneshot_e2e/backend/workflow/triple-validation.ts) | `SchemaArtifact` + `Plan` | Python subprocess validates plan schema conformance -> `SchemaValidationResult` (`VALID`). |
| **18** | Fixture Validation Engine | [`backend/workflow/triple-validation.ts`](file:///d:/oneshot_e2e/backend/workflow/triple-validation.ts) | `Fixture` + `Plan` | Evaluates assertion operators (`exists`, `equals`, `matchesSchema`, etc.) -> `FixtureValidationResult` (`VALID`). |
| **19** | Goal Validation Engine | [`backend/workflow/triple-validation.ts`](file:///d:/oneshot_e2e/backend/workflow/triple-validation.ts) | `Goal` + `Plan` | Validates mapped plan refs against success criteria -> `GoalValidationResult` (`VALID`). |
| **20** | Triple Validation Assembly | [`backend/workflow/triple-validation.ts`](file:///d:/oneshot_e2e/backend/workflow/triple-validation.ts) | All 3 validation results | Verifies all 3 results are `VALID` -> emits `TripleValidation` with `all_valid: true`. |
| **21** | Confirmed Core Assembly | [`backend/workflow/confirmation.ts`](file:///d:/oneshot_e2e/backend/workflow/confirmation.ts) | Researched & validated bundle | Assembles `ConfirmedCore` containing all 10 canonical artifacts. |
| **22** | Confirmed Package Packaging | [`backend/workflow/confirmation.ts`](file:///d:/oneshot_e2e/backend/workflow/confirmation.ts) | `ConfirmedCore` | Packages into `ConfirmedPackage` (`confirmed: true`). Excludes runtime/audit metadata. |
| **23** | RFC 8785 Canonicalization | [`backend/workflow/hash.ts`](file:///d:/oneshot_e2e/backend/workflow/hash.ts) | `confirmed_package.core` | Python JCS canonicalizes core bytes using `oneshot-jcs-rfc8785-v1`. |
| **24** | SHA-256 Hash Generation | [`backend/workflow/hash.ts`](file:///d:/oneshot_e2e/backend/workflow/hash.ts) | Canonical bytes | Computes `created_hash` (64-char lowercase hex). |
| **25** | Hash Equality Verification | [`backend/workflow/hash.ts`](file:///d:/oneshot_e2e/backend/workflow/hash.ts) | `created_hash` | Independently recomputes `recomputed_hash` and asserts `created_hash == recomputed_hash`. |
| **26** | Canonical State DONE | [`backend/runtime/workflow-runtime.ts`](file:///d:/oneshot_e2e/backend/runtime/workflow-runtime.ts) | Verified `HashProof` | Emits completion event, snapshots final run state, reaches `DONE`. |
| **27** | Sandbox Admission & Run | [`backend/sandbox/sandbox-service.ts`](file:///d:/oneshot_e2e/backend/sandbox/sandbox-service.ts) | `ConfirmedPackage` + `HASH` | Verifies hash admission, runs plan in isolated sandbox, verifies `hash_sandbox == HASH`. |

---

## 3. Comprehensive File Registry & Component Directory

Every file in the repository is cataloged below with direct clickable links, its owner subsystem, and functional purpose.

```text
d:/oneshot_e2e/
├── AGENTS.md                                 # Master operational manual & comprehensive registry (this file)
├── CANONICAL_WORKFLOW.md                     # Canonical workflow state machine definition & DAG specification
├── README.md                                 # High-level architecture summary, quick start, and provider modes
├── TEST_REPORT.md                            # Comprehensive multi-tier test verification report
├── NOTICE                                    # Legal notices & attribution
├── LICENSE                                   # Apache-2.0 open-source software license
├── MANIFEST.sha256                           # SHA-256 integrity checksum manifest for all source files
├── contract-registry.json                    # Central contract registry mapping URNs to JSON Schema paths
├── package.json                              # Node.js engine specification, offline npm scripts, devDependencies
├── package-lock.json                         # Pinned offline lockfile for npm packages
├── Dockerfile                                # Production multi-stage container build for Cloud Run & Kubernetes
├── .gitignore                                # Git ignore patterns (ignores .venv, .ollama, dist, data runs)
├── .env.example                              # Environment configuration template for OneShot runtime
├── .env.workspace.example                    # Environment configuration template for Workspace API sidecar
├── requirements.txt                          # Pinned Python dependencies for base validation runtime
├── requirements-adk.txt                      # Pinned Python dependencies for Google ADK + LiteLLM + Ollama
├── requirements-featherless.txt               # Pinned Python dependencies for Featherless OpenAI API
└── requirements-workspace-api.txt            # Pinned Python dependencies for FastAPI Workspace API sidecar
```

### 1. `.agents/` — Customizations & Rules
* [`oneshot-skill-architecture.md`](file:///d:/oneshot_e2e/.agents/rules/oneshot-skill-architecture.md): Core architectural rules defining the Three-Way Partition, authority boundaries, five-stage skill lifecycle, and script placement rules.

### 2. `backend/` — TypeScript Runtime Subsystem
* [`backend/index.ts`](file:///d:/oneshot_e2e/backend/index.ts): Main bootstrap assembly wiring stores, event bus, Python bridge, provider resolver, workflow runtime, sandbox service, and HTTP server.
* [`backend/contract/types.ts`](file:///d:/oneshot_e2e/backend/contract/types.ts): Canonical TypeScript interface definitions for all 21 JSON Schemas, events, snapshots, and bundles.
* **`backend/core/` (Core Utilities):**
  - [`clone.ts`](file:///d:/oneshot_e2e/backend/core/clone.ts): Structured deep cloning utility.
  - [`id.ts`](file:///d:/oneshot_e2e/backend/core/id.ts): Deterministic and unique ID generator supporting standard prefixes (`urn:uuid:`, `run_`, `evt_`, `intent_`, `step_`, etc.).
  - [`information-required-error.ts`](file:///d:/oneshot_e2e/backend/core/information-required-error.ts): Error class emitted when mandatory user information is missing during Intent collection.
  - [`root-cause-error.ts`](file:///d:/oneshot_e2e/backend/core/root-cause-error.ts): Structured root cause error class carrying expected vs. actual results and evidence IDs.
* **`backend/graph/` (DAG & Projection Projections):**
  - [`adk-graph.ts`](file:///d:/oneshot_e2e/backend/graph/adk-graph.ts): Generates Google ADK Researcher provider subgraph projection.
  - [`authority-graph.ts`](file:///d:/oneshot_e2e/backend/graph/authority-graph.ts): Projects Authority $\rightarrow$ Responsibility $\rightarrow$ Skill $\rightarrow$ Tool $\rightarrow$ Artifact DAG.
  - [`intent-graph.ts`](file:///d:/oneshot_e2e/backend/graph/intent-graph.ts): Projects conversational turn history, required fields, and readiness state.
* **`backend/intent/` (Multi-Turn Intent Collection):**
  - [`conversation-store.ts`](file:///d:/oneshot_e2e/backend/intent/conversation-store.ts): File-backed persistence for multi-turn conversations and intent revisions (`data/conversations/`).
  - [`intent-collection.ts`](file:///d:/oneshot_e2e/backend/intent/intent-collection.ts): Conversational accumulator, turn provenance tracker, targeted clarification engine, and `Prompt(id)` gatekeeper.
  - [`types.ts`](file:///d:/oneshot_e2e/backend/intent/types.ts): Interfaces for Conversation, ConversationTurn, IntentState, and HelpRequest.
* **`backend/role/` (Pipeline Roles):**
  - **`researcher/`:**
    - [`role.ts`](file:///d:/oneshot_e2e/backend/role/researcher/role.ts): Role definition & metadata.
    - [`SKILL.md`](file:///d:/oneshot_e2e/backend/role/researcher/SKILL.md): Researcher Operating SOP.
    - [`workflow.ts`](file:///d:/oneshot_e2e/backend/role/researcher/workflow.ts): Converts Prompt into researched ResearchBundle and validates all 6 bundle artifacts.
    - [`provider.ts`](file:///d:/oneshot_e2e/backend/role/researcher/provider.ts): ResearchProvider abstract interface.
    - [`provider-resolver.ts`](file:///d:/oneshot_e2e/backend/role/researcher/provider-resolver.ts): Resolves provider based on environment variables.
    - [`provider/structured-draft.ts`](file:///d:/oneshot_e2e/backend/role/researcher/provider/structured-draft.ts): Structured research draft schema validation.
    - [`provider/adk-gemma2/provider.ts`](file:///d:/oneshot_e2e/backend/role/researcher/provider/adk-gemma2/provider.ts): Google ADK + Gemma 2 (Ollama) provider implementation.
    - [`provider/adk-gemma2/types.ts`](file:///d:/oneshot_e2e/backend/role/researcher/provider/adk-gemma2/types.ts): ADK provider configuration options and worker protocol types.
    - [`provider/adk-gemma2/worker-bridge.ts`](file:///d:/oneshot_e2e/backend/role/researcher/provider/adk-gemma2/worker-bridge.ts): Subprocess communication bridge to Python ADK worker.
    - [`provider/adk-gemma2/worker.py`](file:///d:/oneshot_e2e/backend/role/researcher/provider/adk-gemma2/worker.py): Python worker invoking Google ADK and LiteLLM Ollama chat.
    - [`provider/adk-gemma2/NOTICE.md`](file:///d:/oneshot_e2e/backend/role/researcher/provider/adk-gemma2/NOTICE.md): ADK adapter notice.
    - [`provider/featherless/provider.ts`](file:///d:/oneshot_e2e/backend/role/researcher/provider/featherless/provider.ts): Featherless OpenAI API provider implementation.
    - [`provider/featherless/types.ts`](file:///d:/oneshot_e2e/backend/role/researcher/provider/featherless/types.ts): Featherless provider configuration types.
    - [`provider/featherless/worker-bridge.ts`](file:///d:/oneshot_e2e/backend/role/researcher/provider/featherless/worker-bridge.ts): Subprocess bridge to Featherless Python worker.
    - [`provider/featherless/worker.py`](file:///d:/oneshot_e2e/backend/role/researcher/provider/featherless/worker.py): Python worker calling Featherless OpenAI-compatible endpoint.
    - [`tool/fixture-provider.ts`](file:///d:/oneshot_e2e/backend/role/researcher/tool/fixture-provider.ts): Deterministic test fixture research provider.
    - [`tool/registry.ts`](file:///d:/oneshot_e2e/backend/role/researcher/tool/registry.ts): Private tool registry for researcher role.
    - [`tool/evidence/collector.ts`](file:///d:/oneshot_e2e/backend/role/researcher/tool/evidence/collector.ts): Consolidates evidence references from research drafts.
  - **`planner/`:**
    - [`role.ts`](file:///d:/oneshot_e2e/backend/role/planner/role.ts): Role definition.
    - [`SKILL.md`](file:///d:/oneshot_e2e/backend/role/planner/SKILL.md): Planner Operating SOP.
    - [`workflow.ts`](file:///d:/oneshot_e2e/backend/role/planner/workflow.ts): Reviews plan evidence and produces `Audit(audit_id)` with structured `AuditFinding[]`.
    - [`tool/coverage.ts`](file:///d:/oneshot_e2e/backend/role/planner/tool/coverage.ts): Requirement and goal coverage verification tool.
  - **`refactor/`:**
    - [`role.ts`](file:///d:/oneshot_e2e/backend/role/refactor/role.ts): Role definition.
    - [`SKILL.md`](file:///d:/oneshot_e2e/backend/role/refactor/SKILL.md): Refactor Operating SOP.
    - [`workflow.ts`](file:///d:/oneshot_e2e/backend/role/refactor/workflow.ts): Applies audit findings while **strictly preserving original `plan_id`**.
    - [`tool/apply-audit.ts`](file:///d:/oneshot_e2e/backend/role/refactor/tool/apply-audit.ts): Mutates plan steps and attaches revision evidence.
  - **`gap-analysis/`:**
    - [`role.ts`](file:///d:/oneshot_e2e/backend/role/gap-analysis/role.ts): Role definition.
    - [`SKILL.md`](file:///d:/oneshot_e2e/backend/role/gap-analysis/SKILL.md): Gap Analysis Operating SOP.
    - [`workflow.ts`](file:///d:/oneshot_e2e/backend/role/gap-analysis/workflow.ts): Identifies gaps, applies fixes, and proves `gap_0: true` and `result: PASSED`.
    - [`tool/coverage.ts`](file:///d:/oneshot_e2e/backend/role/gap-analysis/tool/coverage.ts): Gap coverage analyzer.
  - **`evaluation/`:**
    - [`role.ts`](file:///d:/oneshot_e2e/backend/role/evaluation/role.ts): Role definition.
    - [`SKILL.md`](file:///d:/oneshot_e2e/backend/role/evaluation/SKILL.md): Evaluation Operating SOP.
    - [`workflow.ts`](file:///d:/oneshot_e2e/backend/role/evaluation/workflow.ts): Evaluates plan against 9-point criteria matrix, returning `PASSED` or `ROOT_CAUSE`.
    - [`tool/evaluate-plan.ts`](file:///d:/oneshot_e2e/backend/role/evaluation/tool/evaluate-plan.ts): Evaluates plan against requirements, goals, fixtures, and schemas.
* **`backend/runtime/` (State & Orchestration):**
  - [`artifact-store.ts`](file:///d:/oneshot_e2e/backend/runtime/artifact-store.ts): File-based artifact repository saving artifacts under `data/runs/<run_id>/`.
  - [`event-bus.ts`](file:///d:/oneshot_e2e/backend/runtime/event-bus.ts): Dispatcher notifying observers of workflow, ADK, and sandbox events.
  - [`run-repository.ts`](file:///d:/oneshot_e2e/backend/runtime/run-repository.ts): Manages in-memory snapshots and disk persistence under `data/run-state/<run_id>.json`.
  - [`workflow-runtime.ts`](file:///d:/oneshot_e2e/backend/runtime/workflow-runtime.ts): Master coordinator executing the complete 27-phase canonical pipeline.
* **`backend/sandbox/` (Isolated Sandbox Execution Boundary):**
  - [`admission.ts`](file:///d:/oneshot_e2e/backend/sandbox/admission.ts): Validates `ConfirmedPackage` structure and SHA-256 hash match prior to admitting execution.
  - [`sandbox-service.ts`](file:///d:/oneshot_e2e/backend/sandbox/sandbox-service.ts): Orchestrates sandbox preparation, isolated execution, evidence capture, and post-execution hash verification.
  - [`types.ts`](file:///d:/oneshot_e2e/backend/sandbox/types.ts): Interfaces for SandboxExecutionRequest, SandboxExecutionResult, and SandboxPolicy.
  - [`graph/sandbox-graph.ts`](file:///d:/oneshot_e2e/backend/sandbox/graph/sandbox-graph.ts): Projects sandbox workspace execution tree.
  - [`runner/runner.ts`](file:///d:/oneshot_e2e/backend/sandbox/runner/runner.ts): SandboxRunner abstract interface.
  - [`runner/process-runner.ts`](file:///d:/oneshot_e2e/backend/sandbox/runner/process-runner.ts): Hardened ephemeral process runner with resource and timeout quotas.
  - [`runner/container-runner.ts`](file:///d:/oneshot_e2e/backend/sandbox/runner/container-runner.ts): Docker/container isolation boundary runner.
* **`backend/server/` (HTTP & SSE Server):**
  - [`http-server.ts`](file:///d:/oneshot_e2e/backend/server/http-server.ts): High-performance HTTP and SSE server handling all `/api/*` routes and static UI serving.
  - [`http-security.ts`](file:///d:/oneshot_e2e/backend/server/http-security.ts): Security middleware enforcing CSP, CORS, rate limiting, and bearer token authorization.
* **`backend/skill/` (Skill Engine & Bindings):**
  - [`activation.ts`](file:///d:/oneshot_e2e/backend/skill/activation.ts): Skill activation engine binding resolved skills to callable runtimes.
  - [`bootstrap.ts`](file:///d:/oneshot_e2e/backend/skill/bootstrap.ts): Bootstraps built-in skills and registers default tool surfaces.
  - [`catalog.ts`](file:///d:/oneshot_e2e/backend/skill/catalog.ts): SkillCatalog indexing capabilities and dynamically discovering `skill/*/SKILL.md` from disk.
  - [`canonical-contract-skill.ts`](file:///d:/oneshot_e2e/backend/skill/canonical-contract-skill.ts): TypeScript wrapper for `oneshot-canonical-contracts`.
  - [`init-skill.ts`](file:///d:/oneshot_e2e/backend/skill/init-skill.ts): TypeScript wrapper for `oneshot-init`.
  - [`intent-collection-skill.ts`](file:///d:/oneshot_e2e/backend/skill/intent-collection-skill.ts): TypeScript wrapper for `oneshot-intent-collection`.
  - [`sandbox-skill.ts`](file:///d:/oneshot_e2e/backend/skill/sandbox-skill.ts): TypeScript wrapper for `oneshot-sandbox-runtime`.
  - [`task-runtime-skill.ts`](file:///d:/oneshot_e2e/backend/skill/task-runtime-skill.ts): TypeScript wrapper for `oneshot-task-runtime`.
  - [`registry.ts`](file:///d:/oneshot_e2e/backend/skill/registry.ts): Reusable SkillRegistry interface.
  - [`resolver.ts`](file:///d:/oneshot_e2e/backend/skill/resolver.ts): Exact capability resolver (rejects fuzzy substitutions).
  - [`types.ts`](file:///d:/oneshot_e2e/backend/skill/types.ts): SkillDescriptor and lifecycle interface definitions.
* **`backend/task/` (Task Management & Tracing):**
  - [`task-management.ts`](file:///d:/oneshot_e2e/backend/task/task-management.ts): Facade for projections, replay, and monotonic ordering audits.
  - [`checkpoint/checkpoint-store.ts`](file:///d:/oneshot_e2e/backend/task/checkpoint/checkpoint-store.ts): Milestone checkpoint store persisting under `data/checkpoints/<run_id>.json`.
  - [`event/event-store.ts`](file:///d:/oneshot_e2e/backend/task/event/event-store.ts): Append-only monotonic event store persisting under `data/task-events/<run_id>.jsonl`.
  - [`guard/ordering.ts`](file:///d:/oneshot_e2e/backend/task/guard/ordering.ts): Validates legal state transitions and detects illegal sequence jumps.
  - [`projection/run-projection.ts`](file:///d:/oneshot_e2e/backend/task/projection/run-projection.ts): Projects live timeline, active step status, and artifact links.
  - [`projection/audit-projection.ts`](file:///d:/oneshot_e2e/backend/task/projection/audit-projection.ts): Generates comprehensive audit projections with ordering verification.
* **`backend/tool/` (Tool Dispatch):**
  - [`registry.ts`](file:///d:/oneshot_e2e/backend/tool/registry.ts): Concrete in-memory `ToolRegistry` supporting typed registration and invocation.
* **`backend/validation/` (Python RPC Bridge):**
  - [`python-bridge.ts`](file:///d:/oneshot_e2e/backend/validation/python-bridge.ts): Subprocess JSON-RPC channel connecting TypeScript to Python `validation.rpc`.
  - [`deterministic-validation.ts`](file:///d:/oneshot_e2e/backend/validation/deterministic-validation.ts): TypeScript wrapper invoking Python triple validation engine.
* **`backend/workflow/` (Canonical Workflow Transitions):**
  - [`confirmation.ts`](file:///d:/oneshot_e2e/backend/workflow/confirmation.ts): Assembles immutable `ConfirmedCore` and `ConfirmedPackage`.
  - [`hash.ts`](file:///d:/oneshot_e2e/backend/workflow/hash.ts): Coordinates RFC 8785 canonicalization and SHA-256 equality proof.
  - [`triple-validation.ts`](file:///d:/oneshot_e2e/backend/workflow/triple-validation.ts): Executes independent Schema, Fixture, and Goal validations.

### 3. `schema/` — JSON Schema Draft 2020-12 Canonical Authority
* [`audit.schema.json`](file:///d:/oneshot_e2e/schema/audit.schema.json): Schema for Audit and AuditFinding.
* [`common.schema.json`](file:///d:/oneshot_e2e/schema/common.schema.json): Shared definitions: EvidenceRef, RootCause, SuccessDefinition, and ID formats.
* [`confirmed-package.schema.json`](file:///d:/oneshot_e2e/schema/confirmed-package.schema.json): Schema for ConfirmedCore and ConfirmedPackage.
* [`contract-registry.schema.json`](file:///d:/oneshot_e2e/schema/contract-registry.schema.json): Schema for `contract-registry.json` structure.
* [`evaluation.schema.json`](file:///d:/oneshot_e2e/schema/evaluation.schema.json): Schema for Evaluation artifact and EvaluationEvidence.
* [`execution-evidence.schema.json`](file:///d:/oneshot_e2e/schema/execution-evidence.schema.json): Schema for Sandbox execution evidence.
* [`fixture.schema.json`](file:///d:/oneshot_e2e/schema/fixture.schema.json): Schema for Fixture and PlanAssertion.
* [`fixture-validation.schema.json`](file:///d:/oneshot_e2e/schema/fixture-validation.schema.json): Schema for FixtureValidationResult.
* [`gap.schema.json`](file:///d:/oneshot_e2e/schema/gap.schema.json): Schema for GapAnalysis and ResolvedGap.
* [`goal.schema.json`](file:///d:/oneshot_e2e/schema/goal.schema.json): Schema for Goal and SuccessCriterion.
* [`goal-validation.schema.json`](file:///d:/oneshot_e2e/schema/goal-validation.schema.json): Schema for GoalValidationResult.
* [`hash-proof.schema.json`](file:///d:/oneshot_e2e/schema/hash-proof.schema.json): Schema for HashProof (`oneshot-jcs-rfc8785-v1` + SHA-256).
* [`plan.schema.json`](file:///d:/oneshot_e2e/schema/plan.schema.json): Schema for Plan, PlanStep, and RevisionEvidence.
* [`prompt.schema.json`](file:///d:/oneshot_e2e/schema/prompt.schema.json): Schema for Prompt and PromptContext.
* [`researcher.schema.json`](file:///d:/oneshot_e2e/schema/researcher.schema.json): Schema for ResearcherArtifact.
* [`sandbox-execution.schema.json`](file:///d:/oneshot_e2e/schema/sandbox-execution.schema.json): Schema for SandboxExecutionRequest and SandboxExecutionResult.
* [`schema-artifact.schema.json`](file:///d:/oneshot_e2e/schema/schema-artifact.schema.json): Schema for SchemaArtifact.
* [`schema-validation.schema.json`](file:///d:/oneshot_e2e/schema/schema-validation.schema.json): Schema for SchemaValidationResult.
* [`triple-validation.schema.json`](file:///d:/oneshot_e2e/schema/triple-validation.schema.json): Schema for TripleValidation combined artifact.
* [`validation.schema.json`](file:///d:/oneshot_e2e/schema/validation.schema.json): Schema for ValidationDefinition.
* [`workflow-graph.schema.json`](file:///d:/oneshot_e2e/schema/workflow-graph.schema.json): Schema for canonical workflow DAG (`workflow/graph.json`).

### 4. `skill/` — Reusable Skills & Tools
* **`init/`:**
  - [`SKILL.md`](file:///d:/oneshot_e2e/skill/init/SKILL.md): `oneshot-init` skill definition.
* **`oneshot-canonical-contracts/`:**
  - [`SKILL.md`](file:///d:/oneshot_e2e/skill/oneshot-canonical-contracts/SKILL.md): `oneshot-canonical-contracts` skill definition.
  - [`tool/registry.py`](file:///d:/oneshot_e2e/skill/oneshot-canonical-contracts/tool/registry.py): Python tool registry builder exposing all 12 contract tools.
  - **`scripts/` (Standalone Python Invocation Scripts):**
    - [`_invoke.py`](file:///d:/oneshot_e2e/skill/oneshot-canonical-contracts/scripts/_invoke.py): CLI helper for invoking registry tools from stdin.
    - [`canonicalize.py`](file:///d:/oneshot_e2e/skill/oneshot-canonical-contracts/scripts/canonicalize.py): Standalone CLI script for RFC 8785 canonicalization.
    - [`create_hash.py`](file:///d:/oneshot_e2e/skill/oneshot-canonical-contracts/scripts/create_hash.py): Standalone CLI script for SHA-256 hash generation.
    - [`resolve_artifact.py`](file:///d:/oneshot_e2e/skill/oneshot-canonical-contracts/scripts/resolve_artifact.py): Resolves artifacts from `data/runs/`.
    - [`run_fixture.py`](file:///d:/oneshot_e2e/skill/oneshot-canonical-contracts/scripts/run_fixture.py): Evaluates deterministic fixture assertions.
    - [`trace_artifact.py`](file:///d:/oneshot_e2e/skill/oneshot-canonical-contracts/scripts/trace_artifact.py): Traces lineage for any artifact identity.
    - [`validate_artifact.py`](file:///d:/oneshot_e2e/skill/oneshot-canonical-contracts/scripts/validate_artifact.py): Validates artifact schema and parity.
    - [`validate_graph.py`](file:///d:/oneshot_e2e/skill/oneshot-canonical-contracts/scripts/validate_graph.py): Validates workflow graph acyclicity and completeness.
    - [`validate_parity.py`](file:///d:/oneshot_e2e/skill/oneshot-canonical-contracts/scripts/validate_parity.py): Proves schema/Pydantic parity.
    - [`validate_references.py`](file:///d:/oneshot_e2e/skill/oneshot-canonical-contracts/scripts/validate_references.py): Proves foreign ID reference integrity.
    - [`validate_registry.py`](file:///d:/oneshot_e2e/skill/oneshot-canonical-contracts/scripts/validate_registry.py): Validates `contract-registry.json`.
    - [`validate_schema.py`](file:///d:/oneshot_e2e/skill/oneshot-canonical-contracts/scripts/validate_schema.py): Validates any payload against a schema URN.
    - [`verify_hash.py`](file:///d:/oneshot_e2e/skill/oneshot-canonical-contracts/scripts/verify_hash.py): Verifies SHA-256 hash proof equality.
* **`oneshot-intent-collection/`:**
  - [`SKILL.md`](file:///d:/oneshot_e2e/skill/oneshot-intent-collection/SKILL.md): `oneshot-intent-collection` skill definition.
* **`oneshot-sandbox-runtime/`:**
  - [`SKILL.md`](file:///d:/oneshot_e2e/skill/oneshot-sandbox-runtime/SKILL.md): `oneshot-sandbox-runtime` skill definition.
* **`oneshot-task-runtime/`:**
  - [`SKILL.md`](file:///d:/oneshot_e2e/skill/oneshot-task-runtime/SKILL.md): `oneshot-task-runtime` skill definition.

### 5. `validation/` — Python Canonical Validation Engine
* [`__init__.py`](file:///d:/oneshot_e2e/validation/__init__.py): Validation package marker.
* [`artifact_resolver.py`](file:///d:/oneshot_e2e/validation/artifact_resolver.py): Resolves artifacts from `data/runs/`.
* [`canonicalize.py`](file:///d:/oneshot_e2e/validation/canonicalize.py): Pure Python implementation of RFC 8785 JSON Canonicalization Scheme (JCS).
* [`cli.py`](file:///d:/oneshot_e2e/validation/cli.py): CLI dispatcher and RPC command handler.
* [`evaluation.py`](file:///d:/oneshot_e2e/validation/evaluation.py): Plan evaluation logic verifying requirements and execution meaning.
* [`fixture_runner.py`](file:///d:/oneshot_e2e/validation/fixture_runner.py): Evaluates operators (`exists`, `equals`, `contains`, `matchesSchema`, `references`, `edgeExists`, `allFilesSpecified`).
* [`graph_validator.py`](file:///d:/oneshot_e2e/validation/graph_validator.py): Verifies workflow DAG acyclicity and reachability.
* [`hash_proof.py`](file:///d:/oneshot_e2e/validation/hash_proof.py): Generates and verifies canonical SHA-256 hash proofs.
* [`models.py`](file:///d:/oneshot_e2e/validation/models.py): Strict Pydantic models with 1:1 schema parity for all contract types.
* [`parity.py`](file:///d:/oneshot_e2e/validation/parity.py): Automated parity proof between Pydantic models and JSON Schema Draft 2020-12 files.
* [`reference_validator.py`](file:///d:/oneshot_e2e/validation/reference_validator.py): Cross-artifact ID reference and provenance resolution validator.
* [`registry.py`](file:///d:/oneshot_e2e/validation/registry.py): Contract registry validator for `contract-registry.json`.
* [`rpc.py`](file:///d:/oneshot_e2e/validation/rpc.py): JSON-RPC server reading stdin and writing stdout responses for `PythonBridge`.
* [`schema_validator.py`](file:///d:/oneshot_e2e/validation/schema_validator.py): High-performance Draft 2020-12 schema validator using `jsonschema`.
* [`triple_validation.py`](file:///d:/oneshot_e2e/validation/triple_validation.py): Deterministic Triple Validation engine executing Schema, Fixture, and Goal proofs.

### 6. `workspace_api/` — Sidecar Control Plane (FastAPI)
* [`__init__.py`](file:///d:/oneshot_e2e/workspace_api/__init__.py): Workspace API package marker.
* [`api.py`](file:///d:/oneshot_e2e/workspace_api/api.py): FastAPI application factory registering routers, middleware, and exception handlers.
* [`auth.py`](file:///d:/oneshot_e2e/workspace_api/auth.py): Authentication handlers for JWT bearer tokens and workspace API keys.
* [`chat.py`](file:///d:/oneshot_e2e/workspace_api/chat.py): Durable chat conversation and message management.
* [`config.py`](file:///d:/oneshot_e2e/workspace_api/config.py): Pydantic settings loading `.env.workspace` or environment variables.
* [`database.py`](file:///d:/oneshot_e2e/workspace_api/database.py): Async SQLAlchemy database session management and engine configuration.
* [`errors.py`](file:///d:/oneshot_e2e/workspace_api/errors.py): RFC 7807 problem details and standardized error response models.
* [`main.py`](file:///d:/oneshot_e2e/workspace_api/main.py): Uvicorn entry point for running the Workspace API server.
* [`models.py`](file:///d:/oneshot_e2e/workspace_api/models.py): SQLAlchemy ORM models: User, Workspace, APIKey, Credential, ModelPool, UsageEvent.
* [`observability.py`](file:///d:/oneshot_e2e/workspace_api/observability.py): Structured JSON logging and Prometheus/HTTP request metrics middleware.
* [`providers.py`](file:///d:/oneshot_e2e/workspace_api/providers.py): Provider client adapters and connectivity health checks.
* [`rate_limit.py`](file:///d:/oneshot_e2e/workspace_api/rate_limit.py): Deterministic in-memory / Redis sliding-window rate limiter.
* [`router.py`](file:///d:/oneshot_e2e/workspace_api/router.py): Weighted model router and load balancer.
* [`schemas.py`](file:///d:/oneshot_e2e/workspace_api/schemas.py): Pydantic request/response DTOs for all $\ge 25$ REST endpoints.
* [`security.py`](file:///d:/oneshot_e2e/workspace_api/security.py): Password hashing (Argon2), JWT encoding/decoding, and AES credential encryption.
* [`services.py`](file:///d:/oneshot_e2e/workspace_api/services.py): Core service layer orchestrating workspaces, credentials, and API keys.
* [`usage.py`](file:///d:/oneshot_e2e/workspace_api/usage.py): Token quota enforcement and usage aggregation service.

### 7. `scripts/` — Operational & Verification Scripts
* [`bootstrap.py`](file:///d:/oneshot_e2e/scripts/bootstrap.py): Installs Python dependencies and offline npm packages from `vendor/npm/`.
* [`build_deterministic_zip.py`](file:///d:/oneshot_e2e/scripts/build_deterministic_zip.py): Packages a normalized, reproducible zip archive.
* [`generate_manifest.py`](file:///d:/oneshot_e2e/scripts/generate_manifest.py): Generates `MANIFEST.sha256` for all source files.
* [`ollama_preflight.py`](file:///d:/oneshot_e2e/scripts/ollama_preflight.py): Preflight check for local Ollama service and `gemma2:9b` model.
* [`verify_adk_live.py`](file:///d:/oneshot_e2e/scripts/verify_adk_live.py): Live structured inference test for Google ADK + LiteLLM + Ollama.
* [`verify_all.py`](file:///d:/oneshot_e2e/scripts/verify_all.py): Master test runner executing dependency verification, Python unit tests, TypeScript compilation, and E2E tests.
* [`verify_dependencies.py`](file:///d:/oneshot_e2e/scripts/verify_dependencies.py): Validates exact pinned versions for all installed dependencies.
* [`verify_featherless_live.mjs`](file:///d:/oneshot_e2e/scripts/verify_featherless_live.mjs): Live test for Featherless OpenAI API provider.
* [`verify_manifest.py`](file:///d:/oneshot_e2e/scripts/verify_manifest.py): Validates repository integrity against `MANIFEST.sha256`.
* [`verify_runtime.py`](file:///d:/oneshot_e2e/scripts/verify_runtime.py): Runs Python tests and compiled TypeScript E2E suite.
* [`verify_workspace_api.py`](file:///d:/oneshot_e2e/scripts/verify_workspace_api.py): Tests Workspace API dependencies, compilation, database migrations, unit tests, and OpenAPI schema.

### 8. `docs/` — Architecture & Design Documents
* [`WORKFLOW_TREE`](file:///d:/oneshot_e2e/docs/WORKFLOW_TREE): Source-of-truth canonical workflow tree and execution model.
* [`ADK_GEMMA2_INTEGRATION.md`](file:///d:/oneshot_e2e/docs/ADK_GEMMA2_INTEGRATION.md): Google ADK + local Gemma 2 Ollama integration architecture and worker protocol.
* [`INTENT_AUTHORITY_AND_HELP.md`](file:///d:/oneshot_e2e/docs/INTENT_AUTHORITY_AND_HELP.md): Multi-turn intent collection, turn provenance, and targeted clarification design.
* [`ONESHOT_IDE_BUILD_RECORD.md`](file:///d:/oneshot_e2e/docs/ONESHOT_IDE_BUILD_RECORD.md): Build record and architectural invariants of the OneShot IDE.
* [`RESEARCH_PROVIDER_BUILD_RECORD.md`](file:///d:/oneshot_e2e/docs/RESEARCH_PROVIDER_BUILD_RECORD.md): Research provider modularization record (Sample, ADK, Featherless).
* [`TASK_MANAGEMENT_AND_ADK_GRAPH.md`](file:///d:/oneshot_e2e/docs/TASK_MANAGEMENT_AND_ADK_GRAPH.md): Append-only event store and ADK graph projection documentation.
* [`WORKSPACE_API_BUILD_RECORD.md`](file:///d:/oneshot_e2e/docs/WORKSPACE_API_BUILD_RECORD.md): Workspace API sidecar implementation and verification record.
* [`WORKSPACE_API_DESIGN.md`](file:///d:/oneshot_e2e/docs/WORKSPACE_API_DESIGN.md): Detailed architectural design for the FastAPI Workspace API control plane.
* [`docs/source/Create_Script_Skills_and_Contracts.txt`](file:///d:/oneshot_e2e/docs/source/Create_Script_Skills_and_Contracts.txt): Source design specifications for script skills.
* [`docs/source/OneShot_Canonical_Contract_and_Verification.txt`](file:///d:/oneshot_e2e/docs/source/OneShot_Canonical_Contract_and_Verification.txt): Source canonical contract design.

### 9. `fixtures/` — Test & Sample Fixtures
* [`fixtures/e2e/complete-success.json`](file:///d:/oneshot_e2e/fixtures/e2e/complete-success.json): Canonical success fixture bundle for E2E tests.
* [`fixtures/product/complete-success-seed.json`](file:///d:/oneshot_e2e/fixtures/product/complete-success-seed.json): Seed data for product demonstration mode.
* [`fixtures/provider/adk-research-draft.json`](file:///d:/oneshot_e2e/fixtures/provider/adk-research-draft.json): Deterministic structured draft fixture for ADK provider tests.

### 10. `tests/` & `tests_ts/` — Multi-Tier Test Suites
* **`tests/` (Python Unit & Canonical Proofs - 46 tests):**
  - [`test_additional_proofs.py`](file:///d:/oneshot_e2e/tests/test_additional_proofs.py): Extended verification of edge cases and graph validator.
  - [`test_adk_gemma_worker.py`](file:///d:/oneshot_e2e/tests/test_adk_gemma_worker.py): Tests ADK worker process bridge and JSON-RPC protocol.
  - [`test_canonicalize.py`](file:///d:/oneshot_e2e/tests/test_canonicalize.py): Validates RFC 8785 JCS canonicalization and key sorting.
  - [`test_dependency_verifier.py`](file:///d:/oneshot_e2e/tests/test_dependency_verifier.py): Tests dependency version checker across profiles.
  - [`test_e2e.py`](file:///d:/oneshot_e2e/tests/test_e2e.py): End-to-end Python canonical workflow proof.
  - [`test_fixture.py`](file:///d:/oneshot_e2e/tests/test_fixture.py): Tests basic fixture runner operations.
  - [`test_fixture_operators.py`](file:///d:/oneshot_e2e/tests/test_fixture_operators.py): Comprehensive tests for all 7 fixture assertion operators.
  - [`test_graph.py`](file:///d:/oneshot_e2e/tests/test_graph.py): Tests workflow DAG validation and cycle detection.
  - [`test_parity.py`](file:///d:/oneshot_e2e/tests/test_parity.py): Proves parity between Pydantic models and JSON Schema files.
  - [`test_registry.py`](file:///d:/oneshot_e2e/tests/test_registry.py): Tests `contract-registry.json` schema resolution.
  - [`test_runtime_parity_extended.py`](file:///d:/oneshot_e2e/tests/test_runtime_parity_extended.py): Extended model parity checks for all edge cases.
  - [`test_sandbox_admission.py`](file:///d:/oneshot_e2e/tests/test_sandbox_admission.py): Tests sandbox admission verification and hash matching.
  - [`test_schemas.py`](file:///d:/oneshot_e2e/tests/test_schemas.py): Tests validity of all 21 JSON Schema files.
  - [`test_skill_surface.py`](file:///d:/oneshot_e2e/tests/test_skill_surface.py): Tests Python canonical contract tool registry dispatch.
  - [`test_workspace_api.py`](file:///d:/oneshot_e2e/tests/test_workspace_api.py): Comprehensive tests for FastAPI Workspace API (auth, keys, models, chat, usage, rate limiting).
* **`tests_ts/` (TypeScript E2E, HTTP & Boundary Tests - 46 tests):**
  - [`adk-gemma-provider.test.ts`](file:///d:/oneshot_e2e/tests_ts/adk-gemma-provider.test.ts): Tests Google ADK provider adapter and structured draft generation.
  - [`adk-http.test.ts`](file:///d:/oneshot_e2e/tests_ts/adk-http.test.ts): Tests HTTP/SSE execution path using ADK provider.
  - [`authority-graph.test.ts`](file:///d:/oneshot_e2e/tests_ts/authority-graph.test.ts): Tests Authority $\rightarrow$ Skill $\rightarrow$ Tool graph projection.
  - [`canonical-matrix.test.ts`](file:///d:/oneshot_e2e/tests_ts/canonical-matrix.test.ts): Comprehensive Role/runtime fixture matrix covering all negative/positive paths.
  - [`featherless-provider.test.ts`](file:///d:/oneshot_e2e/tests_ts/featherless-provider.test.ts): Tests Featherless provider adapter and missing auth handling.
  - [`full-chain.test.ts`](file:///d:/oneshot_e2e/tests_ts/full-chain.test.ts): Complete canonical chain execution to `DONE`.
  - [`harness.ts`](file:///d:/oneshot_e2e/tests_ts/harness.ts): Test harness helpers and fixture factories.
  - [`help-request.test.ts`](file:///d:/oneshot_e2e/tests_ts/help-request.test.ts): Tests missing information root cause and targeted help requests.
  - [`intent-collection.test.ts`](file:///d:/oneshot_e2e/tests_ts/intent-collection.test.ts): Tests multi-turn intent accumulation and Prompt readiness.
  - [`intent-http.test.ts`](file:///d:/oneshot_e2e/tests_ts/intent-http.test.ts): Tests conversational HTTP endpoints (`/api/conversations/*`).
  - [`provider.test.ts`](file:///d:/oneshot_e2e/tests_ts/provider.test.ts): Tests provider resolution and fallback safety.
  - [`sandbox-admission.test.ts`](file:///d:/oneshot_e2e/tests_ts/sandbox-admission.test.ts): Tests sandbox ingress admission verification.
  - [`sandbox-execution.test.ts`](file:///d:/oneshot_e2e/tests_ts/sandbox-execution.test.ts): Tests sandbox execution, evidence capture, and hash recheck.
  - [`sandbox-negative.test.ts`](file:///d:/oneshot_e2e/tests_ts/sandbox-negative.test.ts): Tests 7 sandbox negative security cases (hash mismatch, timeout, exit code, secrets, resources, network deny).
  - [`server.test.ts`](file:///d:/oneshot_e2e/tests_ts/server.test.ts): Tests HTTP REST and SSE streaming endpoints.
  - [`skill-system.test.ts`](file:///d:/oneshot_e2e/tests_ts/skill-system.test.ts): Tests dynamic skill discovery, exact resolution, activation, and tool binding.
  - [`task-management.test.ts`](file:///d:/oneshot_e2e/tests_ts/task-management.test.ts): Tests append-only event store, replay, and audit projections.

### 11. `ui/` — Frontend Visualization Layer
* [`ui/index.html`](file:///d:/oneshot_e2e/ui/index.html): Clean dashboard HTML structure with responsive layout.
* [`ui/app.css`](file:///d:/oneshot_e2e/ui/app.css): Dark-mode CSS styles with CSS variables and responsive grids.
* [`ui/app.js`](file:///d:/oneshot_e2e/ui/app.js): SSE event subscriber and reactive DOM renderer displaying live runs, graphs, task events, and hash proofs.

### 12. `deploy/` & `config/` — Deployment Configurations
* [`deploy/docker/docker-compose.local-ai.yml`](file:///d:/oneshot_e2e/deploy/docker/docker-compose.local-ai.yml): Docker compose for Ollama and Redis.
* [`deploy/docker/docker-compose.gpu.yml`](file:///d:/oneshot_e2e/deploy/docker/docker-compose.gpu.yml): GPU-accelerated Ollama compose configuration.
* [`deploy/docker/docker-compose.sandbox.yml`](file:///d:/oneshot_e2e/deploy/docker/docker-compose.sandbox.yml): Isolated sandbox runner container configuration.
* [`deploy/docker/Dockerfile.sandbox`](file:///d:/oneshot_e2e/deploy/docker/Dockerfile.sandbox): Dockerfile for hardened sandbox execution boundary.
* [`config/local-ai.env.example`](file:///d:/oneshot_e2e/config/local-ai.env.example): Environment config for local Ollama + Gemma 2 + Redis.
* [`config/featherless.env.example`](file:///d:/oneshot_e2e/config/featherless.env.example): Environment config for Featherless provider.
* [`config/sandbox.env.example`](file:///d:/oneshot_e2e/config/sandbox.env.example): Environment config for hardened sandbox runtime.

---

## 4. Complete Tool Surface (5 Skills, 26 Callable Tools)

| Skill ID | Tool Name | Runtime Engine | Input Payload | Output / Return Value | Error Modes & Invariants |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`oneshot-canonical-contracts`** | `validate_schema` | Python Subprocess | `{ schema_urn: string, payload: object }` | `{ valid: boolean, errors: string[] }` | Rejects schema mismatches and invalid JSON types. |
| | `validate_artifact` | Python Subprocess | `{ artifact_id: string, artifact: object }` | `{ valid: boolean, errors: string[] }` | Validates Draft 2020-12 schema and Pydantic model parity. |
| | `validate_references` | Python Subprocess | `{ artifact_id: string, artifact: object }` | `{ valid: boolean, errors: string[] }` | Proves all referenced foreign artifact IDs exist. |
| | `validate_parity` | Python Subprocess | `{}` | `{ valid: boolean, checked_models: string[] }` | Proves TypeScript/Python 1:1 model parity. |
| | `validate_registry` | Python Subprocess | `{}` | `{ valid: boolean, registry_entries: number }` | Validates `contract-registry.json` integrity. |
| | `validate_graph` | Python Subprocess | `{}` | `{ valid: boolean, node_count: number }` | Verifies workflow DAG acyclicity and reachability. |
| | `resolve_artifact` | Python Subprocess | `{ run_id: string, artifact_id: string }` | `{ artifact: object }` | Throws if artifact file does not exist in `data/runs/`. |
| | `trace_artifact` | Python Subprocess | `{ run_id: string, artifact_id: string }` | `{ upstream: string[], downstream: string[] }` | Computes full provenance lineage graph. |
| | `run_fixture` | Python Subprocess | `{ fixture: object, plan: object }` | `{ assertion_results: AssertionResult[] }` | Evaluates all 7 assertion operators against target plan. |
| | `canonicalize` | Python Subprocess | `{ value: object }` | `{ canonical_json: string }` | RFC 8785 canonical JSON bytes (`oneshot-jcs-rfc8785-v1`). |
| | `create_hash` | Python Subprocess | `{ core: ConfirmedCore }` | `{ hash: string, algorithm: "sha256" }` | Computes SHA-256 hash of canonicalized core. |
| | `verify_hash` | Python Subprocess | `{ core: ConfirmedCore, hash_proof: HashProof }` | `{ equal: boolean, recomputed_hash: string }` | Proves `created_hash == recomputed_hash`. |
| **`oneshot-task-runtime`** | `project_run` | TypeScript | `{ run_id: string }` | `TaskRunProjection` | Computes step states, timeline, and current progress. |
| | `audit_run` | TypeScript | `{ run_id: string }` | `AuditProjection` | Verifies monotonic ordering and transition legality. |
| | `project_adk_graph` | TypeScript | `{ run_id: string }` | `ADKGraphProjection` | Generates Google ADK Researcher provider subgraph. |
| | `project_authority_graph` | TypeScript | `{ run_id: string }` | `AuthorityGraphProjection` | Generates full Authority $\rightarrow$ Skill $\rightarrow$ Tool DAG. |
| **`oneshot-intent-collection`** | `get_intent` | TypeScript | `{ conversation_id: string }` | `IntentState` | Retrieves intent revision with turn history and provenance. |
| | `project_intent_graph` | TypeScript | `{ conversation_id: string }` | `IntentGraphProjection` | Projects conversational graph, missing fields, and readiness. |
| **`oneshot-sandbox-runtime`** | `verify_admission` | TypeScript | `{ package: ConfirmedPackage, hash: string }` | `{ admitted: boolean, reason?: string }` | Verifies ConfirmedPackage schema and SHA-256 match. |
| | `execute_sandbox` | TypeScript | `SandboxExecutionRequest` | `SandboxExecutionResult` | Executes plan in isolated workspace, records evidence. |
| | `audit_sandbox` | TypeScript | `{ execution_id: string }` | `SandboxAuditReport` | Audits execution evidence, exit codes, and metrics. |
| | `project_sandbox_graph` | TypeScript | `{ execution_id: string }` | `SandboxGraphProjection` | Projects sandbox workspace execution tree. |
| **`oneshot-init`** | `init_workspace` | TypeScript | `{ root_dir?: string }` | `{ initialized_dirs: string[] }` | Provisions `data/runs`, `data/checkpoints`, etc. |
| | `check_preflight` | TypeScript | `{}` | `{ preflight_passed: boolean, checks: object }` | Validates Node $\ge 20$, Python venv, and dependencies. |

---

## 5. Complete Script Execution Runbook

All commands must be executed from the repository root (`d:\oneshot_e2e`).

```bash
# 1. Master verification script (runs dependency check, Python tests, TypeScript compilation, and E2E tests)
python scripts/verify_all.py

# 2. Bootstrap dependencies
python scripts/bootstrap.py                         # Base dependencies + offline npm packages
python scripts/bootstrap.py --with-adk              # With Google ADK + LiteLLM + Ollama
python scripts/bootstrap.py --with-featherless      # With Featherless OpenAI API
python scripts/bootstrap.py --with-workspace-api    # With FastAPI Workspace API sidecar

# 3. Verify dependency versions
python scripts/verify_dependencies.py --profile base
python scripts/verify_dependencies.py --profile adk
python scripts/verify_dependencies.py --profile featherless
python scripts/verify_dependencies.py --profile workspace

# 4. Verify runtime (Python unit tests + Node E2E tests)
python scripts/verify_runtime.py

# 5. Verify Workspace API sidecar
python scripts/verify_workspace_api.py

# 6. Verify file integrity against manifest
python scripts/verify_manifest.py

# 7. Regenerate checksum manifest
python scripts/generate_manifest.py

# 8. Run local Ollama preflight
python scripts/ollama_preflight.py

# 9. Live ADK provider verification (requires Ollama running)
python scripts/verify_adk_live.py

# 10. Live Featherless verification (requires FEATHERLESS_API_KEY)
node scripts/verify_featherless_live.mjs

# 11. Build deterministic zip package
python scripts/build_deterministic_zip.py

# 12. Run TypeScript build & tests directly
npm run build
npm test
npm start                                           # Starts server at http://localhost:8787
```

---

## 6. Development & Pair-Programming Guidelines for AI Agents

When acting as an Antigravity Agent in this codebase, you must strictly follow these rules:

1. **Preserve Canonical Hash Immutability**:
   `confirmed_package.core` is strictly RFC 8785 canonicalized. Never insert runtime execution metadata, logs, or transient timestamps into `confirmed_package.core`.
2. **Respect the Role-Skill Partition**:
   Never convert pipeline roles (`Researcher`, `Planner`, `Refactor`, `GapAnalysis`, `Evaluation`) into generic skills. Roles own workflow responsibility; Skills provide reusable tools.
3. **Strict Validation First**:
   All new contract types must originate from JSON Schema Draft 2020-12 in `schema/`, followed by Pydantic models in `validation/models.py`, followed by TypeScript interfaces in `backend/contract/types.ts`.
4. **No Direct Chat $\rightarrow$ Planner Jump**:
   User input must always flow through `IntentCollectionService`. If information is missing, emit a `ROOT CAUSE` with a structured `help_request`.
5. **No Blind Dependency Installation**:
   Offline npm packages reside in `vendor/npm/`. Node packages must be installed using `npm ci --offline`. Python packages must be pinned in `requirements*.txt`.
6. **Always Verify End-to-End**:
   Before concluding any significant refactoring or feature work, always run `python scripts/verify_all.py` to ensure all Python proofs and TypeScript E2E tests pass.
