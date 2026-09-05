# Local validation record

## Source archive

Original uploaded ZIP SHA-256:

`c74cf2597c87b23b12321b669753faf81a241195634ff6d4c414302c23713c0f`

The uploaded archive passed `unzip -t` with no errors.

## Corrections applied locally

- Replaced staging-only/invented HTTP boundaries with the recovered OneShot browser contracts:
  - `GET /api/health`
  - `POST /api/conversations`
  - `POST /api/conversations/:id/messages`
  - `POST /api/conversations/:id/prompt`
  - `POST /api/conversations/:id/run`
  - `GET /api/runs/:id`
  - `GET /api/runs/:id/events`
  - `GET /v1/workspace/tree?path=.&depth=3`
  - `GET /v1/workspace/file?path=...`
- Removed invented `/api/session`, `/api/provider`, `/api/conversations/messages`, `/api/workspace/*`, and `/api/runs/:id/context` assumptions.
- Generate remains runtime-owned and cannot be enabled from textarea content alone.
- Run Context uses only context fields actually returned by the run snapshot.
- Added/retained approved shell mechanics: auto-fit sidebar/drawer layout, top handle, movable right rail, movable/resizable Message OneShot with invisible resize edges/corners, persisted proportional placement.
- Runtime events are deduplicated by event identity and sorted by backend sequence.

## Automated validation

- `npm run typecheck` — PASSED
- `npm run lint` — PASSED
- `npm test` — 6/6 PASSED
- `npm run build` — PASSED
- local static server startup + `curl http://127.0.0.1:4173/` — HTTP 200

## Browser mechanics validation

Chromium direct HTTP navigation is blocked by administrator policy in this environment (`ERR_BLOCKED_BY_ADMINISTRATOR`).

A browser-only contract harness therefore loaded the exact staging HTML/CSS/JS with in-memory storage and network stubs solely to exercise presentation mechanics. It verified:

- Generate disabled without runtime readiness
- Task Management opens from the rail
- Run Context opens and excludes Task drawer
- Sidebar changes available workspace without overflow
- top bar handle works
- Message OneShot drag remains inside workspace bounds
- Message OneShot resize remains inside workspace bounds
- right rail control group moves vertically
- Task click still works after rail drag

Result: `BROWSER_UI_MECHANICS_CONTRACT_TEST_OK`

This browser harness is not real-runtime E2E and is not evidence that backend/auth/SSE/provider/workspace endpoints are live.

## Remaining real-runtime gate

A compatible running OneShot application host is still required to validate real conversations, readiness, Generate, run creation, SSE, auth/session behavior, workspace content, Task events, Run Context data, terminal result, and hash proof end-to-end.
