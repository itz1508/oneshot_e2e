# Provider audit and move

## Scope of this pass

Audited the provider call paths in the existing dirty checkout on `migration/oneshot-executable-v1`, HEAD `39e747a7154ba630a051fa830c7da9843536b9a3`, then performed the requested relocation into `app/web/cloud`. Existing agent, UI and dependency changes were retained. This is a provider-focused repository audit, not a certification of unrelated subsystems.

## Stated intent

Centralize server-side provider implementation under the web application's cloud directory while preserving existing behavior. Role means IAM identity; agents execute workflows. A provider integration does not become an IAM role or own workflow execution because of its location.

## File inventory

| Audited source before move | Current destination | Finding |
|---|---|---|
| `backend/agents/researcher/provider/**` (20 files) | `app/web/cloud/provider/**` | Native and compatibility adapters, workers, types, structured draft conversion and notice moved together |
| `backend/agents/researcher/provider.ts`, `provider-resolver.ts` | `app/web/cloud/` | Shared contract and resolution imported by backend callers |
| `backend/agents/researcher/tool/fixture-provider.ts` | `app/web/cloud/provider/fixture-provider.ts` | Sample provider follows the same interface |
| `backend/runtime/provider-{manager,runtime-config,secret-store}.ts` | `app/web/cloud/` | Provider control and storage implementation moved; persisted values stay in existing locations |
| `backend/config/providers.json` | `app/web/cloud/providers.json` | Catalog lookup updated in entrypoint, manager and tests |
| `app/workspace_api/providers.py` | `app/web/cloud/workspace/providers.py` | Separate workspace API clients moved; callers use Python package `web.cloud.workspace.providers` |
| Backend entrypoint, HTTP server, queue, bootstrap, researcher tools and ADK dependencies | Existing locations | Imports updated to the moved modules |
| `app/web/src/providers-panel.js` | Existing location | Browser HTTP client remains a browser asset |
| Researcher evidence collector and Tavily tools | Existing locations | Agent evidence acquisition remains separate from model transport |
| Schemas, workflow, IAM, workspace data models, unrelated UI | Existing locations | No implementation changes made by this move |

## Verified, unverified, and contradicted

The source call paths are `backend/index.ts -> ProviderManager -> adapter -> Python worker`, HTTP provider routes into the same manager, and queue submission capture followed by worker resolution. Agent bootstrap also calls `resolveResearchProvider`. The standalone workspace API follows `workspace_api.api -> chat/router -> web.cloud.workspace.providers`; it retains its separate routing and data contracts.

The pre-move TypeScript compile passed. Older reports of broken agent imports were no longer current. Old worker paths still existed in the Python worker test, deployment scripts and CI path filter; these now target `app/web/cloud/provider`. All 28 implementation/catalog/notice files were moved without compatibility copies at the old source locations.

Root TypeScript includes `app/web/cloud/**/*.ts`. Docker copies cloud source before compilation and includes its Python workers/catalog in the runner. Two existing Docker COPY references pointed to absent files: the contract registry is already included in `COPY backend`, and the workflow document copy now points to `docs/CANONICAL_WORKFLOW.md`.

The frontend build copies only its explicit `src` assets. Cloud modules and the secret-store implementation are not browser build inputs. Tests use deterministic provider fixtures; they do not establish live provider account or deployment readiness.

## Scope drift

No provider IDs, HTTP routes, model choices, SDKs, workflow ownership, IAM semantics or credential storage paths were changed. Unrelated dirty work was preserved. Tests, worker paths, packaging and local documentation were updated as consumers of the relocation.

## The call

Use `app/web/cloud` as the provider source location. Completion requires strict compilation, provider and queue regression tests, Python worker and workspace API tests, foreign-working-directory execution, and confirmation that the browser build excludes cloud source. Verification results are recorded below.

## Verification results

- `npm test`: both TypeScript builds passed; 125 backend tests passed, 2 opt-in tests skipped, 0 failed.
- Python backend suite: 47 passed. Workspace API suite: 4 passed.
- `npm --prefix app/web run build` and `npm --prefix app/web test`: build passed; 22 tests passed; browser output contains no cloud directory.
- New regression tests execute the sample catalog and all three native provider workers from a temporary working directory using deterministic fixtures, and import workspace cloud clients with only `app` on `PYTHONPATH`.
- All 28 old source paths are absent and their destination files exist. Source/import scans found no old provider paths in executable source, scripts or CI. Documentation link checks and `git diff --check` passed.
- Docker copy paths were updated and inspected; a Docker image build and live provider requests were not run.

## References

Module path changes follow the existing ESM/NodeNext configuration and Python package/import roots, informed by the official [TypeScript module documentation](https://www.typescriptlang.org/docs/handbook/modules/theory.html) and [Python import reference](https://docs.python.org/3/reference/import.html). These references justify module-resolution checks, not a new runtime or language choice.
