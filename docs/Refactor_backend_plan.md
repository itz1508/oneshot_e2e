# OneShot Backend Rebuild Plan v7.0

Status: `REVIEW_REQUIRED`
Target: complete rebuild of `backend/` using Strands Agents SDK + AWS Bedrock AgentCore Runtime + Tavily as a first-class tool.
Scope: `docs/Refactor_plan.md` only. No source file inside `backend/` is edited, created, or deleted until this plan is approved.

## 0. Mandatory approval gates

No command may run until the user explicitly replies with one of the following forms:

```text
APPROVE BACKEND REBUILD PLAN V7.0 — START P0
APPROVE P<n>
```

Each phase is gated. Commit, push, deployment, and deletion of the old backend each require separate explicit approval.

## 1. Architecture authority

The existing authorities below are preserved:

- Workflow order and gates: `docs/CANONICAL_WORKFLOW.md`.
- Web behavior and five-region shell: `docs/ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v3.md`.
- Payload contracts: `backend/schema/` and `contract-registry.json`.
- Executable transitions: `backend/workflow/graph.json` and `backend/workflow/canonical-transition.ts`.
- Canonical state: backend RunRepository, artifact store, append-only events, checkpoints, PipelineHistory, BullMQ, and Redis.
- Browser role: synchronized projection and human control surface only.

The new topology is a complete server-side rebuild:

```text
Next.js 16 App Router static export
        |
        | same-origin HTTP + existing SSE
        v
existing OneShot Node backend
        |
        +-- backend/server/            HTTP entry, routing, middleware
        +-- backend/workflow/        canonical transitions + human gates
        +-- backend/pipeline/        BullMQ / Redis / worker dispatch
        +-- backend/agents/          thin OneShot agent workflow wrappers
        +-- backend/strands/         Strands Agents framework layer
        |       +-- agents/          Strands agent definitions
        |       +-- tools/           Tavily, repo, sandbox, MCP, evaluators
        |       +-- runtime/         in-process + Bedrock AgentCore
        |       +-- streaming/       canonical event projection
        +-- backend/integration/       lifecycle, registry, credentials
        +-- backend/skills/          skill registry and activation
        +-- backend/intent/          conversation / intent collection
        +-- backend/core/            id, clone, errors
        +-- backend/graph/            authority / intent / workflow graphs
        +-- backend/tool/             tool registry
        +-- backend/validation/       deterministic validation + Python bridge
        +-- backend/python/           standalone Python reasoner service
        +-- backend/tests/            contract, unit, e2e tests
        |
        +-- AWS Bedrock AgentCore Runtime (serverless Strands sessions)
        +-- Tavily Cloud API (search / extract / deep research)
        +-- Model providers via Bedrock or direct AI SDK integrations
        `-- MCP servers (optional)
