# Repository Guidelines

## Project Structure & Module Organization

`docs/CANONICAL_WORKFLOW.md` owns workflow order and responsibility; `backend/contracts/schema/` owns JSON Schema Draft 2020-12 payload contracts. Keep those authorities separate from their implementations. `backend/index.ts` is the Node entrypoint; runtime, HTTP/SSE, workspace access, roles, reusable skills, sandbox execution, and failure recovery live under `backend/`. Deterministic Python validation and hashing live in the `validation` package at `backend/validation/python/` (import root `backend/validation/python`), with TypeScript orchestration only under `backend/validation/ts/`. The canonical workflow graph lives at `backend/workflow/graph.json`. The standalone FastAPI control plane is under `app/workspace_api/` (Python package name `workspace_api`, import root `app`). `app/web/` is the canonical frontend (plain HTML/CSS/JS); the former `ui/` tree is retired. Tests are split between `backend/tests/python/` (Python), `backend/tests/ts/` (Node), `scripts/e2e/browser/` (genuine browser E2E), and `app/web/tests/` (node:test). Documentation, judge materials, evidence, and legal files live under `docs/` (licenses under `docs/license/`); launchers and helper scripts live under `scripts/`; the contract registry lives at `app/contract-registry.json`. Runtime output belongs under the ignored `.runtime/` tree; `dist/` holds compiled output.

Preserve `ROLE != SKILL != TOOL != WORKFLOW`. Role SOPs remain in `backend/role/*/SKILL.md`; reusable skills use `backend/skills/*` (see `.agents/rules/oneshot-skill-architecture.md`).

The failure-recovery layer lives at `backend/recovery/` (taxonomy, root-cause analysis, bounded research escalation, retry policy, orchestrator). It is a bounded add-on to the canonical workflow — not a second workflow engine.

## Build, Test, and Development Commands

- `npm run oneshot`: bootstrap, build, verify, start, and open the IDE.
- `npm run build`: compile the strict TypeScript backend and frontend.
- `npm start`: run the compiled server.
- `npm run verify`: run dependency checks, Python tests, build, and serialized Node E2E tests.
- `npm --prefix app/web test`: run web tests (node:test).
- `npm run build:backend && node --test dist/backend/tests/ts/workspace-http.test.js`: run one compiled Node test.
- `python -m unittest discover -s backend/tests/python -p 'test_source_file_policy.py' -v`: run one Python test module.
- `python app/scripts/generate_manifest.py` then `python app/scripts/verify_manifest.py`: refresh and verify source hashes after reviewing the bounded diff.
- Python validation runs with `backend/validation/python` on `PYTHONPATH` (e.g. `PYTHONPATH=backend/validation/python python -m validation.rpc`). The workspace API runs with `app` on `PYTHONPATH` (e.g. `uvicorn --app-dir app workspace_api.main:app`).

## Coding Style & Naming Conventions

TypeScript is ESM with strict checking; the frontend additionally rejects unused locals, unused parameters, fallthrough, and unchecked side-effect imports. Follow existing two-space backend and four-space frontend/Python formatting because no repository-wide formatter or linter is configured. New contract fields originate in `backend/contracts/schema/`, then receive Python and TypeScript representations. Never embed API tokens in browser code or trust client-supplied identity headers.

## Testing Guidelines

Use `unittest` for Python and `node:test` for backend/E2E and frontend behavior. Security changes require positive and negative coverage. Run `npm run verify`, web tests, and manifest verification before release-facing commits. Ordinary tests must perform zero paid/live external calls — use deterministic/mocked provider, Tavily, sandbox, and researcher transports. Live external tests remain credential-gated.

## Commit & Pull Request Guidelines

Recent history uses concise conventional prefixes such as `feat:`, `fix:`, `docs:`, `docs(scope):`, and `release:`. Keep one bounded concern per commit and record exact verification commands in the PR description. No PR template is tracked.
