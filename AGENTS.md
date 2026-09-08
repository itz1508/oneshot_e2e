# Repository Guidelines — OneShot

Repository-wide working guidance. Paths are relative to the repository root.
Read nested `AGENTS.md` files before changing their subtree.

## Start here

1. Inspect the branch, working tree, relevant manifests, and actual callers.
   Preserve existing edits; do not use a refactor to replace unrelated work.
2. Find the responsible module using the map below. Read its implementation and
   relevant authority document before proposing changes.
3. Make a bounded change that completes the request. Preserve public imports,
   artifact identities, resource paths, and launch behavior when moving code.
4. Check the changed behavior at the appropriate scope and report what changed,
   what was verified, and any remaining limitation.

Use `rg` for searches. Keep source text LF-normalized. Do not hand-edit generated
output or introduce dependencies solely to reformat files.

## Authority and invariants

| Responsibility | Source of truth |
| --- | --- |
| Workflow order, ownership, and human gates | [Canonical workflow](docs/CANONICAL_WORKFLOW.md) |
| Required web behavior | [Web requirements v3](docs/ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v3.md) |
| Requirement-to-implementation gaps | [Reconciliation](docs/WEB_APP_REQUIREMENTS_RECONCILIATION.md) |
| Agent, skill, tool, and IAM boundaries | [Architecture rule](.agents/rules/oneshot-skill-architecture.md) |
| Payload contracts | `backend/schema/` and its contract registry |
| Executable transitions | `backend/workflow/graph.json`, `backend/workflow/canonical-transition.ts` |

When documentation and implementation disagree, identify the discrepancy before
changing either. Historical reports and green builds do not establish current
runtime or deployment behavior.

- Preserve Research Review before Planner and hash/package-bound Build Ready
  authorization before Builder. Do not replace either gate with automatic progress.
- Preserve the same logical plan identity through refinement. Hash the canonical
  comparable representation, `confirmed_package.core`.
- UI state projects real backend records, IDs, events, and results. Do not fabricate
  progress, evidence, successful execution, or hash equality.
- Agent SOPs under `backend/agents/` are distinct from reusable skills discovered
  under `backend/skills/`. Directory ownership does not establish IAM permission.
- Credentials stay server-side and outside browser-readable output. Preserve
  authentication, workspace path policy, and sandbox admission checks.

Before suggesting technology or changing responsibility boundaries, consult the
relevant official specification or documentation and include its URL. Prefer
specification → product/API docs → SDK docs → official repository/examples.
Choose the owning layer from actual callers, not a presumed language sequence.