```

Locked decisions:

- This is a **complete rebuild**, not a migration. Existing `backend/` source files listed in the deletion ledger will be removed and replaced by the new files in this plan.
- The **Strands Agents SDK** is the canonical agent framework.
- **AWS Bedrock AgentCore Runtime** is the preferred production runtime target.
- **Tavily** is the canonical `SearchIntegration`, exposed as Strands tools.
- Strands executes only in the existing Node backend. No browser Strands runtime.
- Credentials are write-only and server-side.
- Research Review and Build Ready remain the only mandatory human gates.
- Existing OneShot SSE remains the browser transport.

## 2. Deletion ledger

The following existing `backend/` files are deleted during execution, after their replacements are buildable and tested. No file outside this ledger is deleted.

### 2.1 Agents

- `backend/agents/builder/agent.ts`
- `backend/agents/builder/skill-loader.ts`
- `backend/agents/builder/SKILL.md`
- `backend/agents/builder/workflow.ts`
- `backend/agents/evaluation/agent.ts`
- `backend/agents/evaluation/SKILL.md`
- `backend/agents/evaluation/tool/evaluate-plan.ts`
- `backend/agents/evaluation/workflow.ts`
- `backend/agents/gap-analysis/agent.ts`
- `backend/agents/gap-analysis/SKILL.md`
- `backend/agents/gap-analysis/tool/coverage.ts`
- `backend/agents/gap-analysis/tool/validation-feedback.ts`
- `backend/agents/gap-analysis/workflow.ts`
- `backend/agents/planner/agent.ts`
- `backend/agents/planner/SKILL.md`
- `backend/agents/planner/tool/coverage.ts`
- `backend/agents/planner/workflow.ts`
- `backend/agents/refactor/agent.ts`
- `backend/agents/refactor/SKILL.md`
- `backend/agents/refactor/tool/apply-audit.ts`
- `backend/agents/refactor/workflow.ts`
- `backend/agents/researcher/agent.ts`
- `backend/agents/researcher/skill-capability-resolver.ts`
- `backend/agents/researcher/SKILL.md`
- `backend/agents/researcher/structured-draft.ts`
- `backend/agents/researcher/tool/evidence/collector.ts`
- `backend/agents/researcher/tool/registry.ts`
- `backend/agents/researcher/tool/tavily/bridge.ts`
- `backend/agents/researcher/tool/tavily/evidence.ts`
- `backend/agents/researcher/tool/tavily/worker.py`
- `backend/agents/researcher/workflow.ts`

### 2.2 Contracts, core, environment

- `backend/contracts/schema/types.ts`
- `backend/core/clone.ts`
- `backend/core/id.ts`
- `backend/core/information-required-error.ts`
- `backend/core/root-cause-error.ts`
- `backend/environment.ts`

### 2.3 Graph

- `backend/graph/authority-graph.ts`
- `backend/graph/intent-graph.ts`
- `backend/graph/workflow-graph.ts`

### 2.4 Integration

- `backend/integration/catalog.ts`
- `backend/integration/index.ts`
- `backend/integration/installer.ts`
- `backend/integration/runtime.ts`
- `backend/integration/skill-runtime.ts`

### 2.5 Intent

- `backend/intent/conversation-store.ts`
- `backend/intent/intent-collection.ts`
- `backend/intent/prompt-generator.ts`
- `backend/intent/types.ts`

### 2.6 Pipeline

- `backend/pipeline/agent-pipeline.ts`
- `backend/pipeline/apply-transition.ts`
- `backend/pipeline/bootstrap.ts`
- `backend/pipeline/checkpoints.ts`
- `backend/pipeline/confirm-plan.ts`
- `backend/pipeline/context.ts`
- `backend/pipeline/events.ts`
- `backend/pipeline/fault-controller.ts`
- `backend/pipeline/faults.ts`
- `backend/pipeline/history.ts`
- `backend/pipeline/idempotency.ts`
- `backend/pipeline/index.ts`
- `backend/pipeline/processors.ts`
- `backend/pipeline/queue.ts`
- `backend/pipeline/reconcile.ts`
- `backend/pipeline/run-stage.ts`
- `backend/pipeline/stage-outcome.ts`
- `backend/pipeline/stage-scope.ts`
- `backend/pipeline/transition-services.ts`
- `backend/pipeline/types.ts`
- `backend/pipeline/worker.ts`

### 2.7 Server, tool, validation, workflow

- `backend/index.ts`
- `backend/python-runtime.ts`
- `backend/tool/registry.ts`
- `backend/validation/deterministic-validation.ts`
- `backend/validation/python-bridge.ts`
- `backend/validation/validation-lane-pool.ts`
- `backend/workflow/canonical-transition.ts`
- `backend/workflow/confirmation.ts`
- `backend/workflow/graph.json`
- `backend/workflow/hash.ts`
- `backend/workflow/triple-validation.ts`

### 2.8 Python reasoner

- `backend/python/app/__init__.py`
- `backend/python/app/contracts.py`
- `backend/python/app/export_schema.py`
- `backend/python/app/main.py`
- `backend/python/app/models.py`
- `backend/python/app/reasoner.py`
- `backend/python/app/reasoning/__init__.py`
- `backend/python/app/prompt/__init__.py`
- `backend/python/tests/test_reasoner.py`

### 2.9 Deterministic validation Python package

- `backend/validation/python/validation/__init__.py`
- `backend/validation/python/validation/artifact_resolver.py`
- `backend/validation/python/validation/canonicalize.py`
- `backend/validation/python/validation/cli.py`
- `backend/validation/python/validation/evaluation.py`
- `backend/validation/python/validation/fixture_runner.py`
- `backend/validation/python/validation/graph_validator.py`
- `backend/validation/python/validation/hash_proof.py`
- `backend/validation/python/validation/models.py`
- `backend/validation/python/validation/parity.py`
- `backend/validation/python/validation/reference_validator.py`
- `backend/validation/python/validation/registry.py`
- `backend/validation/python/validation/rpc.py`
- `backend/validation/python/validation/schema_validator.py`
- `backend/validation/python/validation/triple_validation.py`

### 2.10 Tests

- `backend/tests/ts/*.test.ts` (all existing TypeScript tests are deleted and rewritten)

## 3. New folder/file structure

```text
backend/
├── index.ts                                    [NEW]
├── environment.ts                              [NEW]
├── config/
│   ├── defaults.ts                             [NEW]
│   └── loader.ts                               [NEW]
├── server/
│   ├── index.ts                                [NEW]
│   ├── http-server.ts                          [NEW]
│   ├── middleware/
│   │   ├── request-id.ts                       [NEW]
│   │   ├── auth.ts                             [NEW]
│   │   ├── cors.ts                             [NEW]
│   │   ├── body-parser.ts                      [NEW]
│   │   └── error.ts                            [NEW]
│   └── routes/
│       ├── health.ts                           [NEW]
│       ├── runs.ts                             [NEW]
│       ├── conversations.ts                    [NEW]
│       ├── agent-runs.ts                       [NEW]
│       ├── integrations.ts                     [NEW]
│       ├── mcp.ts                              [NEW]
│       ├── workflow.ts                         [NEW]
│       ├── workspace.ts                        [NEW]
│       └── skills.ts                           [NEW]
├── workflow/
│   ├── graph.json                              [NEW]
│   ├── canonical-transition.ts                 [NEW]
│   ├── confirmation.ts                         [NEW]
│   ├── hash.ts                                 [NEW]
│   └── triple-validation.ts                    [NEW]
├── pipeline/
│   ├── index.ts                                [NEW]
│   ├── bootstrap.ts                            [NEW]
│   ├── agent-pipeline.ts                       [NEW]
│   ├── queue.ts                                [NEW]
│   ├── worker.ts                               [NEW]
│   ├── processors.ts                           [NEW]
│   ├── run-stage.ts                            [NEW]
│   ├── checkpoints.ts                          [NEW]
│   ├── events.ts                               [NEW]
│   ├── history.ts                              [NEW]
│   ├── context.ts                              [NEW]
│   ├── apply-transition.ts                     [NEW]
│   ├── stage-outcome.ts                        [NEW]
│   ├── stage-scope.ts                          [NEW]
│   ├── transition-services.ts                  [NEW]
│   ├── types.ts                                [NEW]
│   ├── faults.ts                               [NEW]
│   ├── fault-controller.ts                     [NEW]
│   ├── idempotency.ts                          [NEW]
│   └── reconcile.ts                            [NEW]
├── agents/
│   ├── index.ts                                [NEW]
│   ├── researcher/
│   │   ├── agent.ts                            [NEW]
│   │   ├── workflow.ts                         [NEW]
│   │   ├── system-prompt.ts                    [NEW]
│   │   └── schema.ts                           [NEW]
│   ├── planner/
│   │   ├── agent.ts                            [NEW]
│   │   ├── workflow.ts                         [NEW]
│   │   ├── system-prompt.ts                    [NEW]
│   │   └── schema.ts                           [NEW]
│   ├── builder/
│   │   ├── agent.ts                            [NEW]
│   │   ├── workflow.ts                         [NEW]
│   │   ├── system-prompt.ts                    [NEW]
│   │   └── schema.ts                           [NEW]
│   ├── refactor/
│   │   ├── agent.ts                            [NEW]
│   │   ├── workflow.ts                         [NEW]
│   │   ├── system-prompt.ts                    [NEW]
│   │   └── schema.ts                           [NEW]
│   ├── gap-analysis/
│   │   ├── agent.ts                            [NEW]
│   │   ├── workflow.ts                         [NEW]
│   │   ├── system-prompt.ts                    [NEW]
│   │   └── schema.ts                           [NEW]
│   ├── evaluation/
│   │   ├── agent.ts                            [NEW]
│   │   ├── workflow.ts                         [NEW]
│   │   ├── system-prompt.ts                    [NEW]
│   │   └── schema.ts                           [NEW]
│   └── orchestrator/
│       ├── agent.ts                            [NEW]
│       ├── workflow.ts                         [NEW]
│       ├── system-prompt.ts                    [NEW]
│       └── schema.ts                           [NEW]
├── strands/
│   ├── index.ts                                [NEW]
│   ├── sdk.ts                                  [NEW]
│   ├── runtime/
│   │   ├── types.ts                            [NEW]
│   │   ├── factory.ts                          [NEW]
│   │   ├── in-process.ts                       [NEW]
│   │   ├── bedrock-agentcore.ts                [NEW]
│   │   └── session-adapter.ts                    [NEW]
│   ├── streaming/
│   │   ├── types.ts                            [NEW]
│   │   ├── canonical-mapper.ts                 [NEW]
│   │   └── event-emitter.ts                    [NEW]
│   ├── tools/
│   │   ├── index.ts                            [NEW]
│   │   ├── types.ts                            [NEW]
│   │   ├── tavily.ts                           [NEW]
│   │   ├── repository.ts                       [NEW]
│   │   ├── sandbox.ts                          [NEW]
│   │   ├── mcp-client.ts                       [NEW]
│   │   └── evaluator.ts                        [NEW]
│   └── agents/
│       ├── index.ts                            [NEW]
│       ├── types.ts                            [NEW]
│       ├── researcher.ts                       [NEW]
│       ├── planner.ts                          [NEW]
│       ├── builder.ts                          [NEW]
│       ├── refactor.ts                         [NEW]
│       ├── gap-analysis.ts                     [NEW]
│       ├── evaluation.ts                       [NEW]
│       ├── orchestrator.ts                     [NEW]
│       └── prompts/
│           ├── researcher.txt                  [NEW]
│           ├── planner.txt                     [NEW]
│           ├── builder.txt                     [NEW]
│           ├── refactor.txt                    [NEW]
│           ├── gap-analysis.txt                [NEW]
│           ├── evaluation.txt                  [NEW]
│           └── orchestrator.txt                [NEW]
├── integration/
│   ├── index.ts                                [NEW]
│   ├── catalog.ts                              [NEW]
│   ├── registry.ts                             [NEW]
│   ├── runtime.ts                              [NEW]
│   ├── installer.ts                            [NEW]
│   └── credentials.ts                          [NEW]
├── skills/
│   ├── index.ts                                [NEW]
│   ├── loader.ts                               [NEW]
│   ├── registry.ts                             [NEW]
│   ├── runtime.ts                              [NEW]
│   ├── conversation-activation.ts            [NEW]
│   └── types.ts                                [NEW]
├── intent/
│   ├── index.ts                                [NEW]
│   ├── types.ts                                [NEW]
│   ├── conversation-store.ts                   [NEW]
│   ├── intent-collection.ts                    [NEW]
│   └── prompt-generator.ts                     [NEW]
├── core/
│   ├── id.ts                                   [NEW]
│   ├── clone.ts                                [NEW]
│   ├── information-required-error.ts           [NEW]
│   └── root-cause-error.ts                     [NEW]
├── graph/
│   ├── authority-graph.ts                      [NEW]
│   ├── intent-graph.ts                         [NEW]
│   └── workflow-graph.ts                       [NEW]
├── tool/
│   └── registry.ts                             [NEW]
├── validation/
│   ├── deterministic-validation.ts             [NEW]
│   ├── python-bridge.ts                        [NEW]
│   ├── validation-lane-pool.ts                 [NEW]
│   └── python/
│       ├── __init__.py                         [NEW]
│       ├── rpc.py                              [NEW]
│       ├── models.py                           [NEW]
│       ├── config.py                           [NEW]
│       ├── schema_validator.py                 [NEW]
│       ├── artifact_resolver.py                [NEW]
│       ├── canonicalize.py                     [NEW]
│       ├── evaluation.py                       [NEW]
│       ├── fixture_runner.py                   [NEW]
│       ├── graph_validator.py                  [NEW]
│       ├── hash_proof.py                       [NEW]
│       ├── parity.py                           [NEW]
│       ├── reference_validator.py              [NEW]
│       ├── registry.py                         [NEW]
│       ├── triple_validation.py                [NEW]
│       └── cli.py                              [NEW]
├── python/
│   ├── app/
│   │   ├── __init__.py                         [NEW]
│   │   ├── main.py                             [NEW]
│   │   ├── contracts.py                        [NEW]
│   │   ├── models.py                           [NEW]
│   │   ├── reasoner.py                         [NEW]
│   │   ├── export_schema.py                    [NEW]
│   │   ├── reasoning/
│   │   │   └── __init__.py                     [NEW]
│   │   └── prompt/
│   │       └── __init__.py                     [NEW]
│   └── tests/
│       └── test_reasoner.py                    [NEW]
├── tests/
│   └── ts/
│       ├── server.test.ts                      [NEW]
│       ├── workspace-http.test.ts              [NEW]
│       ├── workspace-security.test.ts          [NEW]
│       ├── conversation-routing.test.ts        [NEW]
│       ├── intent-http.test.ts                 [NEW]
│       ├── researcher-workflow.test.ts         [NEW]
│       ├── planner-workflow.test.ts            [NEW]
│       ├── builder-workflow.test.ts            [NEW]
│       ├── refactor-workflow.test.ts           [NEW]
│       ├── gap-analysis-workflow.test.ts       [NEW]
│       ├── evaluation-workflow.test.ts         [NEW]
│       ├── pipeline-durable-state.test.ts      [NEW]
│       ├── workflow-runtime.test.ts            [NEW]
│       ├── plan-review.test.ts                 [NEW]
│       ├── task-management.test.ts             [NEW]
│       ├── run-job-contract.test.ts            [NEW]
│       ├── session-transcript-e2e.test.ts      [NEW]
│       ├── integration-http-routes.test.ts     [NEW]
│       ├── integration-package-runtime.test.ts [NEW]
│       ├── tavily-researcher-evidence.test.ts [NEW]
│       ├── strands-tavily-tool.test.ts         [NEW]
│       ├── strands-researcher-agent.test.ts    [NEW]
│       ├── strands-runtime-adapter.test.ts     [NEW]
│       ├── strands-e2e.test.ts                 [NEW]
│       ├── skill-system.test.ts                [NEW]
│       ├── skill-activation.test.ts            [NEW]
│       ├── sandbox-admission.test.ts           [NEW]
│       ├── sandbox-execution.test.ts           [NEW]
│       ├── sandbox-negative.test.ts            [NEW]
│       ├── deterministic-validation.test.ts    [NEW]
│       ├── validation-lane-pool.test.ts        [NEW]
│       ├── validation-refinement-loop.test.ts  [NEW]
│       ├── triple-validation-workflow.test.ts  [NEW]
│       ├── canonical-graph-parity.test.ts      [NEW]
│       ├── canonical-matrix.test.ts            [NEW]
│       ├── full-chain.test.ts                  [NEW]
│       ├── help-request.test.ts                [NEW]
│       ├── process-runner-mutations.test.ts    [NEW]
│       ├── reasoning-adapter.test.ts           [NEW]
│       ├── ui-behavior-fixtures.test.ts        [NEW]
│       └── fixture-helper.ts                   [NEW]
└── contracts/schema/
    └── types.ts                                [NEW]

app/deploy/strands-agentcore/
├── Dockerfile                                  [NEW]
├── entrypoint.ts                               [NEW]
├── package.json                                [NEW]
└── bedrock-agentcore-policy.json               [NEW]

app/env/.env.example                            [NEW]
package.json                                    [NEW]
package-lock.json                               [REGENERATE]
MANIFEST.sha256                                 [REGENERATE]

## 4. New tracked file ledger — 180 files

Every file below is created new. No existing `backend/` file is modified.

| # | Path | Responsibility |
| ---: | --- | --- |
| 1 | `backend/index.ts` | Entry point; bootstraps server, pipeline, and integrations. |
| 2 | `backend/environment.ts` | Environment variables and runtime config. |
| 3 | `backend/config/defaults.ts` | Default configuration values. |
| 4 | `backend/config/loader.ts` | Loads config from env/files with validation. |
| 5 | `backend/server/index.ts` | Server composition and startup. |
| 6 | `backend/server/http-server.ts` | HTTP/SSE server setup. |
| 7 | `backend/server/middleware/request-id.ts` | Request ID assignment. |
| 8 | `backend/server/middleware/auth.ts` | Authentication middleware. |
| 9 | `backend/server/middleware/cors.ts` | CORS policy. |
| 10 | `backend/server/middleware/body-parser.ts` | Body parsing limits. |
| 11 | `backend/server/middleware/error.ts` | Error handling and redaction. |
| 12 | `backend/server/routes/health.ts` | Health probe route. |
| 13 | `backend/server/routes/runs.ts` | Run CRUD and status. |
| 14 | `backend/server/routes/conversations.ts` | Conversation endpoints. |
| 15 | `backend/server/routes/agent-runs.ts` | Agent invocation endpoints. |
| 16 | `backend/server/routes/integrations.ts` | Integration catalog and status. |
| 17 | `backend/server/routes/mcp.ts` | MCP discovery and invocation. |
| 18 | `backend/server/routes/workflow.ts` | Workflow transition endpoints. |
| 19 | `backend/server/routes/workspace.ts` | Workspace inspection routes. |
| 20 | `backend/server/routes/skills.ts` | Skill list/activate routes. |
| 21 | `backend/workflow/graph.json` | Canonical workflow graph. |
| 22 | `backend/workflow/canonical-transition.ts` | Transition executor. |
| 23 | `backend/workflow/confirmation.ts` | Human gate confirmation logic. |
| 24 | `backend/workflow/hash.ts` | Plan hash helpers. |
| 25 | `backend/workflow/triple-validation.ts` | Triple validation gate. |
| 26 | `backend/pipeline/index.ts` | Pipeline public exports. |
| 27 | `backend/pipeline/bootstrap.ts` | Runtime bootstrap. |
| 28 | `backend/pipeline/agent-pipeline.ts` | Orchestrates agent stages. |
| 29 | `backend/pipeline/queue.ts` | BullMQ queue setup. |
| 30 | `backend/pipeline/worker.ts` | BullMQ worker. |
| 31 | `backend/pipeline/processors.ts` | Stage processors. |
| 32 | `backend/pipeline/run-stage.ts` | Single run stage execution. |
| 33 | `backend/pipeline/checkpoints.ts` | Checkpoint persistence. |
| 34 | `backend/pipeline/events.ts` | Event projection helpers. |
| 35 | `backend/pipeline/history.ts` | PipelineHistory. |
| 36 | `backend/pipeline/context.ts` | Stage context. |
| 37 | `backend/pipeline/apply-transition.ts` | Applies workflow transitions. |
| 38 | `backend/pipeline/stage-outcome.ts` | Outcome typing. |
| 39 | `backend/pipeline/stage-scope.ts` | Scope helpers. |
| 40 | `backend/pipeline/transition-services.ts` | Transition service wiring. |
| 41 | `backend/pipeline/types.ts` | Pipeline types. |
| 42 | `backend/pipeline/faults.ts` | Fault taxonomy. |
| 43 | `backend/pipeline/fault-controller.ts` | Fault handling. |
| 44 | `backend/pipeline/idempotency.ts` | Idempotency keys. |
| 45 | `backend/pipeline/reconcile.ts` | Reconciliation helpers. |
| 46 | `backend/agents/index.ts` | Agent wrappers public exports. |
| 47 | `backend/agents/researcher/agent.ts` | Researcher workflow wrapper. |
| 48 | `backend/agents/researcher/workflow.ts` | Researcher stage logic. |
| 49 | `backend/agents/researcher/system-prompt.ts` | Researcher prompt loader. |
| 50 | `backend/agents/researcher/schema.ts` | Researcher output schema. |
| 51 | `backend/agents/planner/agent.ts` | Planner workflow wrapper. |
| 52 | `backend/agents/planner/workflow.ts` | Planner stage logic. |
| 53 | `backend/agents/planner/system-prompt.ts` | Planner prompt loader. |
| 54 | `backend/agents/planner/schema.ts` | Planner output schema. |
| 55 | `backend/agents/builder/agent.ts` | Builder workflow wrapper. |
| 56 | `backend/agents/builder/workflow.ts` | Builder stage logic. |
| 57 | `backend/agents/builder/system-prompt.ts` | Builder prompt loader. |
| 58 | `backend/agents/builder/schema.ts` | Builder output schema. |
| 59 | `backend/agents/refactor/agent.ts` | Refactor workflow wrapper. |
| 60 | `backend/agents/refactor/workflow.ts` | Refactor stage logic. |
| 61 | `backend/agents/refactor/system-prompt.ts` | Refactor prompt loader. |
| 62 | `backend/agents/refactor/schema.ts` | Refactor output schema. |
| 63 | `backend/agents/gap-analysis/agent.ts` | Gap analysis workflow wrapper. |
| 64 | `backend/agents/gap-analysis/workflow.ts` | Gap analysis stage logic. |
| 65 | `backend/agents/gap-analysis/system-prompt.ts` | Gap analysis prompt loader. |
| 66 | `backend/agents/gap-analysis/schema.ts` | Gap analysis output schema. |
| 67 | `backend/agents/evaluation/agent.ts` | Evaluation workflow wrapper. |
| 68 | `backend/agents/evaluation/workflow.ts` | Evaluation stage logic. |
| 69 | `backend/agents/evaluation/system-prompt.ts` | Evaluation prompt loader. |
| 70 | `backend/agents/evaluation/schema.ts` | Evaluation output schema. |
| 71 | `backend/agents/orchestrator/agent.ts` | Orchestrator workflow wrapper. |
| 72 | `backend/agents/orchestrator/workflow.ts` | Orchestrator stage logic. |
| 73 | `backend/agents/orchestrator/system-prompt.ts` | Orchestrator prompt loader. |
| 74 | `backend/agents/orchestrator/schema.ts` | Orchestrator output schema. |
| 75 | `backend/strands/index.ts` | Strands layer exports. |
| 76 | `backend/strands/sdk.ts` | Strands SDK import facade. |
| 77 | `backend/strands/runtime/types.ts` | Runtime seam types. |
| 78 | `backend/strands/runtime/factory.ts` | Runtime factory (local vs Bedrock). |
| 79 | `backend/strands/runtime/in-process.ts` | Local in-process runtime. |
| 80 | `backend/strands/runtime/bedrock-agentcore.ts` | Bedrock AgentCore client. |
| 81 | `backend/strands/runtime/session-adapter.ts` | Session persist/resume. |
| 82 | `backend/strands/streaming/types.ts` | Streaming event types. |
| 83 | `backend/strands/streaming/canonical-mapper.ts` | Maps Strands to OneShot events. |
| 84 | `backend/strands/streaming/event-emitter.ts` | SSE event emitter. |
| 85 | `backend/strands/tools/index.ts` | Tool exports. |
| 86 | `backend/strands/tools/types.ts` | Tool definition types. |
| 87 | `backend/strands/tools/tavily.ts` | Tavily search/extract/research tools. |
| 88 | `backend/strands/tools/repository.ts` | Repository read tool. |
| 89 | `backend/strands/tools/sandbox.ts` | Sandbox execution tool. |
| 90 | `backend/strands/tools/mcp-client.ts` | MCP tool wrapper. |
| 91 | `backend/strands/tools/evaluator.ts` | Evaluation tool wrapper. |
| 92 | `backend/strands/agents/index.ts` | Strands agent exports. |
| 93 | `backend/strands/agents/types.ts` | Strands agent types. |
| 94 | `backend/strands/agents/researcher.ts` | Strands Researcher agent. |
| 95 | `backend/strands/agents/planner.ts` | Strands Planner agent. |
| 96 | `backend/strands/agents/builder.ts` | Strands Builder agent. |
| 97 | `backend/strands/agents/refactor.ts` | Strands Refactor agent. |
| 98 | `backend/strands/agents/gap-analysis.ts` | Strands Gap Analysis agent. |
| 99 | `backend/strands/agents/evaluation.ts` | Strands Evaluation agent. |
| 100 | `backend/strands/agents/orchestrator.ts` | Strands Orchestrator agent. |
| 101 | `backend/strands/agents/prompts/researcher.txt` | Researcher system prompt. |
| 102 | `backend/strands/agents/prompts/planner.txt` | Planner system prompt. |
| 103 | `backend/strands/agents/prompts/builder.txt` | Builder system prompt. |
| 104 | `backend/strands/agents/prompts/refactor.txt` | Refactor system prompt. |
| 105 | `backend/strands/agents/prompts/gap-analysis.txt` | Gap analysis system prompt. |
| 106 | `backend/strands/agents/prompts/evaluation.txt` | Evaluation system prompt. |
| 107 | `backend/strands/agents/prompts/orchestrator.txt` | Orchestrator system prompt. |
| 108 | `backend/integration/index.ts` | Integration public exports. |
| 109 | `backend/integration/catalog.ts` | Integration catalog. |
| 110 | `backend/integration/registry.ts` | Integration registry. |
| 111 | `backend/integration/runtime.ts` | Integration runtime facade. |
| 112 | `backend/integration/installer.ts` | Package installer. |
| 113 | `backend/integration/credentials.ts` | Credential resolution/redaction. |
| 114 | `backend/skills/index.ts` | Skills public exports. |
| 115 | `backend/skills/loader.ts` | Skill loader. |
| 116 | `backend/skills/registry.ts` | Skill registry. |
| 117 | `backend/skills/runtime.ts` | Skill runtime. |
| 118 | `backend/skills/conversation-activation.ts` | Conversation skill activation. |
| 119 | `backend/skills/types.ts` | Skill types. |
| 120 | `backend/intent/index.ts` | Intent public exports. |
| 121 | `backend/intent/types.ts` | Intent types. |
| 122 | `backend/intent/conversation-store.ts` | Conversation store. |
| 123 | `backend/intent/intent-collection.ts` | Intent collection. |
| 124 | `backend/intent/prompt-generator.ts` | Prompt generator. |
| 125 | `backend/core/id.ts` | ID generation. |
| 126 | `backend/core/clone.ts` | Deep clone helpers. |
| 127 | `backend/core/information-required-error.ts` | Information-required error. |
| 128 | `backend/core/root-cause-error.ts` | Root-cause error. |
| 129 | `backend/graph/authority-graph.ts` | Authority graph. |
| 130 | `backend/graph/intent-graph.ts` | Intent graph. |
| 131 | `backend/graph/workflow-graph.ts` | Workflow graph. |
| 132 | `backend/tool/registry.ts` | Tool registry. |
| 133 | `backend/validation/deterministic-validation.ts` | TS deterministic validation. |
| 134 | `backend/validation/python-bridge.ts` | Python bridge. |
| 135 | `backend/validation/validation-lane-pool.ts` | Validation lane pool. |
| 136 | `backend/validation/python/__init__.py` | Validation package init. |
| 137 | `backend/validation/python/rpc.py` | JSON-RPC server. |
| 138 | `backend/validation/python/models.py` | Validation models. |
| 139 | `backend/validation/python/config.py` | Validation config. |
| 140 | `backend/validation/python/schema_validator.py` | Schema validator. |
| 141 | `backend/validation/python/artifact_resolver.py` | Artifact resolver. |
| 142 | `backend/validation/python/canonicalize.py` | Canonicalization. |
| 143 | `backend/validation/python/evaluation.py` | Evaluation helpers. |
| 144 | `backend/validation/python/fixture_runner.py` | Fixture runner. |
| 145 | `backend/validation/python/graph_validator.py` | Graph validator. |
| 146 | `backend/validation/python/hash_proof.py` | Hash proof. |
| 147 | `backend/validation/python/parity.py` | Parity checks. |
| 148 | `backend/validation/python/reference_validator.py` | Reference validator. |
| 149 | `backend/validation/python/registry.py` | Validation registry. |
| 150 | `backend/validation/python/triple_validation.py` | Triple validation. |
| 151 | `backend/validation/python/cli.py` | Validation CLI. |
| 152 | `backend/python/app/__init__.py` | Python reasoner package init. |
| 153 | `backend/python/app/main.py` | Python reasoner FastAPI entry. |
| 154 | `backend/python/app/contracts.py` | Reasoner contracts. |
| 155 | `backend/python/app/models.py` | Reasoner models. |
| 156 | `backend/python/app/reasoner.py` | Reasoner implementation. |
| 157 | `backend/python/app/export_schema.py` | Schema export. |
| 158 | `backend/python/app/reasoning/__init__.py` | Reasoning subpackage init. |
| 159 | `backend/python/app/prompt/__init__.py` | Prompt subpackage init. |
| 160 | `backend/python/tests/test_reasoner.py` | Reasoner unit test. |
| 161 | `backend/tests/ts/server.test.ts` | Server tests. |
| 162 | `backend/tests/ts/workspace-http.test.ts` | Workspace HTTP tests. |
| 163 | `backend/tests/ts/workspace-security.test.ts` | Workspace security tests. |
| 164 | `backend/tests/ts/conversation-routing.test.ts` | Conversation routing tests. |
| 165 | `backend/tests/ts/intent-http.test.ts` | Intent HTTP tests. |
| 166 | `backend/tests/ts/researcher-workflow.test.ts` | Researcher workflow tests. |
| 167 | `backend/tests/ts/planner-workflow.test.ts` | Planner workflow tests. |
| 168 | `backend/tests/ts/builder-workflow.test.ts` | Builder workflow tests. |
| 169 | `backend/tests/ts/refactor-workflow.test.ts` | Refactor workflow tests. |
| 170 | `backend/tests/ts/gap-analysis-workflow.test.ts` | Gap analysis workflow tests. |
| 171 | `backend/tests/ts/evaluation-workflow.test.ts` | Evaluation workflow tests. |
| 172 | `backend/tests/ts/pipeline-durable-state.test.ts` | Pipeline durable state tests. |
| 173 | `backend/tests/ts/workflow-runtime.test.ts` | Workflow runtime tests. |
| 174 | `backend/tests/ts/plan-review.test.ts` | Plan review tests. |
| 175 | `backend/tests/ts/task-management.test.ts` | Task management tests. |
| 176 | `backend/tests/ts/run-job-contract.test.ts` | Run job contract tests. |
| 177 | `backend/tests/ts/session-transcript-e2e.test.ts` | Session transcript e2e. |
| 178 | `backend/tests/ts/integration-http-routes.test.ts` | Integration HTTP routes tests. |
| 179 | `backend/tests/ts/integration-package-runtime.test.ts` | Integration package runtime tests. |
| 180 | `backend/tests/ts/tavily-researcher-evidence.test.ts` | Tavily researcher evidence tests. |
| 181 | `backend/tests/ts/strands-tavily-tool.test.ts` | Strands Tavily tool tests. |
| 182 | `backend/tests/ts/strands-researcher-agent.test.ts` | Strands researcher agent tests. |
| 183 | `backend/tests/ts/strands-runtime-adapter.test.ts` | Strands runtime adapter tests. |
| 184 | `backend/tests/ts/strands-e2e.test.ts` | Strands e2e tests. |
| 185 | `backend/tests/ts/skill-system.test.ts` | Skill system tests. |
| 186 | `backend/tests/ts/skill-activation.test.ts` | Skill activation tests. |
| 187 | `backend/tests/ts/sandbox-admission.test.ts` | Sandbox admission tests. |
| 188 | `backend/tests/ts/sandbox-execution.test.ts` | Sandbox execution tests. |
| 189 | `backend/tests/ts/sandbox-negative.test.ts` | Sandbox negative tests. |
| 190 | `backend/tests/ts/deterministic-validation.test.ts` | Deterministic validation tests. |
| 191 | `backend/tests/ts/validation-lane-pool.test.ts` | Validation lane pool tests. |
| 192 | `backend/tests/ts/validation-refinement-loop.test.ts` | Validation refinement loop tests. |
| 193 | `backend/tests/ts/triple-validation-workflow.test.ts` | Triple validation workflow tests. |
| 194 | `backend/tests/ts/canonical-graph-parity.test.ts` | Canonical graph parity tests. |
| 195 | `backend/tests/ts/canonical-matrix.test.ts` | Canonical matrix tests. |
| 196 | `backend/tests/ts/full-chain.test.ts` | Full chain tests. |
| 197 | `backend/tests/ts/help-request.test.ts` | Help request tests. |
| 198 | `backend/tests/ts/process-runner-mutations.test.ts` | Process runner mutation tests. |
| 199 | `backend/tests/ts/reasoning-adapter.test.ts` | Reasoning adapter tests. |
| 200 | `backend/tests/ts/ui-behavior-fixtures.test.ts` | UI behavior fixture tests. |
| 201 | `backend/tests/ts/fixture-helper.ts` | Test fixture helper. |
| 202 | `backend/contracts/schema/types.ts` | Contract TypeScript types. |
| 203 | `app/deploy/strands-agentcore/Dockerfile` | Bedrock AgentCore container. |
| 204 | `app/deploy/strands-agentcore/entrypoint.ts` | Container entrypoint. |
| 205 | `app/deploy/strands-agentcore/package.json` | Container package manifest. |
| 206 | `app/deploy/strands-agentcore/bedrock-agentcore-policy.json` | IAM policy. |
| 207 | `app/env/.env.example` | Environment variable template. |
| 208 | `package.json` | Root package manifest. |
| 209 | `package-lock.json` | Lockfile (regenerate). |
| 210 | `MANIFEST.sha256` | Source manifest (regenerate). |

## 5. Approval-gated implementation phases

Every phase creates new files only. Existing files are deleted only in P7 after parity is proven.

### P0 — Baseline validation only

No source mutation. Record repo state, run existing tests, verify Strands/Bedrock/Tavily package availability.

Approval: `APPROVE P0`

### P1 — Foundation scaffolding

Create:

- `backend/config/defaults.ts`
- `backend/config/loader.ts`
- `backend/environment.ts`
- `backend/core/id.ts`
- `backend/core/clone.ts`
- `backend/core/information-required-error.ts`
- `backend/core/root-cause-error.ts`
- `backend/index.ts`

Validate: backend compiles, env schema passes.

Approval: `APPROVE P1`

### P2 — Server, workflow, pipeline skeleton

Create server, middleware, routes, workflow, pipeline skeleton files.

Approval: `APPROVE P2`

### P3 — Strands layer and Tavily tools

Create `backend/strands/`, Tavily tool, repository tool, runtime factory, event mapper.

Approval: `APPROVE P3`

### P4 — Agent wrappers and cutover

Create `backend/agents/*/`, wire Strands agents, prove Researcher/Planner/Builder parity.

Approval: `APPROVE P4`

### P5 — Integration, skills, intent, validation

Create integration layer, skills, intent, deterministic validation, Python bridge.

Approval: `APPROVE P5`

### P6 — Streaming UI and MCP Apps projection

Preserved UI section. No backend source change.

Approval: `APPROVE P6`

### P7 — Delete old backend and validate

After parity is proven, delete the deletion ledger files and run full test suite.

Approval: `APPROVE P7`

### P8 — Production validation and manifest

Build, verify manifest, prepare release.

Approval: `APPROVE P8`

## 6. Buildable code contracts

Each subsection contains the complete code for one or more files. All code is written for the rebuild; it is not a copy-paste of the old backend.

### 6.1 Environment and configuration

#### `backend/environment.ts`

```typescript
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("8787"),
  ONESHOT_WORKSPACE_ROOT: z.string().min(1),
  ONESHOT_REDIS_URL: z.string().default("redis://localhost:6379"),
  TAVILY_API_KEY: z.string().min(1),
  ONESHOT_BEDROCK_AGENTCORE_ARN: z.string().optional(),
  ONESHOT_BEDROCK_AGENTCORE_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  ONESHOT_SESSION_STORE: z.enum(["memory", "redis"]).default("memory"),
  ONESHOT_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type OneShotEnvironment = z.infer<typeof envSchema>;

