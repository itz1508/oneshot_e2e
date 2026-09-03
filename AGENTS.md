# Repository Guidelines

## Project Structure & Module Organization

`CANONICAL_WORKFLOW.md` owns workflow order and responsibility; `schema/` owns JSON Schema Draft 2020-12 payload contracts. Keep those authorities separate from their implementations. `backend/environment.ts` loads local configuration before the Node entrypoint in `backend/index.ts`; runtime, HTTP/SSE, workspace access, roles, reusable skills, and sandbox execution live under `backend/`. Deterministic Python validation and hashing live in `validation/`. The standalone FastAPI control plane is under `workspace_api/`. `web/` is the canonical frontend (plain HTML/CSS/JS); the former `ui/` tree is retired. Tests are split between `tests/` (Python), `tests_ts/` (Node), and `web/tests/` (node:test). Runtime output belongs under ignored `data/` and `dist/` trees.

Preserve `ROLE != SKILL != TOOL != WORKFLOW`. Role SOPs remain in `backend/role/*/SKILL.md`; reusable skills use `skill/*` with bindings under `backend/skill/`. See `.agents/rules/oneshot-skill-architecture.md` for the placement rule.

## Build, Test, and Development Commands

- `npm run oneshot`: bootstrap, build, verify, start, and open the IDE.
- `npm run build`: compile the strict TypeScript backend and frontend.
- `npm start`: run the compiled server.
- `npm run verify`: run dependency checks, Python tests, build, and serialized Node E2E tests.
- `npm --prefix web test`: run web tests (node:test).
- `npm run build:backend && node --test dist/tests_ts/workspace-http.test.js`: run one compiled Node test.
- `python -m unittest tests.test_source_file_policy -v`: run one Python test module.
- `python scripts/generate_manifest.py` then `python scripts/verify_manifest.py`: refresh and verify source hashes after reviewing the bounded diff.

## Coding Style & Naming Conventions

TypeScript is ESM with strict checking; the frontend additionally rejects unused locals, unused parameters, fallthrough, and unchecked side-effect imports. Follow existing two-space backend and four-space frontend/Python formatting because no repository-wide formatter or linter is configured. New contract fields originate in `schema/`, then receive Python and TypeScript representations. Never embed API tokens in browser code or trust client-supplied identity headers.

## Testing Guidelines

Use `unittest` for Python and `node:test` for backend/E2E and frontend behavior. Security changes require positive and negative coverage. Run `npm run verify`, web tests, and manifest verification before release-facing commits.

## Commit & Pull Request Guidelines

Recent history uses concise conventional prefixes such as `feat:`, `fix:`, `docs:`, `docs(scope):`, and `release:`. Keep one bounded concern per commit and record exact verification commands in the PR description. No PR template is tracked.