Useful references: [JSON Schema](https://json-schema.org/specification),
[TypeScript modules](https://www.typescriptlang.org/docs/handbook/2/modules.html),
[Python](https://docs.python.org/3/reference/index.html), and
[Next.js static exports](https://nextjs.org/docs/app/guides/static-exports).
Consult other technologies only when the task involves them.

## Module map

| Area | Implementation and navigation |
| --- | --- |
| Production web UI | `app/web/app/` routes; `app/web/components/` workspace, review cards, file browser, dialogs, icons |
| Browser data access | `app/web/lib/api.ts` public exports; HTTP client, event stream, contracts, and projections beside it |
| Legacy/reference console | `app/web/src/`; retained HTML/CSS/JS and associated tests, not the Next.js production entrypoint |
| Provider integration | `app/web/cloud/`; manager, runtime config, secret store, adapters, and Python workers |
| Server entry and configuration | `backend/index.ts`, `backend/environment.ts`, `backend/python-runtime.ts` |
| HTTP and workspace access | `backend/server/`; routing, response helpers, workspace inspection, security, path policy |
| Per-stage pipeline | `backend/pipeline/`; processors, workers, queues, checkpoints, transitions, review confirmation, stage scope |
| Runtime state and gates | `backend/runtime/`; run repository, events, artifacts, plan/build review, target workspace |
| Workflow execution | `backend/workflow/`; canonical transitions and ADK integration under `backend/workflow/adk/` |
| Agent operations | `backend/agents/`; Researcher, Planner, Refactor, Gap Analysis, Evaluation, Builder and their private tools |
| Reusable capabilities | `backend/skills/`; discovery, resolution, activation, and callable bindings |
| Supporting domains | `backend/intent/`, `backend/task/`, `backend/sandbox/`, `backend/tool/`, `backend/graph/`, `backend/core/` |
| Deterministic validation | `backend/validation/python/validation/`; schema, fixture, goal, references, canonicalization, hashing |
| Standalone Python service | `backend/python/`; own package, dependencies, app, and tests |
| Workspace control plane | `app/workspace_api/`; FastAPI package with import root `app` |
| Bootstrap and packaging | `scripts/`, `app/bootstrap/`, `app/scripts/`; shared CLI colors in `scripts/lib/` |
| Deployment | `docker/`, `app/deploy/`, cloud deployment/preflight/verification scripts in `scripts/` |
| Fixtures and dependencies | `app/fixtures/`, `app/requirements/`, `app/vendor/`; local environment in `app/env/` |
| Checks | `backend/tests/`, `app/web/tests/`, `app/workspace_api/tests/`, `scripts/e2e/browser/`, `.github/workflows/` |

### Frontend boundary

The production build is Next.js App Router → static export → `app/web/dist/`,
served by the existing Node backend. Follow [app/web/AGENTS.md](app/web/AGENTS.md)
and read relevant installed Next.js guides before changing frontend code.

`app/web/scripts/export.mjs` publishes the export and externalizes trusted
bootstrap scripts for the existing CSP. Preserve this build path and CSP.
Do not edit `app/web/.next/`, `app/web/out/`, or `app/web/dist/` as source.

### Language and contract conventions

TypeScript uses strict ESM. Keep Node-side relative imports compatible with the
existing `.js` import convention. Use two-space backend/cloud indentation and
four-space frontend/Python indentation; follow the surrounding module.

Contract changes begin in `backend/schema/`; update affected TypeScript/Python
representations and consumers together. Preserve JSON field names and result
vocabulary. Keep separate Python import roots intact when moving modules.

## Commands

Run from the repository root unless a different directory is stated.
Root package requirements: Node >=24.13.0 and npm >=11.8.0.
Use the relevant Python package/dependency files for its runtime requirements.

| Purpose | Command |
| --- | --- |
| Windows launch | `./start-web.ps1` (default port 8787; supports `-Rebuild`, `-Sample`, `-NoBrowser`, `-Port`) |
| Bootstrap through launch | `npm run oneshot` |
| Build all / backend / frontend | `npm run build` / `npm run build:backend` / `npm run build:ui` |
| Start compiled backend | `npm start`; `npm run dev` additionally loads `app/env/.env` |
| Frontend development / types | `npm --prefix app/web run dev` / `npm --prefix app/web run typecheck` |
| Backend tests | `npm test` (compiles backend and tests) |
| Compile tests separately | `npm run build:test` |
| Web tests | `npm --prefix app/web test` |
| Repository verification | `npm run verify` |
| Workspace API | `uvicorn --app-dir app workspace_api.main:app` |
| Python reasoner tests | From `backend/python/`: `python -m pytest` |
| Local Redis | `npm run redis:up`; see `docker/docker-compose.dev.yml` |
| Pipeline E2E | `npm run test:pipeline:e2e`; requires the configured server, worker, and Redis |
| Manifest | `python app/scripts/generate_manifest.py`, then `python app/scripts/verify_manifest.py` |

For direct validation RPC in PowerShell, set
`$env:PYTHONPATH = "backend/validation/python"`, then run
`python -m validation.rpc`. This environment assignment applies to the current shell.

## Verification and delivery

Match verification to the change. Documentation-only work needs path/command
checks and a diff review, not a full runtime suite. Refactors need relevant
compilation and behavior checks; security changes need positive and negative cases.
Avoid tests that depend only on whitespace or quote style.

Before release-facing commits, run `npm run verify`, web tests, and manifest
verification. Compile tests explicitly with `npm run build:test` when checking
compiled test output; do not assume an old `dist/` proves current source.

After source changes, regenerate the manifest only after builds have stopped,
then review its diff and verify it. The manifest uses
`app/scripts/source_file_policy.py`; generated output, credentials, and local
diagnostic logs must not become release source artifacts.

Commit and push only when authorized by the user. Stage reviewed paths explicitly.
Use a concise conventional commit title and record relevant validation in PRs.
Before pushing, inspect branch/upstream divergence, including pre-existing local
commits. After pushing, verify the remote SHA and working tree, and report CI for
that exact commit. Distinguish local checks from live provider, Redis/BullMQ,
browser, container, and deployment proof.