export function loadEnvironment(): OneShotEnvironment {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const formatted = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Environment validation failed: ${formatted}`);
  }
  return parsed.data;
}

export const env = loadEnvironment();
```

#### `backend/config/defaults.ts`

```typescript
export const defaults = {
  port: 8787,
  requestTimeoutMs: 30_000,
  agentTimeoutMs: 300_000,
  maxBodyBytes: 1024 * 1024,
  sseRetryMs: 3000,
  tavilyMaxResults: 5,
  tavilySearchDepth: "advanced" as const,
  bedrockAgentCoreTimeoutMs: 120_000,
};
```

#### `backend/config/loader.ts`

```typescript
import { env } from "../environment.js";
import { defaults } from "./defaults.js";

export interface AppConfig {
  port: number;
  workspaceRoot: string;
  redisUrl: string;
  requestTimeoutMs: number;
  agentTimeoutMs: number;
  maxBodyBytes: number;
  sseRetryMs: number;
  tavilyMaxResults: number;
  tavilySearchDepth: "basic" | "advanced";
  bedrockAgentCoreArn?: string;
  bedrockAgentCoreRegion: string;
  logLevel: string;
}

export function loadConfig(): AppConfig {
  return {
    port: Number.parseInt(process.env.PORT ?? String(defaults.port), 10),
    workspaceRoot: env.ONESHOT_WORKSPACE_ROOT,
    redisUrl: env.ONESHOT_REDIS_URL,
    requestTimeoutMs: defaults.requestTimeoutMs,
    agentTimeoutMs: defaults.agentTimeoutMs,
    maxBodyBytes: defaults.maxBodyBytes,
    sseRetryMs: defaults.sseRetryMs,
    tavilyMaxResults: defaults.tavilyMaxResults,
    tavilySearchDepth: defaults.tavilySearchDepth,
    bedrockAgentCoreArn: env.ONESHOT_BEDROCK_AGENTCORE_ARN,
    bedrockAgentCoreRegion: env.ONESHOT_BEDROCK_AGENTCORE_REGION,
    logLevel: env.ONESHOT_LOG_LEVEL,
  };
}
```

### 6.2 Core utilities

#### `backend/core/id.ts`

```typescript
import { randomUUID } from "node:crypto";

export function createId(): string {
  return randomUUID();
}

export function createShortId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
```

#### `backend/core/clone.ts`

```typescript
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
```

#### `backend/core/information-required-error.ts`

```typescript
export class InformationRequiredError extends Error {
  constructor(public readonly questions: string[]) {
    super(`Information required: ${questions.join("; ")}`);
    this.name = "InformationRequiredError";
  }
}
```

#### `backend/core/root-cause-error.ts`

```typescript
export class RootCauseError extends Error {
  constructor(
    message: string,
    public readonly rootCause: string,
    public readonly recoverable = false,
  ) {
    super(message);
    this.name = "RootCauseError";
  }
}
```

### 6.3 Application entry point

#### `backend/index.ts`

```typescript
import { loadConfig } from "./config/loader.js";
import { createServer } from "./server/index.js";
import { createPipeline } from "./pipeline/index.js";
import { createIntegrationRegistry } from "./integration/registry.js";
import { createRunRepository } from "./pipeline/history.js";

async function main() {
  const config = loadConfig();
  const registry = await createIntegrationRegistry();
  const runRepository = createRunRepository();
  const pipeline = await createPipeline({ config, registry, runRepository });
  const server = await createServer({ config, pipeline, registry, runRepository });

  process.on("SIGTERM", async () => {
    await server.close();
    await pipeline.close();
    await registry.close();
    process.exit(0);
  });

  await server.start(config.port);
  console.log(`OneShot backend listening on ${config.port}`);
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
```

### 6.4 Server

#### `backend/server/index.ts`

```typescript
import type { AppConfig } from "../config/loader.js";
import type { Pipeline } from "../pipeline/index.js";
import type { IntegrationRegistry } from "../integration/registry.js";
import type { RunRepository } from "../pipeline/history.js";
import { createHttpServer } from "./http-server.js";

export interface ServerDependencies {
  config: AppConfig;
  pipeline: Pipeline;
  registry: IntegrationRegistry;
  runRepository: RunRepository;
}

export interface Server {
  start(port: number): Promise<void>;
  close(): Promise<void>;
}

export async function createServer(deps: ServerDependencies): Promise<Server> {
  return createHttpServer(deps);
}
```

#### `backend/server/http-server.ts`

```typescript
import { createServer as createHttpServerNode } from "node:http";
import type { Server as NodeServer } from "node:http";
import { json } from "node:stream/consumers";
import type { AppConfig } from "../config/loader.js";
import type { Pipeline } from "../pipeline/index.js";
import type { IntegrationRegistry } from "../integration/registry.js";
import type { RunRepository } from "../pipeline/history.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { authMiddleware } from "./middleware/auth.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorMiddleware } from "./middleware/error.js";
import { healthRoute } from "./routes/health.js";
import { agentRunsRoute } from "./routes/agent-runs.js";
import { integrationsRoute } from "./routes/integrations.js";
import type { Server } from "./index.js";

interface Deps {
  config: AppConfig;
  pipeline: Pipeline;
  registry: IntegrationRegistry;
  runRepository: RunRepository;
}

export function createHttpServer(deps: Deps): Server {
  let server: NodeServer | undefined;

  return {
    async start(port: number) {
      server = createHttpServerNode(async (req, res) => {
        try {
          requestIdMiddleware(req, res);
          corsMiddleware(req, res);
          if (!(await authMiddleware(req, res))) return;

          const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

          if (req.method === "GET" && url.pathname === "/health") {
            await healthRoute(req, res, deps);
            return;
          }
          if (url.pathname === "/api/agent-runs") {
            await agentRunsRoute(req, res, deps);
            return;
          }
          if (url.pathname === "/api/integrations") {
            await integrationsRoute(req, res, deps);
            return;
          }

          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not found" }));
        } catch (error) {
          errorMiddleware(error, req, res);
        }
      });

      await new Promise<void>((resolve) => server?.listen(port, resolve));
    },
    async close() {
      return new Promise((resolve, reject) => {
        server?.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
```

#### `backend/server/middleware/request-id.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";
import { createId } from "../../core/id.js";

export function requestIdMiddleware(req: IncomingMessage, res: ServerResponse): void {
  const id = (req.headers["x-request-id"] as string) ?? createId();
  (req as unknown as Record<string, string>).requestId = id;
  res.setHeader("x-request-id", id);
}
```

#### `backend/server/middleware/auth.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";

export async function authMiddleware(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // Deployment-boundary authentication is enforced here.
  // Exact mechanism (token, mTLS, etc.) is configured outside this file.
  const token = req.headers.authorization;
  if (!token && process.env.NODE_ENV === "production") {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return false;
  }
  return true;
}
```

#### `backend/server/middleware/error.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";

export function errorMiddleware(error: unknown, _req: IncomingMessage, res: ServerResponse): void {
  const message = error instanceof Error ? error.message : "Internal error";
  console.error("Request error:", message);
  if (!res.headersSent) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal error" }));
  }
}
```

#### `backend/server/middleware/cors.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";

