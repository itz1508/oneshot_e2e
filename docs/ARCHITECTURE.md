# OneShot Architecture

OneShot is a local-first, human-gated autonomous build pipeline. This document
maps the running system. For the authoritative product behavior, read the
[web app source of truth v3](ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v3.md); for stage
order and artifact ownership, read the [canonical workflow](CANONICAL_WORKFLOW.md);
the ASCII [workflow tree](WORKFLOW_TREE) mirrors the same flow.

All diagrams are Mermaid and render directly on GitHub.

## 1. System view

```mermaid
flowchart LR
    subgraph Browser["Browser — app/web (Next.js App Router → static export in app/web/dist)"]
        UI["Workspace UI: Conversation · Research Review · Build Ready · Task Management · Job History · Explorer"]
        CLIENT["lib/api.ts — HTTP + SSE client"]
    end

    subgraph Node["Node backend (TypeScript, ESM)"]
        SRV["HTTP server, routing, security, path policy (backend/server)"]
        RT["Runtime state (backend/runtime): RunRepository · FileArtifactStore · BuildReviewService · PlanReviewService"]
        WF["Workflow (backend/workflow): canonical transitions + ADK graph (SequentialAgent · LoopAgent · ParallelAgent)"]
        AG["Agents (backend/agents): Researcher · Planner · Refactor · Gap Analysis · Evaluation · Builder"]
        PIP["Pipeline (backend/pipeline): stage queues · checkpoints · recovery · review confirmation"]
        SBX["Sandbox (backend/sandbox): HardenedProcessRunner · ContainerSandboxRunner"]
        SCH["Contracts (backend/schema): JSON schemas + contract registry"]
    end

    subgraph Python["Python services"]
        VAL["Deterministic validators (backend/validation/python): schema · fixture · goal · canonicalization · hashing"]
        RSN["Python reasoner service (backend/python)"]
        WAPI["Workspace API (app/workspace_api — FastAPI)"]
    end

    subgraph External["External"]
        LLM["LLM providers: OpenAI · Anthropic · Gemini · Ollama/Featherless · custom"]
        REDIS["Redis — BullMQ run queue (optional; inline fallback)"]
        TGT["Target workspace (ONESHOT_WORKSPACE_ROOT)"]
        TAV["Tavily (optional research evidence)"]
    end

    UI --> CLIENT --> SRV
    SRV --> RT
    SRV --> WF
    SRV --> PIP
    WF --> AG
    PIP --> AG
    AG -->|"validation RPC"| VAL
    AG -->|"provider adapters (app/web/cloud)"| LLM
    LLM -.->|"optional"| TAV
    AG -.->|"reasoner calls"| RSN
    PIP --> REDIS
    AG --> SBX
    SBX -->|"writes only inside target"| TGT
    SRV --- WAPI
    SCH --- AG
```

Key boundaries:

- The browser consumes and projects real backend records, IDs, events, and
  results. It is never a second workflow store, and missing evidence renders
  as unavailable — never as success.
- Provider credentials stay server-side. The browser submits keys once
  (write-only); secrets are stored outside the repository and never returned
  to the client.
- Sandbox admission checks, workspace path policy, and authentication are
  enforced server-side before any target-workspace access.

## 2. Canonical workflow

Six LLM stages, two mandatory human gates, three deterministic validators,
and one hash-bound build handoff.

```mermaid
flowchart TD
    C["Chat / Intent collection"] --> Q{"Information ready?"}
    Q -- "No: ROOT_CAUSE + targeted help request" --> U["User answers"] --> C
    Q -- "Yes" --> P["Prompt_id"]
    P --> R["1 · Researcher (LLM)"]
    R --> ART["plan_id · schema_id · fixture_id · goal_id · validation_id"]
    ART --> G1["🛑 HUMAN GATE 1 — Research Review<br/>edit sections · request more research · ACCEPT"]
    G1 -- "Accept" --> PL["2 · Planner (LLM) → audit_id"]
    PL --> RF["3 · Refactor (LLM) → same logical plan_id"]
    RF --> GA["4 · Gap Analysis (LLM, ADK LoopAgent: fix → recheck → repeat) → gap_0 + plan_id"]
    GA --> EV["5 · Evaluation (LLM) → plan_id"]
    EV --> T{"Triple Validation — deterministic<br/>independent lanes (ADK ParallelAgent)"}
    T -- "Schema, Fixture, Goal all VALID" --> CONF["CONFIRMED immutable package"]
    T -- "NOT_VALID (eligible)" --> REF["Refinement (up to 3 iterations)"] --> GA
    T -- "Terminal / iterations exhausted" --> F["FAILED"]
    CONF --> H["HASH over confirmed_package.core"]
    H --> G2["🛑 HUMAN GATE 2 — Build Ready<br/>Confirm Build · Cancel/return"]
    G2 -- "Return: run stays waiting, Builder never starts" --> G2
    G2 -- "Confirm Build (hash- and package-bound)" --> B["6 · Builder (LLM) executes exact confirmed package in sandbox"]
    B --> HC{"Execution passed AND<br/>HASH == hash_sandbox?"}
    HC -- "Yes" --> D["✅ DONE"]
    HC -- "No" --> F2["❌ FAILED"]
```

