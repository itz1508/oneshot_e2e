# OneShot Frontend Continuation — Honest Status Report

Date: 2026-09-03  (worker: d:\oneshot_e2e, branch: adk-workflow-v2)

## Repository facts (verified)
- Repository root: `D:/oneshot_e2e`
- Current branch: `adk-workflow-v2`
- Clean? NO. Pre-existing unstaged modifications (NOT mine): `backend/environment.ts`,
  `backend/runtime/event-bus.ts`, `backend/runtime/run-repository.ts`,
  `backend/runtime/workflow-runtime.ts`, `tsconfig.json`, `validation/schema_validator.py`.
  These are the source of the already-running runtime and were dirty before this task.
- Canonical frontend root (discovered): `web/` (React IDE, builds to git-ignored `web/dist`)
- HTTP/runtime server entry point (discovered): `dist/backend/index.js` (tsconfig: `backend/`
  compiled to `dist/backend/`), `npm start`, PORT 8787 (from `.env`). A runtime was ALREADY
  running on 8787; it reads static files from `web/dist` per request.
- Confirmed corrected archive SHA-256 9bf34b24d514...c2856. Staging unpacked to sibling
  `web-staging/` (from `.staging-inspect/oneshot-frontend-staging` artifacts).

## Runtime routes (verified live against the running reality — no backend changes made)
- GET  /api/health                    -> {"status":"ok",mode,provider,task_management,...}
- POST /api/conversations             -> {conversation_id,session_id,turns[],intent{ready_for_prompt,...}}
- POST /api/conversations/:id/messages -> full {conversation_id,turns[],intent} echo
- POST /api/conversations/:id/prompt  -> readiness/help_request (auth-gated)
- POST /api/conversations/:id/run     -> {run_id, prompt_id, intent_id, intent_revision}
- GET  /api/runs/:id                  -> {run_id, events[], artifacts{}, current_processor, result, root_cause}
- GET  /api/runs/:id/events           -> real SSE stream: lines `data: {json}` (event_id/sequence/processor/state/result/message)
- GET  /v1/workspace/tree             -> {root,nodes:[{name,path,type,children}]}
- GET  /v1/workspace/file?path=       -> {path, content}

These EXACTLY match the corrected staging frontend's recovered contracts. The staging
integration layer requires NO change to connect to the real runtime. Auth: the runtime is
Bearer-token gated; token comes from `.env` (the running server accepted the `.env` token).

## Staging build (web-staging) — all internal checks PASS
- typecheck PASS   (node scripts/check.mjs typecheck -> TYPECHECK PASSED)
- lint PASS        (node scripts/check.mjs lint -> LINT PASSED)
- test  PASS       (node --test tests/*.test.mjs -> 6 passed, 0 failed)
- build PASS       (node scripts/build.mjs -> BUILD PASSED)
- staging source unpacked from SHA-verified corrected archive; served by runtime at `/`.

## Real-runtime results that ARE verified (API-level, live, executed now)
- Health: 200 with valid `.env` Bearer -> {"status":"ok",mode:"sample",provider:"FixtureResearchProvider",...}
          (401/unauthorized with missing or wrong token — real auth boundary)
- Conversation create + messages: real intent states returned.
- Run creation: real run_id/prompt_id returned from `POST /run`.
- Run snapshot + event stream: ordered REAL WORKFLOW events across all canonical processors,
  terminated with state COMPLETE and `result:"ROOT_CAUSE"` at `Done`:
  "Triple Validation join mismatch: schema plan_id undefined != plan:...; fixture plan_id ...;
  goal plan_id ...; schema_id ...; goal_id ...". This is FixtureResearchProvider/sample-mode
  runtime truth in this checkout — a failing run the UI must faithfully render (not normalize).
- Workspace tree + file: real repo content returned (e.g. package.json).

## HARD BLOCKER — real rendered-DOM browser E2E (required, cannot run here)
Per task section 10/11/13/14, real rendered-DOM E2E after staging build is a hard gate.
In THIS environment, launching any headless browser via CDP cannot complete:
- Manual headless Chrome/Edge CDP launch: CDP endpoint never binds (probe timed out; no page target).
- `agent-browser` CLI (installed, v0.33.2, browser available): `open`/`--version` invocations
  hang and hit the platform 30-second shell timeout.
This appears to be a network/browser-spawn policy of the remote execution shell, not a code
issue. The corrected staging UI cannot be driven to assert visible rendered DOM (Flows A–K,
UI mechanics §12, §13) in this environment.

## CONSEQUENCE (per §14 "STOP BEFORE PROMOTION")
Because real rendered-DOM E2E cannot be exercised, I MUST NOT promote (delete the current
`web/` frontend), and MUST NOT claim an unexercised PASS. The old frontend is preserved under
`web/` (its prior build is intact at `web/dist.staging-backup/`); the staging build is served
from git-ignored `web/dist`. No commit was made; no backend/runtime files were mutated by me.

## Approved-UI integrity
The corrected staging UI's approved mechanics (compact top bar, readiness, Generate button,
left sidebar, auto-fit, right rail guard, movable Tasks/Context rails, researcher expansion,
Run Context, movable/resizable workspace-bounded Message OneShot, persistent position/size,
no Readiness-fabrication, no visible drag/resize icon) were preserved unchanged; only serving
was switched to it.

## Exact blocker
:Execution shell cannot run a headed headless-browser CDP session to assert rendered DOM;
both manual `--headless` launch and `agent-browser` hit the platform 30s shell timeout.