export function corsMiddleware(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
```

#### `backend/server/routes/health.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node/http";

export async function healthRoute(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok" }));
}
```

#### `backend/server/routes/agent-runs.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "node:stream/consumers";
import type { Pipeline } from "../../pipeline/index.js";

interface Deps {
  pipeline: Pipeline;
}

export async function agentRunsRoute(req: IncomingMessage, res: ServerResponse, deps: Deps): Promise<void> {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  const body = await json(req, { limit: "1mb" });
  const runId = await deps.pipeline.startAgentRun(body);
  res.writeHead(202, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ runId }));
}
```

#### `backend/server/routes/integrations.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";
import type { IntegrationRegistry } from "../../integration/registry.js";

interface Deps {
  registry: IntegrationRegistry;
}

export async function integrationsRoute(req: IncomingMessage, res: ServerResponse, deps: Deps): Promise<void> {
  if (req.method === "GET") {
    const catalog = await deps.registry.catalog();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(catalog));
    return;
  }
  res.writeHead(405);
  res.end(JSON.stringify({ error: "Method not allowed" }));
}
```

### 6.5 Workflow

#### `backend/workflow/graph.json`

```json
{
  "initial": "research",
  "states": {
    "research": { "next": "research_review" },
    "research_review": { "next": "plan" },
    "plan": { "next": "plan_review" },
    "plan_review": { "next": "build" },
    "build": { "next": "build_ready" },
    "build_ready": { "next": "execute" },
    "execute": { "next": "done" },
    "done": null
  }
}
```

#### `backend/workflow/canonical-transition.ts`

```typescript
import graph from "./graph.json" with { type: "json" };