Deterministic guarantees, enforced in code (not by prompt):

- Planner cannot start before Research Review is explicitly accepted, and
  Builder cannot start before Build Ready is explicitly confirmed
  (`wait-build` + `BuildReviewService` rejects stale hash, changed package,
  duplicate approval, and approval after terminal state).
- The confirmation hash covers the canonical comparable representation of
  `confirmed_package.core`; Builder receives that exact package plus hash,
  and post-build verification is a direct equality check, `HASH ==
  hash_sandbox`, computed by the same canonicalization and hashing code.

## 3. Runtime ownership

The backend runtime is authoritative; the browser projects it
([source of truth §4](ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v3.md)).

```mermaid
flowchart LR
    CS["ConversationStore"] --> ICS["IntentCollectionService"]
    AES["AppendOnlyProcessingEventStore"] --> PEB["ProcessingEventBus"]
    PEB --> TM["TaskManagement"]
    PEB --> CKPT["CheckpointStore"]
    RR["RunRepository"]
    FAS["FileArtifactStore"]
    PH["PipelineHistory"]
    Q["BullMQ / Redis pipeline"] --- INLINE["inline fallback runtime (no Redis)"]
    SS["SandboxService"] --> HPR["HardenedProcessRunner"]
    SS --> CSR["ContainerSandboxRunner"]
    UI["Browser UI"] -.->|"projects, read-only"| RR
```

- `JobId` is a display alias for the existing `run_id`; there is exactly one
  run identity per run, never a second run-level job identity.
- Events are append-only; checkpoints and the recovery test scripts
  (`test:pipeline:recovery`, `test:pipeline:checkpoint-recovery`,
  `test:pipeline:refinement-recovery`) cover restart and refinement
  recovery behavior.

## 4. Contracts, validation, and hashing

```mermaid
flowchart LR
    SCHEMA["backend/schema — JSON Schemas + contract registry"] --> ART["Stage artifacts: plan · audit · gap · validation · confirmed package"]
    ART --> CANON["Canonicalization (backend/validation/python)"]
    CANON --> HASH["HASH over confirmed_package.core"]
    HASH --> HANDOFF["Build handoff: exact package + HASH"]
    HANDOFF --> SANDBOX["Sandbox execution"]
    SANDBOX --> H2["hash_sandbox recomputed from the built result"]
    H2 --> CMP{"HASH == hash_sandbox ?"}
    CMP -- "equal" --> DONE["DONE"]
    CMP -- "unequal or missing" --> FAIL["FAILED — rendered as unequal/unavailable, never fabricated"]
```

- Triple Validation is three independent proofs — Schema, Fixture, Goal —
  each returning `VALID | NOT_VALID`; `CONFIRMED` exists only when all
  three are `VALID`.
- Result vocabulary is fixed by contract: workflow operations return
  `PASSED | ROOT_CAUSE`; validation operations return `VALID | NOT_VALID`.
- Refinement after a `NOT_VALID` result is bounded (up to 3 iterations)
  before the run terminates as `FAILED`.

## 5. Deployment view

```mermaid
flowchart TB
    subgraph BuildTime["Build time"]
        NPM["npm run build"] --> TSC["tsc → dist/backend"]
        NPM --> WEB["Next.js build → static export → app/web/dist (bootstrap scripts externalized for CSP)"]
    end
    subgraph Runtime["Runtime — default port 8787"]
        NODE["node dist/backend/index.js — HTTP + SSE APIs and the static UI from app/web/dist"]
        OPT["Optional: Redis + pipeline worker · Python reasoner · container sandbox · FastAPI workspace API (native processes or Docker Compose)"]
    end
    subgraph Ship["Optional shipping"]
        DOCKER["docker/ images and compose files (dev · local · gemma)"]
        CLOUD["Cloud Run deploy + preflight/verify scripts (scripts/deploy-cloud-run.sh)"]
    end
    BuildTime --> Runtime
    Runtime -.-> Ship
```

The production frontend path is Next.js App Router → static export →
`app/web/dist/`, served by the Node backend under the existing Content
Security Policy. The legacy reference console (`app/web/src/`) is retained
for tests and reference; it is not the production entrypoint.

## 6. Where to read next

| Topic | Document |
| --- | --- |
| Product behavior authority | [ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v3.md](ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v3.md) |
| Stage order, ownership, human gates | [CANONICAL_WORKFLOW.md](CANONICAL_WORKFLOW.md) |
| ASCII workflow tree | [WORKFLOW_TREE](WORKFLOW_TREE) |
| Requirement-to-implementation status | [WEB_APP_REQUIREMENTS_RECONCILIATION.md](WEB_APP_REQUIREMENTS_RECONCILIATION.md) |
| Latest verification evidence | [APP_REVIEW.md](APP_REVIEW.md) |
| Submission package · demo video kit | [SUBMISSION.md](SUBMISSION.md) · [DEMO_VIDEO_SCRIPT.md](DEMO_VIDEO_SCRIPT.md) |

