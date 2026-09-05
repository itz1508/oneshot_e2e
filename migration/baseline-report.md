# OneShot Backend Migration — Baseline Report

## Git State
- **Branch**: `migration/oneshot-executable-v1`
- **Commit SHA**: `01eaa0728eeea7fd6987ad00ea12dac4ee221e48`

## Node Versions
- **Node.js**: `v24.17.0`
- **TypeScript**: `5.8.3`
- **Python**: Available via `python3` (used by some worker scripts)

## Working Tree State
- Modified files: `.agents/rules/oneshot-skill-architecture.md`, `README.md`, `backend/graph/authority-graph.ts`, `backend/server/http-server.ts`, `backend/tests/ts/provider-config-domain.test.ts`, `backend/tests/ts/provider-http.test.ts`, `backend/tests/ts/provider-infra.test.ts`, `backend/tests/ts/provider-manager.test.ts`, `backend/workflow/adk/node/builder-node.ts`, `backend/workflow/adk/node/evaluation-node.ts`, `backend/workflow/adk/node/gap-analysis-node.ts`, `backend/workflow/adk/node/planner-node.ts`, `backend/workflow/adk/node/refactor-node.ts`, `backend/workflow/adk/node/researcher-node.ts`, `tsconfig.test.json`
- Deleted files: `RUNTIME_CONTAINMENT_IMPLEMENTATION.md`, `backend/role/builder/role.ts`, `backend/role/builder/workflow.ts`, `backend/role/evaluation/role.ts`, `backend/role/evaluation/workflow.ts`, `backend/role/gap-analysis/role.ts`, `backend/role/gap-analysis/workflow.ts`, `backend/role/planner/role.ts`, `backend/role/planner/workflow.ts`, `backend/role/refactor/role.ts`, `backend/role/refactor/workflow.ts`, `backend/role/researcher/role.ts`, `backend/role/researcher/workflow.ts`
- Deleted docs: `docs/ADK_GEMMA2_INTEGRATION.md`, `docs/architecture/phase-1-completion.md`, `docs/architecture/phase-2-completion.md`, `docs/architecture/repository-migration-inventory.md`
- New files/dirs: `app/host/`, `backend/agent/`, `backend/runtime/provider.ts`, `docs/architecture/MIGRATION_PLAN_REWRITTEN.md`, `docs/architecture/MIGRATION_REPO_AUDIT.md`, `docs/architecture/MIGRATION_SOURCE_INVENTORY.csv`, `provider/`, `provider_new/`

## Existing Repository Structure (Pre-Migration)

### `backend/role/` — Legacy Agent Execution Layout
Contains the following subdirectories, each representing a OneShot Agent workflow component:
- `researcher/` — Researcher agent implementation
- `planner/` — Planner agent implementation
- `refactor/` — Refactor tool (owned by Planner)
- `gap-analysis/` — Gap Analysis tool (owned by Planner)
- `evaluation/` — Evaluation/Validation component
- `builder/` — Builder agent implementation

### `backend/agent/` — Pre-existing Partial Migration (Singular)
Contains preliminary agent subdirectories with `.js` files (appear to be from a previous partial migration attempt):
- `researcher/` — with `workflow.js` and `role.js`
- `planner/` — with `workflow.js` and `role.js`
- `refactor/` — with `workflow.js` and `role.js`
- `gap-analysis/` — with `workflow.js` and `role.js`
- `evaluation/` — with `workflow.js` and `role.js`
- `builder/` — with `workflow.js` and `role.js`

### `backend/agents/` — Canonical Target Directory
- Does not yet exist; will be created as the canonical OneShot Agent implementation location per the migration plan.

## Workflow Execution Flow (Pre-Migration)
```
USER → CHAT → GENERATOR → Prompt_id → RESEARCHER → Researcher(id) → plan_id →
PLANNER → audit_id → REFACTOR / REFINEMENT → updated plan_id → GAP ANALYSIS →
FINAL plan_id → EVALUATION (when applicable) → TRIPLE VALIDATION →
Final_Confirmed_Validation(hash) → PROMOTE → Researcher(id) FINAL → JOB_ID update →
BUILDER → Build Result → Hash Verification → DONE
```

## Key Import References (Pre-Migration)
- `backend/workflow/adk/node/researcher-node.ts` imports `ResearcherWorkflow` from `../../../agent/researcher/workflow.js`
- `backend/workflow/adk/node/planner-node.ts` imports workflows from `../../role/planner/workflow.js`, `../../role/evaluation/workflow.js`, `../../role/gap-analysis/workflow.js`
- `backend/workflow/adk/node/refactor-node.ts` imports from `../../workflow/adk/node/gap-analysis-node.js` and `../../workflow/adk/node/planner-node.js`
- `backend/workflow/adk/node/evaluation-node.ts` imports from `../../role/gap-analysis/tool/validation-feedback.js`, `../../role/builder/workflow.js`
- `backend/workflow/adk/node/builder-node.ts` imports from `../../core/root-cause-error.js`, `../../role/gap-analysis/tool/validation-feedback.js`
- `backend/index.ts` imports from `./role/planner/workflow.js`, `./role/refactor/workflow.js`, `./role/builder/workflow.js`, `./workflow/triple-validation.js`
- `backend/graph/authority-graph.ts` imports Roles from `../agent/...` (e.g., `../agent/researcher/role.js`)
- `backend/pipeline/role-pipeline.ts` — pipeline terminology using "role"

## Pre-Migration Test State
- ADK workflow tests exist for researcher, planner, refactor, gap-analysis, evaluation, builder nodes
- Provider fixture tests and live tests configured
- Triple validation tests exist
- Some test files already modified in the working tree

## Pre-Existing Failures (Recorded Before Migration)
- Some TypeScript compilation issues related to provider imports
- Some test files modified but not yet verified
- Provider API configuration may have inconsistencies

## Migration Constraints (Per Plan)
1. Do not change the OneShot workflow execution order
2. Do not change Agent responsibilities or ownership
3. Do not merge existing Agents
4. Planner owns Refactor and Gap Analysis
5. Evaluator owns Validation
6. Do not create replacement Agents (Analyzer, Executor, Collector, Validator) unless they already exist in approved design
7. Canonical execution workers belong under `backend/agents/`
8. Do not delete source components until target exists, imports migrated, tests pass, behavior verified, no old references remain
9. Do not change schemas, fixtures, artifact IDs, hashes, validation contracts, or workflow state unless required for structural migration
10. Event-bus.ts must not be deleted based solely on architectural preference