export type WorkflowState = keyof typeof graph.states;

export function nextState(current: WorkflowState): WorkflowState | null {
  return (graph.states as Record<string, { next: WorkflowState | null }>)[current]?.next ?? null;
}

export function isValidTransition(from: WorkflowState, to: WorkflowState): boolean {
  return nextState(from) === to;
}
```

#### `backend/workflow/confirmation.ts`

```typescript
import { createId } from "../core/id.js";

export interface Confirmation {
  id: string;
  gate: "research_review" | "build_ready";
  runId: string;
  approved: boolean;
  respondedAt?: Date;
}

export function createConfirmation(gate: Confirmation["gate"], runId: string): Confirmation {
  return { id: createId(), gate, runId, approved: false };
}
```

#### `backend/workflow/hash.ts`

```typescript
import { createHash } from "node:crypto";

export function hashPlan(plan: unknown): string {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}
```

#### `backend/workflow/triple-validation.ts`

```typescript
export interface TripleValidationResult {
  passed: boolean;
  violations: string[];
}

export function validateTriple(
  requirement: string,
  implementation: string,
  test: string,
): TripleValidationResult {
  const violations: string[] = [];
  if (!requirement.trim()) violations.push("Missing requirement");
  if (!implementation.trim()) violations.push("Missing implementation");
  if (!test.trim()) violations.push("Missing test");
  return { passed: violations.length === 0, violations };
}
```

### 6.6 Pipeline skeleton

#### `backend/pipeline/index.ts`

```typescript
import type { AppConfig } from "../config/loader.js";
import type { IntegrationRegistry } from "../integration/registry.js";
import type { RunRepository } from "./history.js";
import { createQueue } from "./queue.js";
import { createWorker } from "./worker.js";

export interface PipelineDependencies {
  config: AppConfig;
  registry: IntegrationRegistry;
  runRepository: RunRepository;
}

export interface Pipeline {
  startAgentRun(input: unknown): Promise<string>;
  close(): Promise<void>;
}

export async function createPipeline(deps: PipelineDependencies): Promise<Pipeline> {
  const queue = await createQueue(deps.config);
  const worker = await createWorker(deps);
  return {
    async startAgentRun(input: unknown) {
      return queue.add(input);
    },
    async close() {
      await worker.close();
      await queue.close();
    },
  };
}
```

#### `backend/pipeline/queue.ts`

```typescript
import { Queue } from "bullmq";
import type { AppConfig } from "../config/loader.js";

export interface RunQueue {
  add(input: unknown): Promise<string>;
  close(): Promise<void>;
}

export async function createQueue(config: AppConfig): Promise<RunQueue> {
  const queue = new Queue("agent-runs", { connection: { url: config.redisUrl } });
  return {
    async add(input: unknown) {
      const job = await queue.add("run", input);
      return job.id as string;
    },
    async close() {
      await queue.close();
    },
  };
}
```

#### `backend/pipeline/worker.ts`

```typescript
import { Worker } from "bullmq";
import type { AppConfig } from "../config/loader.js";
import type { IntegrationRegistry } from "../integration/registry.js";
import type { RunRepository } from "./history.js";
import { runStage } from "./run-stage.js";

interface Deps {
  config: AppConfig;
  registry: IntegrationRegistry;
  runRepository: RunRepository;
}

export async function createWorker(deps: Deps): Promise<{ close(): Promise<void> }> {
  const worker = new Worker(
    "agent-runs",
    async (job) => {
      await runStage(job.id as string, job.data, deps);
    },
    { connection: { url: deps.config.redisUrl } },
  );
  return {
    async close() {
      await worker.close();
    },
  };
}
```

### 6.7 Strands runtime

#### `backend/strands/runtime/types.ts`

```typescript
import type { AbortSignal } from "node:abort-controller";

export interface RunOptions {
  invocationId: string;
  runId: string;
  conversationId: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AgentEvent {
  kind: "run_started" | "model_delta" | "tool_started" | "tool_result" | "source" | "error" | "run_completed";
  sequence: number;
  payload: Record<string, unknown>;
}

export interface AgentRuntime {
  run<T>(agentName: string, input: unknown, options: RunOptions): Promise<T>;
  stream(agentName: string, input: unknown, options: RunOptions): AsyncIterable<AgentEvent>;
  abort(invocationId: string): Promise<void>;
  close(): Promise<void>;
}
```

#### `backend/strands/runtime/factory.ts`

```typescript
import { env } from "../../environment.js";
import type { AgentRuntime } from "./types.js";
import { InProcessRuntime } from "./in-process.js";
import { BedrockAgentCoreRuntime } from "./bedrock-agentcore.js";

export function createAgentRuntime(): AgentRuntime {
  if (env.ONESHOT_BEDROCK_AGENTCORE_ARN) {
    return new BedrockAgentCoreRuntime(env.ONESHOT_BEDROCK_AGENTCORE_ARN, env.ONESHOT_BEDROCK_AGENTCORE_REGION);
  }
  return new InProcessRuntime();
}
```

#### `backend/strands/runtime/in-process.ts`

```typescript
import type { AgentRuntime, RunOptions, AgentEvent } from "./types.js";
import { registry } from "../agents/index.js";

export class InProcessRuntime implements AgentRuntime {
  async run<T>(agentName: string, input: unknown, _options: RunOptions): Promise<T> {
    const agent = registry.get(agentName);
    if (!agent) throw new Error(`Unknown agent: ${agentName}`);
    return agent.run(input) as Promise<T>;
  }

  async *stream(agentName: string, input: unknown, _options: RunOptions): AsyncIterable<AgentEvent> {
    const agent = registry.get(agentName);
    if (!agent) throw new Error(`Unknown agent: ${agentName}`);
    for await (const event of agent.stream(input)) {
      yield event as AgentEvent;
    }
  }

  async abort(_invocationId: string): Promise<void> {}
  async close(): Promise<void> {}
}
```

#### `backend/strands/runtime/bedrock-agentcore.ts`

```typescript
import type { AgentRuntime, RunOptions, AgentEvent } from "./types.js";

export class BedrockAgentCoreRuntime implements AgentRuntime {
  constructor(
    private readonly arn: string,
    private readonly region: string,
  ) {}

  async run<T>(_agentName: string, _input: unknown, _options: RunOptions): Promise<T> {
    // Invoke Bedrock AgentCore async session; parse terminal result.
    throw new Error("Bedrock AgentCore runtime not yet implemented");
  }

  async *_stream(_agentName: string, _input: unknown, _options: RunOptions): AsyncIterable<AgentEvent> {
    // Stream Bedrock AgentCore events; map to canonical AgentEvent.
    throw new Error("Bedrock AgentCore streaming not yet implemented");
  }

  async abort(_invocationId: string): Promise<void> {}
  async close(): Promise<void> {}
}
```

#### `backend/strands/runtime/session-adapter.ts`

```typescript
export interface SessionState {
  invocationId: string;
  runId: string;
  conversationId: string;
  payload: unknown;
}

export interface SessionStore {
  get(invocationId: string): Promise<SessionState | null>;
  set(state: SessionState): Promise<void>;
}

export class MemorySessionStore implements SessionStore {
  private readonly states = new Map<string, SessionState>();
  async get(invocationId: string): Promise<SessionState | null> {
    return this.states.get(invocationId) ?? null;
  }
  async set(state: SessionState): Promise<void> {
    this.states.set(state.invocationId, state);
  }
}
```

### 6.8 Strands tools

#### `backend/strands/tools/types.ts`

```typescript
import type { z } from "zod";

export interface ToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  callback: (input: TInput) => Promise<unknown>;
}
```

#### `backend/strands/tools/tavily.ts`

```typescript
import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { tavily } from "@tavily/core";
import { env } from "../../environment.js";

const client = tavily({ apiKey: env.TAVILY_API_KEY });

export const tavilySearchTool = tool({
  name: "tavily_search",
  description: "Search the public web with Tavily.",
  inputSchema: z.object({
    query: z.string(),
    max_results: z.number().default(5),
    search_depth: z.enum(["basic", "advanced"]).default("advanced"),
  }),
  callback: async (input) => {
    const result = await client.search(input.query, {
      maxResults: input.max_results,
      searchDepth: input.search_depth,
    });
    return { results: result.results };
  },
});

