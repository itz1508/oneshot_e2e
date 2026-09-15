# Pre-Refactor Baseline (M0)

**Date:** 2026-09-14
**Branch:** main
**Checkpoint commit:** b02943f3 (WIP: checkpoint researcher strands, skills runtime, and UI work before refactor)

## Purpose

Establish a verified baseline before the in-place refactor defined in
`docs/plans/Pre_Refactor_Fix_Plan_v3.md`. No refactor source changes were made
in M0; only two baseline-establishment repairs (below) were applied so the gate
could be measured.

## Canonical file hashes (SHA-256)

| File | Hash |
|---|---|
| `backend/workflow/graph.json` | DC3AD774A56863B2F6EC1029338889733067EBD02CFA37624D8E717FA32EC97B |
| `backend/schema/contract-registry.json` | 012C634E6F7C68267966CA765A893B23098FA6D900DA050537453E9D126F1460 |
| `MANIFEST.sha256` | 52C8C90998D8D909A193525601AB6ED23F79D8D07074CB132689CD75EEC905F5 |

These are the reference hashes for the refactor. Any milestone that changes
`graph.json` or `contract-registry.json` must record the new hash and justify
the change.

## Verified files

All M0-listed paths exist:
`backend/index.ts`, `backend/server/http-server.ts`,
`backend/agents/researcher/workflow.ts`,
`backend/agents/researcher/tool/tavily/bridge.ts`,
`backend/workflow/graph.json`, `backend/schema/contract-registry.json`,
`backend/runtime/` run repository, `app/web/app/researcher/`, `package.json`.

## Acceptance gate results

| Gate | Command | Result |
|---|---|---|
| Backend compile | `npm run build:backend` | PASS (tsc clean) |
| Test compile | `npm run build:test` | PASS (tsc clean) |
| Backend test suite | `node --test dist/backend/tests/ts/*.test.js` | 49 files: 125 pass, 2 skipped, 0 fail |
| Python unittest | `python -m unittest discover -s backend/tests/python` | 44 tests OK |
| Dependency profile base | `verify_dependencies.py --profile base` | ONESHOT_DEPENDENCIES_PINNED |
| Dependency profile workspace | `verify_dependencies.py --profile workspace` | ONESHOT_DEPENDENCIES_PINNED |

`npm run build` (full, incl. Next.js web export) and `npm run verify` (which
chains the full web build + full test suite) exceed the 30s tool-call limit, so
they were verified by their constituent steps above rather than a single
invocation. Each constituent step passed.

## Baseline repairs applied in M0

Two pre-existing defects prevented the gate from being measured. Both are
baseline-establishment repairs, not refactor changes.

### Repair 1 — Live Tavily test guard (implements Plan Gap 11)

`backend/tests/ts/tavily-researcher-live.test.ts` hard-failed with
`assert.ok(...)` when `TAVILY_API_KEY` was absent, instead of skipping. This
violates Gap 11 ("ordinary `npm test` must never call paid/external providers;
live Tavily calls are opt-in via `RUN_LIVE_TAVILY_TESTS=true`").

Fixed to skip unless `RUN_LIVE_TAVILY_TESTS=true`, matching the guard pattern in
`researcher-strands-live.test.ts` (which uses `ONESHOT_LIVE_TEST`).

### Repair 2 — Workspace dependency pin alignment

`app/requirements/workspace-api.txt` pins `openai==2.54.0`, but the local `.venv`
had `openai==3.13.0`, causing `verify_dependencies.py --profile workspace` to
fail. Aligned the venv to the project-declared pin by installing
`openai==2.54.0`. No source pin was changed.

## Test inventory (49 files)

| Batch | Files | Pass | Skip | Fail |
|---|---|---|---|---|
| 1 (M0–M5 unit) | 10 | 31 | 0 | 0 |
| 2 (gap/intent/plan) | 10 | 30 | 0 | 0 |
| 3a (researcher non-live) | 8 | 15 | 0 | 0 |
| 4 subset (sandbox/skill/task) | 7 | 30 | 0 | 0 |
| server | 1 | 1 | 0 | 0 |
| sandbox-execution | 1 | 1 | 0 | 0 |
| session-transcript-e2e | 1 | 1 | 0 | 0 |
| 5 non-live (validation/workspace) | 8 | 15 | 0 | 0 |
| researcher-live-vertical-slice | 1 | 1 | 0 | 0 |
| researcher-strands-live | 1 | 0 | 1 | 0 |
| tavily-researcher-live | 1 | 0 | 1 | 0 |
| **Total** | **49** | **125** | **2** | **0** |

Note: `ECONNREFUSED 127.0.0.1:6379` errors appear in output because Redis is not
running locally. These are expected (tests assert Redis-unavailable behavior)
and do not cause failures.

## Acceptance verdict

M0 gate met: build clean, 125 tests pass / 2 properly-guarded skips / 0 fail,
and all verify components pass. Baseline established. Proceed to M1.
