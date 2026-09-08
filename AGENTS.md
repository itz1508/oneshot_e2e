# Repository Guidelines — OneShot

> This file is the orientation map for the whole repository. Read it top to bottom to
> navigate every source tree. Paths are relative to the repository root unless marked.

## Orientation

OneShot is a full-stack workspace automation platform: a prompt-driven, six-phase
pipeline (Research → Plan/Refine → Validate → Build) with two explicit human gates
(Research Review, Build Ready), deterministic validation and hashing, and a sandboxed
Builder. The web console, backend runtime, pipeline, validation, workspace API,
container images, installers, and CI all live in this one repository.

Root files: `README.md` (one-click install + agent prompt) · `AGENTS.md` (this file) ·
`package.json` / `package-lock.json` (Node module, `type: module`, Node >=24.13) ·
`tsconfig.json` / `tsconfig.test.json` · `LICENSE` (Apache-2.0) · `MANIFEST.sha256`
(generated source hash manifest) · `start-web.ps1` (primary Windows launcher: builds
and serves the web app on http://localhost:8787; pass `-Sample` for sample mode).
Repository metadata: `.gitignore` · `.gitattributes` · `.dockerignore`.

## Top-level module map

### `.agents/` — agent/skill metadata
- `rules/oneshot-skill-architecture.md` — authoritative rule for agent/skill/tool roles.
- `skills/oneshot-judge/SKILL.md` — judge skill (evaluates the containerized platform
  without external API keys).

### `.github/workflows/` — CI
`adk-v2-verify.yml` · `pipeline-e2e.yml` · `tavily-researcher-verify.yml` ·
`tmp-adk-researcher-node-test.yml`.

### `app/` — deployment, support, frontend
- `env/` — `.env` (local, gitignored) and `.env.example`.
- `bootstrap/` — `demo.mjs`, `readme.ts`, `setup.bat`, `setup.sh`.
- `scripts/` — Python tooling: `generate_manifest.py` (regenerate `MANIFEST.sha256`),
  `verify_manifest.py`, `source_file_policy.py`, `verify_all.py`, `verify_dependencies.py`,
  `build_deterministic_zip.py`, `bootstrap.py`.
- `fixtures/` — product seed fixtures (e.g. `product/complete-success-seed.json`).
- `legal/` — third-party/platform legal notices.
- `requirements/` — pinned Python dependency requirements.
- `vendor/` — vendored artifacts (npm `.tgz` like `typescript`, `@types/node`).
- `deploy/` — deployment helper material.
- `web/` — canonical frontend. `src/` is the plain HTML/CSS/JS console
  (`index.html`, `app.js`, `styles.css`, `oneshot-v8.*` v8 UI, `human-gates.js`,
  `job-history.js`, `task-management.js`, `active-run-panel.js`, `console-interactions.js`,
  `live-activity.js`, `workflow-trace*.js`, `terminal-message.js`, `providers-panel.js`,
  `visual-settings.js`, `runtime-view-state.js`, `run-atmosphere.js`); the Next.js
  app lives under `app/`, `components/`, `lib/` (route, server components, API/projection
  libs) with `next.config.mjs`, `tsconfig.json`, `postcss.config.mjs`; `cloud/` holds the
  provider manager, credential stores, catalog, adapters, and Python workers; `tests/`
  is `node:test`; `scripts/` has `serve.mjs`, `export.mjs`; `dist/`/`out` are build output.
  See `app/web/README.md` and `app/web/cloud/README.md`.
- `workspace_api/` — standalone FastAPI control plane (package `workspace_api`,
  import root `app`, run with `--app-dir app`).

### `backend/` — TypeScript runtime
- `index.ts` — server entrypoint. `environment.ts` — env/config loading.
  `python-runtime.ts` — resolves the Python executable. `requirements-ledger.txt`.
- `schema/` — JSON Schema Draft 2020-12 payload contracts + `contract-registry.json`.
- `workflow/` — canonical workflow: `graph.json`, `canonical-transition.ts`,
  `stage-scope.ts`, plus queue/pipeline glue. Authority: `docs/CANONICAL_WORKFLOW.md`.
- `pipeline/` — BullMQ pipeline: `worker.ts`, `queue.ts`, `processors.ts`,
  `apply-transition.ts`, `confirm-plan.ts`, `context.ts`, `types.ts`, `transition-services.ts`.
- `runtime/` — `workflow-runtime.ts`, `run-repository.ts`, `artifact-store.ts`,
  `plan-review.ts`, `build-review.ts`, `runtime-config.ts`, `target-workspace.ts`.
- `server/` — HTTP/SSE (`http-server.ts`).
- `sandbox/` — execution boundary (`runner/process-runner.ts`, `types.ts`).
- `agents/` — workflow agents, each with `SKILL.md` (researcher, planner, refactor,
  gap-analysis, evaluation, builder). Each agent owns its sub-tools under
  `<agent>/tool/` — e.g. `researcher/tool/{tavily,evidence}` (web-search and
  evidence providers). Instructions stay in the agent `SKILL.md`.
- `skills/` — reusable skills (`init`, `oneshot-canonical-contracts`,
  `oneshot-intent-collection`, `oneshot-task-runtime`, `oneshot-sandbox-runtime`, …).
- `validation/` — deterministic Python validation + hashing; package at
  `validation/python/validation`, import root `backend/validation/python`.
- `intent/` — intent collection. `task/` — task management. `reasoning/` — policy on
  hidden chain-of-thought. `tool/` — tool implementations. `contracts/`, `core/`,
  `graph/` — canonical contracts/core types/graph data.
- `python/` — standalone Python service: own `pyproject.toml`, `Dockerfile`, `app/`,
  `tests/`. `config/`, `typescript/` are (empty) scaffolds.
- `tests/` — `python/` (unittest) and `ts/` (node:test) suites.

### `docker/` — images & compose
`Dockerfile` (prod) · `Dockerfile.dev` · `Dockerfile.gemma` ·
`docker-compose.dev.yml` · `docker-compose.gemma.yml` · `docker-compose.local.yml` ·
`README.md`.

### `scripts/` — launchers & tooling
- `oneshot.mjs` — bootstrap/build/verify/start/IDE entrypoint.
- `judge.mjs`, `judge-launch.ps1`, `judge-launch.sh` — judge launcher.
- `install-e2e.ps1`, `install-e2e.sh`, `installation/` — installers.
- `run-local-oneshot.ps1`, `kill-server.ps1`, `setup-local-adc.ps1`,
  `preflight-local-adc.ps1` — local runners.
- `deploy-cloud-run.sh`, `preflight-cloud-deploy.sh`, `verify-cloud-run.sh`,
  `verify-gemini-models.py` — GCP deploy/verify.
- `verify-local-health.ps1`, `docker-entrypoint-gemma.sh`, `audit-branches.py`,
  `guard/layout.mjs` (layout guard), `smoke/bullmq-redis-smoke.mjs`.
- `e2e/` — genuine browser E2E (`browser/`, `cdp-session.mjs`, `debug-send.mjs`, …).

### `docs/` — documentation
- `CANONICAL_WORKFLOW.md` — authority for workflow order/ownership/gate placement.
- `ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v3.md` — master web-app behavior source of truth.
- `WEB_APP_REQUIREMENTS_RECONCILIATION.md` — requirement↔implementation reconciliation.
- `LLM WorkFlow CALL.txt` — supplied six-phase target sequence.
- `WORKFLOW_TREE` — ASCII workflow map (referenced by README badge).
- `JUDGE_AGENT_PROMPT.txt`, `ONESHOT_APP_REVIEW_HANDOFF.md`.
- `license/` — `LICENSE`, `NOTICE` (bundled into images). `evidence/` — demo artifacts.

## Build, Test, and Development Commands

- `npm run oneshot`: bootstrap, build, verify, start, and open the IDE.
- `npm run build`: `tsc -p tsconfig.json` + `npm --prefix app/web run build`.
- `npm run build:backend` / `npm run build:ui`: build each half individually.
- `npm start`: run the compiled server (`node dist/backend/index.js`). The primary
  launch path on Windows is `.\start-web.ps1` (port, build, sample-mode switches).
- `npm run dev`: run the compiled server with `app/env/.env`.
- `npm run verify`: dependency checks, Python tests, build, serialized Node E2E tests.
- `npm test`: build backend + run compiled Node tests.
- `npm --prefix app/web test`: web tests (`node:test`).
- `python -m unittest discover -s backend/tests/python -p 'test_source_file_policy.py' -v`.
- `python app/scripts/generate_manifest.py` then `python app/scripts/verify_manifest.py`:
  refresh + verify `MANIFEST.sha256` after reviewing the bounded diff.
- Python validation: `PYTHONPATH=backend/validation/python python -m validation.rpc`.
- Workspace API: `uvicorn --app-dir app workspace_api.main:app`.
- Redis/queue: `npm run redis:up` / `redis:down` (Docker compose) ; queue mode gated by
  `ONESHOT_QUEUE_REQUIRED` (`docker/docker-compose.dev.yml`).

## Coding Style & Naming Conventions

TypeScript is ESM with strict checking; the frontend additionally rejects unused
locals/parameters, fallthrough, and unchecked side-effect imports. Follow existing
two-space backend and four-space frontend/Python formatting (no repo-wide linter).
New contract fields originate in `backend/schema/`, then receive Python and TypeScript
representations. Never embed API tokens in browser code or trust client-supplied
identity headers. Use the canonical comparable representation
(`confirmed_package.core`) for hashing.

## Testing Guidelines

Use `unittest` for Python and `node:test` for backend/E2E and frontend behavior.
Security changes require positive and negative coverage. Run `npm run verify`, web
tests, and manifest verification before release-facing commits.

## Commit & Pull Request Guidelines

Recent history uses concise conventional prefixes such as `feat:`, `fix:`, `docs:`,
`docs(scope):`, and `release:`. Keep one bounded concern per commit and record exact
verification commands in the PR description. No PR template is tracked. After adding or
touching source files, regenerate and re-verify `MANIFEST.sha256` and keep the diff bounded.