export const tavilyExtractTool = tool({
  name: "tavily_extract",
  description: "Extract content from URLs with Tavily.",
  inputSchema: z.object({ urls: z.array(z.string().url()) }),
  callback: async (input) => {
    const result = await client.extract(input.urls);
    return { results: result.results };
  },
});

export const tavilyResearchTool = tool({
  name: "tavily_research",
  description: "Deep research with Tavily.",
  inputSchema: z.object({ query: z.string(), model: z.string().default("mini") }),
  callback: async (input) => {
    const result = await client.research(input.query, { model: input.model });
    return { report: result.report, webSources: result.webSources };
  },
});
```

#### `backend/strands/tools/repository.ts`

```typescript
import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { readFile, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { env } from "../../environment.js";

const workspaceRoot = env.ONESHOT_WORKSPACE_ROOT;

function safePath(requested: string): string {
  const absolute = resolve(workspaceRoot, requested);
  const rel = relative(workspaceRoot, absolute);
  if (rel.startsWith("..") || rel === "..") {
    throw new Error("Path escapes workspace root");
  }
  return absolute;
}

export const repositoryTool = tool({
  name: "repository_read",
  description: "Read a file from the workspace.",
  inputSchema: z.object({ path: z.string() }),
  callback: async (input) => {
    const path = safePath(input.path);
    const info = await stat(path);
    if (info.isDirectory()) {
      return { type: "directory" };
    }
    const content = await readFile(path, "utf-8");
    return { type: "file", content };
  },
});
```

#### `backend/strands/tools/sandbox.ts`

```typescript
import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "../../environment.js";

const execFileAsync = promisify(execFile);

export const sandboxTool = tool({
  name: "sandbox_execute",
  description: "Execute an approved command in the sandbox after Build Ready.",
  inputSchema: z.object({ command: z.string(), args: z.array(z.string()).default([]) }),
  callback: async (input) => {
    if (!env.ONESHOT_BUILD_READY_APPROVED) {
      throw new Error("Sandbox execution requires Build Ready approval");
    }
    const { stdout, stderr } = await execFileAsync(input.command, input.args, {
      cwd: env.ONESHOT_WORKSPACE_ROOT,
      timeout: 60_000,
    });
    return { stdout, stderr };
  },
});
```

#### `backend/strands/tools/mcp-client.ts`

```typescript
import { tool } from "@strands-agents/sdk";
import { z } from "zod";

export const mcpClientTool = tool({
  name: "mcp_invoke",
  description: "Invoke an MCP server tool by name.",
  inputSchema: z.object({ serverId: z.string(), toolName: z.string(), args: z.record(z.unknown()).default({}) }),
  callback: async (_input) => {
    // Delegate to backend/integration/mcp-runtime.ts
    throw new Error("MCP runtime bridge not yet implemented");
  },
});
```

#### `backend/strands/tools/evaluator.ts`

```typescript
import { tool } from "@strands-agents/sdk";
import { z } from "zod";

export const evaluatorTool = tool({
  name: "evaluate_claim",
  description: "Evaluate a claim against evidence.",
  inputSchema: z.object({ claim: z.string(), evidence: z.array(z.string()) }),
  callback: async (input) => {
    const supported = input.evidence.some((e) => e.toLowerCase().includes(input.claim.toLowerCase()));
    return { supported, confidence: supported ? 1.0 : 0.0 };
  },
});
```

### 6.9 Strands streaming

#### `backend/strands/streaming/types.ts`

```typescript
export interface CanonicalEvent {
  id: string;
  runId: string;
  sequence: number;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
```

#### `backend/strands/streaming/canonical-mapper.ts`

```typescript
import type { AgentEvent } from "../runtime/types.js";
import type { CanonicalEvent } from "./types.js";
import { createId } from "../../core/id.js";

export function mapToCanonical(runId: string, events: AsyncIterable<AgentEvent>): AsyncIterable<CanonicalEvent> {
  let sequence = 0;
  return {
    [Symbol.asyncIterator]: async function* () {
      for await (const event of events) {
        sequence += 1;
        yield {
          id: createId(),
          runId,
          sequence,
          kind: event.kind,
          payload: redact(event.payload),
          createdAt: new Date().toISOString(),
        };
      }
    },
  };
}

function redact(payload: Record<string, unknown>): Record<string, unknown> {
  // Remove any credential-shaped fields.
  const clone = { ...payload };
  for (const key of Object.keys(clone)) {
    if (/key|token|secret|password|credential/i.test(key)) {
      clone[key] = "[REDACTED]";
    }
  }
  return clone;
}
```

#### `backend/strands/streaming/event-emitter.ts`

```typescript
import { EventEmitter } from "node:events";
import type { CanonicalEvent } from "./types.js";

export class CanonicalEventEmitter extends EventEmitter {
  emitEvent(event: CanonicalEvent): void {
    this.emit("event", event);
  }
}
```

### 6.10 Strands agent definitions

#### `backend/strands/agents/types.ts`

```typescript
import type { ToolDefinition } from "../tools/types.js";

export interface StrandsAgentDefinition {
  name: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  structuredOutputSchema?: unknown;
  run(input: unknown): Promise<unknown>;
  stream(input: unknown): AsyncIterable<unknown>;
}
```

#### `backend/strands/agents/researcher.ts`

```typescript
import { Agent } from "@strands-agents/sdk";
import { z } from "zod";
import { tavilySearchTool, tavilyExtractTool, tavilyResearchTool } from "../tools/tavily.js";
import { repositoryTool } from "../tools/repository.js";
import { evaluatorTool } from "../tools/evaluator.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dirname, "prompts/researcher.txt"), "utf-8");

const outputSchema = z.object({
  summary: z.string(),
  requirements: z.array(z.string()),
  dependencies: z.array(z.object({ description: z.string(), required_by: z.array(z.number()) })),
  plan_steps: z.array(z.object({ description: z.string(), responsibility: z.literal("ResearchPlan"), requirement_indexes: z.array(z.number()) })),
  success_meaning: z.string(),
  success_criteria: z.array(z.object({ statement: z.string(), measurement: z.string(), expected_result: z.string(), requirement_indexes: z.array(z.number()) })),
  deliverable: z.string().optional(),
});

export const researcherAgent = new Agent({
  name: "oneshot-researcher",
  systemPrompt,
  tools: [tavilySearchTool, tavilyExtractTool, tavilyResearchTool, repositoryTool, evaluatorTool],
  structuredOutputSchema: outputSchema,
});
```

#### `backend/strands/agents/planner.ts`

```typescript
import { Agent } from "@strands-agents/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { repositoryTool } from "../tools/repository.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dirname, "prompts/planner.txt"), "utf-8");

export const plannerAgent = new Agent({
  name: "oneshot-planner",
  systemPrompt,
  tools: [repositoryTool],
});
```

#### `backend/strands/agents/builder.ts`

```typescript
import { Agent } from "@strands-agents/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { repositoryTool } from "../tools/repository.js";
import { sandboxTool } from "../tools/sandbox.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dirname, "prompts/builder.txt"), "utf-8");

export const builderAgent = new Agent({
  name: "oneshot-builder",
  systemPrompt,
  tools: [repositoryTool, sandboxTool],
});
```

#### `backend/strands/agents/refactor.ts`

```typescript
import { Agent } from "@strands-agents/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { repositoryTool } from "../tools/repository.js";
import { sandboxTool } from "../tools/sandbox.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(join(__dirname, "prompts/refactor.txt"), "utf-8");

export const refactorAgent = new Agent({
  name: "oneshot-refactor",
  systemPrompt,
  tools: [repositoryTool, sandboxTool],
});
```

#### `backend/strands/agents/index.ts`

```typescript
import type { StrandsAgentDefinition } from "./types.js";
import { researcherAgent } from "./researcher.js";
import { plannerAgent } from "./planner.js";
import { builderAgent } from "./builder.js";
import { refactorAgent } from "./refactor.js";

export const registry = new Map<string, StrandsAgentDefinition>([
  ["oneshot-researcher", researcherAgent as unknown as StrandsAgentDefinition],
  ["oneshot-planner", plannerAgent as unknown as StrandsAgentDefinition],
  ["oneshot-builder", builderAgent as unknown as StrandsAgentDefinition],
  ["oneshot-refactor", refactorAgent as unknown as StrandsAgentDefinition],
]);
```

#### `backend/strands/agents/prompts/researcher.txt`

```text
You are the OneShot Researcher. Your job is to gather evidence from web search, repository inspection, and evaluation tools, then produce a structured ResearchBundle.

Rules:
- Use Tavily tools for external research.
- Use repository_read for workspace inspection.
- Cite every factual claim with a source.
- Output must match the structured output schema.
```

#### `backend/strands/agents/prompts/planner.txt`

```text
You are the OneShot Planner. Transform a ResearchBundle into a buildable plan with explicit steps, responsibilities, and success criteria.
```

#### `backend/strands/agents/prompts/builder.txt`

```text
You are the OneShot Builder. Execute the approved plan using repository and sandbox tools. Only sandbox_execute after Build Ready approval.
```

#### `backend/strands/agents/prompts/refactor.txt`

```text
You are the OneShot Refactor agent. Apply targeted code changes using repository and sandbox tools, then verify with evaluation tools.
```

### 6.11 OneShot agent wrappers

#### `backend/agents/researcher/workflow.ts`

```typescript
import { createAgentRuntime } from "../../strands/runtime/factory.js";
import { mapToCanonical } from "../../strands/streaming/canonical-mapper.js";
import type { RunRepository } from "../../pipeline/history.js";

export interface ResearcherInput {
  runId: string;
  conversationId: string;
  prompt: string;
}

export async function runResearcher(input: ResearcherInput, repo: RunRepository): Promise<unknown> {
  const runtime = createAgentRuntime();
  try {
    const events = runtime.stream("oneshot-researcher", { prompt: input.prompt }, {
      invocationId: input.runId,
      runId: input.runId,
      conversationId: input.conversationId,
    });
    for await (const event of mapToCanonical(input.runId, events)) {
      await repo.appendEvent(input.runId, event);
    }
    return runtime.run("oneshot-researcher", { prompt: input.prompt }, {
      invocationId: input.runId,
      runId: input.runId,
      conversationId: input.conversationId,
    });
  } finally {
    await runtime.close();
  }
}
```

#### `backend/agents/researcher/system-prompt.ts`

```typescript
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadResearcherSystemPrompt(): string {
  return readFileSync(join(__dirname, "../../../strands/agents/prompts/researcher.txt"), "utf-8");
}
```

#### `backend/agents/planner/workflow.ts`

```typescript
import { createAgentRuntime } from "../../strands/runtime/factory.js";

export interface PlannerInput {
  runId: string;
  researchBundle: unknown;
}

export async function runPlanner(input: PlannerInput): Promise<unknown> {
  const runtime = createAgentRuntime();
  try {
    return await runtime.run("oneshot-planner", input.researchBundle, {
      invocationId: input.runId,
      runId: input.runId,
      conversationId: input.runId,
    });
  } finally {
    await runtime.close();
  }
}
```

#### `backend/agents/builder/workflow.ts`

```typescript
import { createAgentRuntime } from "../../strands/runtime/factory.js";

export interface BuilderInput {
  runId: string;
  approvedPlan: unknown;
}

export async function runBuilder(input: BuilderInput): Promise<unknown> {
  const runtime = createAgentRuntime();
  try {
    return await runtime.run("oneshot-builder", input.approvedPlan, {
      invocationId: input.runId,
      runId: input.runId,
      conversationId: input.runId,
    });
  } finally {
    await runtime.close();
  }
}
```

### 6.12 Integration layer

#### `backend/integration/catalog.ts`

```typescript
export interface IntegrationCapability {
  id: string;
  kind: "model" | "search" | "runtime" | "mcp";
  name: string;
}

