# Repository Guidelines

## Project Structure & Module Organization

`docs/Project.Workflow.md` owns workflow order and responsibility; `backend/schema/` owns JSON Schema Draft 2020-12 payload contracts. Keep those authorities separate from their implementations. `backend/environment.ts` loads local configuration before the Node entrypoint in `backend/index.ts`; runtime, HTTP/SSE, workspace access, roles, reusable skills, and sandbox execution live under `backend/`. Deterministic Python validation and hashing live in the `validation` package at `backend/validation/python/validation/` (import root `backend/validation/python`), with TypeScript orchestration only under `backend/validation/ts/`. The canonical workflow graph lives at `backend/workflow/graph.json`. The standalone FastAPI control plane is under `app/workspace_api/` (Python package name `workspace_api`, import root `app`). `app/web/` is the canonical frontend (plain HTML/CSS/JS); the former `ui/` tree is retired. Tests are split between `backend/test/python/` (Python), `backend/test/ts/` (Node), `scripts/e2e/` (genuine browser E2E), and `app/web/tests/` (node:test). Documentation, judge materials, evidence, and legal files live under `docs/` (licenses under `docs/license/`); launchers and helper scripts live under `scripts/`; the contract registry lives at `app/contract-registry.json`. Runtime output belongs under ignored `data/` and `dist/` trees.

Preserve `ROLE != SKILL != TOOL != WORKFLOW`. Role SOPs remain in `backend/role/*/SKILL.md`; reusable skills use `backend/skills/*` (see `.agents/rules/oneshot-skill-architecture.md`).

## Build, Test, and Development Commands

- `npm run oneshot`: bootstrap, build, verify, start, and open the IDE.
- `npm run build`: compile the strict TypeScript backend and frontend.
- `npm start`: run the compiled server.
- `npm run verify`: run dependency checks, Python tests, build, and serialized Node E2E tests.
- `npm --prefix app/web test`: run web tests (node:test).
- `npm run build:backend && node --test dist/backend/test/ts/workspace-http.test.js`: run one compiled Node test.
- `python -m unittest discover -s backend/test/python -p 'test_source_file_policy.py' -v`: run one Python test module.
- `python app/scripts/generate_manifest.py` then `python app/scripts/verify_manifest.py`: refresh and verify source hashes after reviewing the bounded diff.
- Python validation runs with `backend/validation/python` on `PYTHONPATH` (e.g. `PYTHONPATH=backend/validation/python python -m validation.rpc`). The workspace API runs with `app` on `PYTHONPATH` (e.g. `uvicorn --app-dir app workspace_api.main:app`).

## Coding Style & Naming Conventions

TypeScript is ESM with strict checking; the frontend additionally rejects unused locals, unused parameters, fallthrough, and unchecked side-effect imports. Follow existing two-space backend and four-space frontend/Python formatting because no repository-wide formatter or linter is configured. New contract fields originate in `backend/schema/`, then receive Python and TypeScript representations. Never embed API tokens in browser code or trust client-supplied identity headers.

## Testing Guidelines

Use `unittest` for Python and `node:test` for backend/E2E and frontend behavior. Security changes require positive and negative coverage. Run `npm run verify`, web tests, and manifest verification before release-facing commits.

## Commit & Pull Request Guidelines

Recent history uses concise conventional prefixes such as `feat:`, `fix:`, `docs:`, `docs(scope):`, and `release:`. Keep one bounded concern per commit and record exact verification commands in the PR description. No PR template is tracked.