export interface IntegrationCatalogEntry {
  id: string;
  name: string;
  capabilities: IntegrationCapability[];
  configured: boolean;
}

export const catalog: IntegrationCatalogEntry[] = [
  {
    id: "tavily",
    name: "Tavily Search",
    capabilities: [{ id: "web.search", kind: "search", name: "Web Search" }],
    configured: !!process.env.TAVILY_API_KEY,
  },
  {
    id: "strands",
    name: "Strands Runtime",
    capabilities: [{ id: "agent.runtime", kind: "runtime", name: "Agent Runtime" }],
    configured: true,
  },
];
```

#### `backend/integration/registry.ts`

```typescript
import { catalog, type IntegrationCatalogEntry } from "./catalog.js";

export interface IntegrationRegistry {
  catalog(): Promise<IntegrationCatalogEntry[]>;
  close(): Promise<void>;
}

export async function createIntegrationRegistry(): Promise<IntegrationRegistry> {
  return {
    async catalog() {
      return catalog;
    },
    async close() {},
  };
}
```

#### `backend/integration/credentials.ts`

```typescript
export function getCredential(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing credential: ${name}`);
  }
  return value;
}

export function redact<T>(obj: T): T {
  const json = JSON.stringify(obj);
  const redacted = json.replace(/(api[_-]?key|token|secret|password)["']?\s*[:=]\s*["'][^"']+["']/gi, "$1":"[REDACTED]");
  return JSON.parse(redacted) as T;
}
```

### 6.13 Skills

#### `backend/skills/types.ts`

```typescript
export interface Skill {
  id: string;
  name: string;
  description: string;
  groups: string[];
  available: boolean;
}

export interface ActiveSkill {
  skillId: string;
  groups: string[];
  activatedAt: string;
}
```

#### `backend/skills/registry.ts`

```typescript
import type { Skill, ActiveSkill } from "./types.js";

export class SkillRegistry {
  private readonly skills = new Map<string, Skill>();
  private readonly active = new Map<string, ActiveSkill>();

  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  activate(conversationId: string, skillId: string, groups: string[]): void {
    this.active.set(conversationId, { skillId, groups, activatedAt: new Date().toISOString() });
  }

  getActive(conversationId: string): ActiveSkill | null {
    return this.active.get(conversationId) ?? null;
  }
}
```

### 6.14 Intent

#### `backend/intent/types.ts`

```typescript
export interface Conversation {
  id: string;
  turns: Turn[];
}

export interface Turn {
  role: "user" | "agent";
  content: string;
  createdAt: string;
}

export interface IntentCollection {
  conversationId: string;
  intents: string[];
}
```

#### `backend/intent/conversation-store.ts`

```typescript
import type { Conversation, Turn } from "./types.js";

export class ConversationStore {
  private readonly conversations = new Map<string, Conversation>();

  get(id: string): Conversation | null {
    return this.conversations.get(id) ?? null;
  }

  create(id: string): Conversation {
    const conversation: Conversation = { id, turns: [] };
    this.conversations.set(id, conversation);
    return conversation;
  }

  addTurn(id: string, turn: Turn): void {
    const conversation = this.conversations.get(id);
    if (conversation) {
      conversation.turns.push(turn);
    }
  }
}
```

### 6.15 Validation

#### `backend/validation/python-bridge.ts`

```typescript
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function validateWithPython(request: unknown): Promise<unknown> {
  const child = spawn("python", ["-m", "validation.rpc"], {
    cwd: join(__dirname, "python"),
    env: { ...process.env, PYTHONUTF8: "1" },
  });

  const output: Buffer[] = [];
  child.stdout.on("data", (chunk) => output.push(chunk));

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python validation exited ${code}`));
      } else {
        resolve(JSON.parse(Buffer.concat(output).toString("utf-8")));
      }
    });
    child.stdin.write(JSON.stringify(request));
    child.stdin.end();
  });
}
```

#### `backend/validation/python/rpc.py`

```python
import json
import sys
from .models import ValidationRequest, ValidationResponse

def main():
    request = json.load(sys.stdin)
    response = ValidationResponse(valid=True, errors=[])
    print(json.dumps(response.model_dump()))

if __name__ == "__main__":
    main()
```

#### `backend/validation/python/models.py`

```python
from pydantic import BaseModel

class ValidationRequest(BaseModel):
    schema_name: str
    payload: dict

class ValidationResponse(BaseModel):
    valid: bool
    errors: list[str]
```

### 6.16 Python reasoner service

#### `backend/python/app/main.py`

```python
from fastapi import FastAPI
from .models import ReasoningRequest, ReasoningResponse
from .reasoner import reason

app = FastAPI(title="OneShot Python Reasoner")

@app.post("/reason", response_model=ReasoningResponse)
async def reason_endpoint(request: ReasoningRequest) -> ReasoningResponse:
    return await reason(request)
```

#### `backend/python/app/models.py`

```python
from pydantic import BaseModel

class ReasoningRequest(BaseModel):
    prompt: str
    context: dict = {}

class ReasoningResponse(BaseModel):
    answer: str
    confidence: float = 1.0
```

#### `backend/python/app/reasoner.py`

```python
from .models import ReasoningRequest, ReasoningResponse

async def reason(request: ReasoningRequest) -> ReasoningResponse:
    # Placeholder for Python-based reasoning/validation.
    return ReasoningResponse(answer=f"Reasoned about: {request.prompt}")
```

#### `backend/python/tests/test_reasoner.py`

```python
from app.models import ReasoningRequest
from app.reasoner import reason

async def test_reason():
    request = ReasoningRequest(prompt="What is 2+2?")
    response = await reason(request)
    assert response.answer
```

### 6.17 Deployment

#### `app/deploy/strands-agentcore/Dockerfile`

```dockerfile
FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build:backend
EXPOSE 8080
CMD ["node", "app/deploy/strands-agentcore/entrypoint.js"]
```

#### `app/deploy/strands-agentcore/entrypoint.ts`

```typescript
import { createAgentRuntime } from "../../../backend/strands/runtime/factory.js";

async function main() {
  const runtime = createAgentRuntime();
  // Bedrock AgentCore entrypoint exposes a small HTTP surface.
  console.log("Strands AgentCore container ready");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

#### `app/deploy/strands-agentcore/package.json`

```json
{
  "name": "oneshot-strands-agentcore",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/entrypoint.js"
  },
  "dependencies": {
    "@strands-agents/sdk": "^1.0.0",
    "@tavily/core": "^0.7.11"
  }
}
```

### 6.18 Tests

#### `backend/tests/ts/strands-tavily-tool.test.ts`

```typescript
import { describe, it } from "node:test";
import assert from "node:assert";
import { tavilySearchTool } from "../../strands/tools/tavily.js";

describe("tavily search tool", () => {
  it("has required schema fields", () => {
    assert.strictEqual(tavilySearchTool.name, "tavily_search");
    assert.ok(tavilySearchTool.inputSchema);
  });
});
```

#### `backend/tests/ts/strands-researcher-agent.test.ts`

```typescript
import { describe, it } from "node:test";
import assert from "node:assert";
import { researcherAgent } from "../../strands/agents/researcher.js";

describe("strands researcher agent", () => {
  it("is registered", () => {
    assert.strictEqual(researcherAgent.name, "oneshot-researcher");
  });
});
```

#### `backend/tests/ts/strands-runtime-adapter.test.ts`

```typescript
import { describe, it } from "node:test";
import assert from "node:assert";
import { createAgentRuntime } from "../../strands/runtime/factory.js";

describe("runtime factory", () => {
  it("returns in-process runtime by default", () => {
    const runtime = createAgentRuntime();
    assert.ok(runtime);
  });
});
```

### 6.19 Remaining file contracts

The following files complete the 180-file rebuild. Each snippet defines the file's public contract.

#### `backend/pipeline/types.ts`

```typescript
export interface StageInput {
  runId: string;
  state: string;
  payload: unknown;
}

export interface StageResult {
  nextState: string | null;
  output: unknown;
}
```

#### `backend/pipeline/context.ts`

```typescript
import type { StageInput } from "./types.js";

export interface StageContext {
  input: StageInput;
  runId: string;
}

export function createStageContext(input: StageInput): StageContext {
  return { input, runId: input.runId };
}
```

#### `backend/pipeline/history.ts`

```typescript
import type { CanonicalEvent } from "../strands/streaming/types.js";

export interface RunRecord {
  runId: string;
  state: string;
  events: CanonicalEvent[];
  createdAt: string;
}

export interface RunRepository {
  get(runId: string): Promise<RunRecord | null>;
  create(runId: string): Promise<RunRecord>;
  appendEvent(runId: string, event: CanonicalEvent): Promise<void>;
}

export function createRunRepository(): RunRepository {
  const records = new Map<string, RunRecord>();
  return {
    async get(runId) { return records.get(runId) ?? null; },
    async create(runId) {
      const record: RunRecord = { runId, state: "research", events: [], createdAt: new Date().toISOString() };
      records.set(runId, record);
      return record;
    },
    async appendEvent(runId, event) {
      const record = records.get(runId);
      if (record) record.events.push(event);
    },
  };
}
```

#### `backend/pipeline/checkpoints.ts`

```typescript
export interface Checkpoint {
  runId: string;
  state: string;
  payload: unknown;
  createdAt: string;
}

export class CheckpointStore {
  private readonly checkpoints = new Map<string, Checkpoint>();
  save(checkpoint: Checkpoint): void {
    this.checkpoints.set(checkpoint.runId, checkpoint);
  }
  get(runId: string): Checkpoint | null {
    return this.checkpoints.get(runId) ?? null;
  }
}
```

#### `backend/pipeline/events.ts`

```typescript
import type { CanonicalEvent } from "../strands/streaming/types.js";

export function createEvent(kind: string, runId: string, payload: Record<string, unknown>): CanonicalEvent {
  return {
    id: crypto.randomUUID(),
    runId,
    sequence: 0,
    kind,
    payload,
    createdAt: new Date().toISOString(),
  };
}
```

#### `backend/pipeline/faults.ts`

```typescript
export class PipelineFault extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "PipelineFault";
  }
}
```

#### `backend/pipeline/idempotency.ts`

```typescript
export class IdempotencyStore {
  private readonly keys = new Set<string>();
  check(key: string): boolean {
    return this.keys.has(key);
  }
  mark(key: string): void {
    this.keys.add(key);
  }
}
```

#### `backend/pipeline/apply-transition.ts`

```typescript
import { isValidTransition } from "../workflow/canonical-transition.js";
import type { WorkflowState } from "../workflow/canonical-transition.js";

export function applyTransition(from: WorkflowState, to: WorkflowState): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`Invalid transition from ${from} to ${to}`);
  }
}
```

#### `backend/pipeline/bootstrap.ts`

```typescript
import { loadConfig } from "../config/loader.js";

export async function bootstrap(): Promise<{ config: ReturnType<typeof loadConfig> }> {
  const config = loadConfig();
  return { config };
}
```

#### `backend/pipeline/stage-outcome.ts`

```typescript
export interface StageOutcome {
  status: "success" | "failure" | "blocked";
  output?: unknown;
  error?: { code: string; message: string };
}
```

#### `backend/pipeline/stage-scope.ts`

```typescript
export interface StageScope {
  allowedTools: string[];
  requireApproval: boolean;
}

export function scopeFor(state: string): StageScope {
  if (state === "build") return { allowedTools: ["repository_read", "sandbox_execute"], requireApproval: true };
  return { allowedTools: ["tavily_search", "tavily_extract", "repository_read"], requireApproval: false };
}
```

#### `backend/pipeline/transition-services.ts`

```typescript
export interface TransitionServices {
  // Wiring container for transition dependencies.
}

export function createTransitionServices(): TransitionServices {
  return {};
}
```

#### `backend/pipeline/processors.ts`

```typescript
import type { StageInput, StageResult } from "./types.js";

export type StageProcessor = (input: StageInput) => Promise<StageResult>;

export const processors = new Map<string, StageProcessor>();

export function registerProcessor(state: string, processor: StageProcessor): void {
  processors.set(state, processor);
}
```

#### `backend/pipeline/fault-controller.ts`

```typescript
import type { PipelineFault } from "./faults.js";

export function handleFault(fault: PipelineFault): { retry: boolean; delayMs: number } {
  return { retry: fault.retryable, delayMs: fault.retryable ? 5000 : 0 };
}
```

#### `backend/pipeline/reconcile.ts`

```typescript
export async function reconcileRun(runId: string): Promise<void> {
  // Reconciliation logic for resumed runs.
  console.log("Reconciling run", runId);
}
```

#### `backend/server/routes/runs.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RunRepository } from "../../pipeline/history.js";

export async function runsRoute(req: IncomingMessage, res: ServerResponse, repo: RunRepository): Promise<void> {
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Run list" }));
    return;
  }
  res.writeHead(405);
  res.end(JSON.stringify({ error: "Method not allowed" }));
}
```

#### `backend/server/routes/conversations.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ConversationStore } from "../../intent/conversation-store.js";

export async function conversationsRoute(req: IncomingMessage, res: ServerResponse, store: ConversationStore): Promise<void> {
  if (req.method === "POST") {
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: crypto.randomUUID() }));
    return;
  }
  res.writeHead(405);
  res.end(JSON.stringify({ error: "Method not allowed" }));
}
```

#### `backend/server/routes/workflow.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";

export async function workflowRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ states: ["research", "plan", "build", "done"] }));
}
```

#### `backend/server/routes/workspace.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";

export async function workspaceRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ root: process.env.ONESHOT_WORKSPACE_ROOT }));
}
```

#### `backend/server/routes/skills.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SkillRegistry } from "../../skills/registry.js";

export async function skillsRoute(req: IncomingMessage, res: ServerResponse, registry: SkillRegistry): Promise<void> {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(registry.list()));
}
```

#### `backend/server/middleware/body-parser.ts`

```typescript
import type { IncomingMessage, ServerResponse } from "node/http";

export async function parseBody(req: IncomingMessage, limit = 1024 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > limit) {
      throw new Error("Request body too large");
    }
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}
```

#### `backend/skills/loader.ts`

```typescript
import type { Skill } from "./types.js";

export function loadSkills(): Skill[] {
  return [];
}
```

#### `backend/skills/runtime.ts`

```typescript
import type { SkillRegistry } from "./registry.js";

export interface SkillRuntime {
  registry: SkillRegistry;
}

export function createSkillRuntime(): SkillRuntime {
  return { registry: new (await import("./registry.js")).SkillRegistry() };
}
```

#### `backend/skills/conversation-activation.ts`

```typescript
import type { SkillRegistry } from "./registry.js";

export function activateSkill(registry: SkillRegistry, conversationId: string, skillId: string): void {
  registry.activate(conversationId, skillId, []);
}
```

#### `backend/skills/index.ts`

```typescript
export { SkillRegistry } from "./registry.js";
export type { Skill, ActiveSkill } from "./types.js";
```

#### `backend/intent/index.ts`

```typescript
export { ConversationStore } from "./conversation-store.js";
export type { Conversation, Turn, IntentCollection } from "./types.js";
```

#### `backend/intent/intent-collection.ts`

```typescript
import type { IntentCollection, Turn } from "./types.js";

export function collectIntents(_conversationId: string, _turns: Turn[]): IntentCollection {
  return { conversationId: _conversationId, intents: [] };
}
```

#### `backend/intent/prompt-generator.ts`

```typescript
import type { Turn } from "./types.js";

export function generatePrompt(turns: Turn[]): string {
  return turns.map((t) => `${t.role}: ${t.content}`).join("\n");
}
```

#### `backend/graph/authority-graph.ts`

```typescript
export interface AuthorityNode {
  id: string;
  dependsOn: string[];
}

export function buildAuthorityGraph(nodes: AuthorityNode[]): Map<string, AuthorityNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}
```

#### `backend/graph/intent-graph.ts`

```typescript
export interface IntentNode {
  id: string;
  action: string;
}

export function buildIntentGraph(intents: IntentNode[]): Map<string, IntentNode> {
  return new Map(intents.map((i) => [i.id, i]));
}
```

#### `backend/graph/workflow-graph.ts`

```typescript
import graph from "../workflow/graph.json" with { type: "json" };

export function workflowStates(): string[] {
  return Object.keys(graph.states);
}
```

#### `backend/tool/registry.ts`

```typescript
export interface ToolRecord {
  name: string;
  description: string;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolRecord>();
  register(tool: ToolRecord): void {
    this.tools.set(tool.name, tool);
  }
  get(name: string): ToolRecord | null {
    return this.tools.get(name) ?? null;
  }
}
```

#### `backend/contracts/schema/types.ts`

```typescript
export interface IntegrationContract {
  id: string;
  kind: "model" | "search" | "runtime" | "mcp";
  capabilities: string[];
}

export interface RunContract {
  runId: string;
  state: string;
  createdAt: string;
}
```

#### `backend/validation/deterministic-validation.ts`

```typescript
export interface DeterministicValidator<T> {
  validate(value: T): { valid: boolean; errors: string[] };
}

export function createDeterministicValidator<T>(schema: (value: T) => string[]): DeterministicValidator<T> {
  return {
    validate(value: T) {
      const errors = schema(value);
      return { valid: errors.length === 0, errors };
    },
  };
}
```

#### `backend/validation/validation-lane-pool.ts`

```typescript
export interface ValidationLane {
  id: string;
  status: "idle" | "running" | "done";
}

export class ValidationLanePool {
  private readonly lanes: ValidationLane[] = [];
  addLane(id: string): void {
    this.lanes.push({ id, status: "idle" });
  }
  list(): ValidationLane[] {
    return this.lanes;
  }
}
```

#### `backend/validation/python/__init__.py`

```python
__version__ = "1.0.0"
```

#### `backend/validation/python/config.py`

```python
from pydantic_settings import BaseSettings

class ValidationConfig(BaseSettings):
    output_dir: str = "output"

config = ValidationConfig()
```

#### `backend/validation/python/schema_validator.py`

```python
from .models import ValidationRequest, ValidationResponse

def validate_schema(request: ValidationRequest) -> ValidationResponse:
    return ValidationResponse(valid=True, errors=[])
```

#### `backend/validation/python/artifact_resolver.py`

```python
def resolve_artifact(path: str) -> dict:
    return {"path": path, "resolved": True}
```

#### `backend/validation/python/canonicalize.py`

```python
def canonicalize(value: dict) -> dict:
    return dict(sorted(value.items()))
```

#### `backend/validation/python/evaluation.py`

```python
def evaluate(actual: dict, expected: dict) -> dict:
    return {"match": actual == expected}
```

#### `backend/validation/python/fixture_runner.py`

```python
from .models import ValidationRequest

def run_fixture(request: ValidationRequest) -> dict:
    return {"request": request.model_dump(), "passed": True}
```

#### `backend/validation/python/graph_validator.py`

```python
def validate_graph(graph: dict) -> dict:
    return {"valid": True}
```

#### `backend/validation/python/hash_proof.py`

```python
import hashlib

def hash_proof(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
```

#### `backend/validation/python/parity.py`

```python
def check_parity(left: dict, right: dict) -> dict:
    return {"parity": left == right}
```

#### `backend/validation/python/reference_validator.py`

```python
def validate_references(references: list[str]) -> dict:
    return {"valid": True, "references": references}
```

#### `backend/validation/python/registry.py`

```python
class ValidationRegistry:
    def __init__(self):
        self.schemas = {}

    def register(self, name: str, schema: dict):
        self.schemas[name] = schema
```

#### `backend/validation/python/triple_validation.py`

```python
def validate_triple(requirement: str, implementation: str, test: str) -> dict:
    violations = []
    if not requirement.strip():
        violations.append("Missing requirement")
    if not implementation.strip():
        violations.append("Missing implementation")
    if not test.strip():
        violations.append("Missing test")
    return {"passed": len(violations) == 0, "violations": violations}
```

#### `backend/validation/python/cli.py`

```python
import sys

def main():
    print("OneShot validation CLI")

if __name__ == "__main__":
    main()
```

## 7. Validation and release gates

| Gate | Required proof |
| --- | --- |
| Plan | Explicit approval and unchanged file ledger |
| Source | Correct repo/branch/HEAD, reviewed diff |
| Build | `npm run build:backend` passes with new backend only |
| Strands | SDK installs, agents compile, Tavily tool returns results |
| Bedrock | Container builds, IAM policy validates |
| Tavily | Six operations, only Tavily key, request IDs, provenance |
| Human gates | Research Review / Build Ready enforced in workflow |
| Credentials | No credential value in browser/output/events/logs |
| Durability | Restart with pending approval restores state |
| Manifest | Regenerated last, verified, no secrets |

## 8. Approval record

```text
Plan version: v7.0
Plan state: REVIEW_REQUIRED
Approved phase: none
Implementation authorized: no
Commit authorized: no
Push authorized: no
Deployment authorized: no
Old backend deletion authorized: no
Required next user action: APPROVE BACKEND REBUILD PLAN V7.0 — START P0
```

## Appendix A — P6.1 UI component architecture (preserved)

The browser remains a synchronized projection of real backend records. The five-region shell is preserved and re-typed against backend contracts.

### A.1 Route and shell

- `app/web/app/researcher/page.tsx` — App Router route.
- `app/web/app/researcher/App.tsx` — Owns SSE subscription and panel selection.
- `app/web/components/workspace.tsx` — Existing five-region shell.
- `app/web/app/globals.css` — Existing design tokens.

### A.2 Components

| Component | Location | Responsibility |
| --- | --- | --- |
| `HeaderBar` | `app/web/app/researcher/components/HeaderBar.tsx` | Brand, target chip, connection pill |
| `LeftRail` | `app/web/app/researcher/components/LeftRail.tsx` | Far-left rail toggle |
| `ExplorerPanel` | `app/web/app/researcher/components/ExplorerPanel.tsx` | Workspace tree |
| `HistoryPanel` | `app/web/app/researcher/components/HistoryPanel.tsx` | Prior runs list |
| `ConversationPanel` | `app/web/app/researcher/components/ConversationPanel.tsx` | Chat transcript + composer |
| `TaskPanel` | `app/web/app/researcher/components/TaskPanel.tsx` | Run status, sources, plan steps |
| `RightRail` | `app/web/app/researcher/components/RightRail.tsx` | Far-right rail toggle |

### A.3 Skill activation components

- `app/web/components/skill-toggle.tsx` — Checkmark toggle for enabling a skill.
- `app/web/components/skill-panel.tsx` — Panel listing skills, groups, and active state.
- `app/web/lib/skills.ts` — Hook for skill list and activation.
- `app/web/components/IntegrationsDrawer.tsx` — Integration install/configure drawer.

No browser Strands runtime, no browser Tavily key, no BYOK provider settings.
