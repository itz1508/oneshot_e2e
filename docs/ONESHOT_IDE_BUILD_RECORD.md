# OneShot IDE Build Record

Last updated: 2026-08-31 15:04:06 -07:00

## Purpose

This is the continuation record for the OneShot IDE frontend build. It separates verified current state, active work, target requirements, and deferred backend work so another agent can resume without relying on chat history.

## Current request

Build a full-viewport IDE in the repository root (`oneshot_e2e/`) with this visible operating surface:

1. repository files
2. multi-turn chat
3. live workflow task states
4. terminal/event stream
5. a bottom evidence bar containing run, model/framework/runtime, authentication mode, and hash status

The visual/source reference was an external local workspace outside this repository. It is reference-only; the implementation target at the time was the existing static app in `ui/`.

## Authority and scope

- Active target: `ui/index.html`, `app.css`, and `app.js`.
- Backend API authority: `backend/server/http-server.ts`.
- Reference UI: external local workspace, reference-only (not part of this repository).
- Requirements source supplied by the user: local session scratch checkpoint (not preserved in the repository).
- Design brief for this run: local session scratch checkpoint (not preserved in the repository).
- The current folder is not a Git repository. Do not report Git cleanliness or create commits unless repository state changes.
- Do not implement Gemini, Vertex AI, Cloud Run, or a new provider as part of the UI redesign. Those remain separate backend/deployment tasks.

## Verified starting state

Verified on 2026-08-31 before frontend mutation:

- The frontend is plain HTML/CSS/JavaScript served from `ui/` by the TypeScript HTTP server.
- Existing UI functions already call real endpoints for conversations, runs, SSE events, artifacts, sandbox execution, and graph projections.
- `/api/health` currently reports workflow/support service availability and graph identifiers. It does not report model, Vertex AI, ADC, or Cloud Run state.
- The current production provider implementation in the repository is Google ADK plus local Gemma 2 through Ollama. No Gemini/Vertex provider was found in the active source.
- `gcloud` is installed.
- An active gcloud account exists.
- A gcloud project is configured.
- Application Default Credentials can produce an access token.

The credential checks did not print the account name or token. Local ADC availability does not prove that the OneShot backend is using Vertex AI or running on Cloud Run.

## Product truth rules

- Show RUNNING, COMPLETE, failure, run id, hash, task messages, and terminal events only from backend responses or SSE events.
- Never simulate workflow progress for presentation.
- Treat `Gemini 3.7 Flash`, `Vertex AI`, and `Cloud Run` as target slots until the backend reports real configured/runtime evidence.
- Google authentication is backend-owned. Do not add a browser API-key field or display secret material.
- A safe frontend label is `ADC · SERVER SIDE`; its state must remain conservative unless the backend exposes a truthful status contract.
- Keep Gemma visibly secondary/local and Featherless fallback-only. Do not imply either is the required hackathon Gemini path.

## Required primary layout

Desktop workbench:

```text
FILES | CHAT | TASKS
TERMINAL / EVENTS
run | model | ADK | auth/runtime | hash
```

The FILES panel uses real known paths from this repository. CHAT uses the existing conversation endpoints. TASKS is driven by actual workflow events. TERMINAL appends received events and supports scope filtering. The evidence bar must show unknown/target/pending when the backend has not reported a value.

Secondary views must retain the existing Artifacts & Proofs, External Sandbox, and Graph Projections functionality.

## Design direction

- Dense, dark operator IDE rather than a rounded-card SaaS dashboard.
- Graphite surfaces, shared 1px borders, compact type.
- Cyan for active execution, emerald for verified state, amber for pending/target, red only for root-cause/error.
- Inter/system sans for interface copy and JetBrains Mono/system mono for paths, events, ids, and hashes.
- No decorative hero, fake screenshots, fake code, glossy gradients, or browser-side secret entry.
- Responsive at 1440x900, 1280x720, and narrow/mobile widths.

## Current execution status

Status at the timestamp above: **COMPLETE — UI IDE scope**.

- Requirements reconciled: complete.
- Active target and reference inspected: complete.
- Local gcloud/ADC presence checked without secret output: complete.
- Design brief written: complete.
- UI implementation: complete in the existing plain HTML/CSS/JavaScript stack.
- Reference extraction: complete; the compact shell, surface palette, thin rails, dense headers, and status treatment from the external local reference workspace were translated into the target stack.
- Delegated design evaluation: superseded by the user's instruction not to use subagents for this coupled task. Direct rendered desktop/mobile inspection and browser QA completed.
- Build/tests: complete, 42 tests passed and 0 failed.
- Live browser verification and screenshots: complete.
- Exact `Audit this project and produce a verified implementation plan.` chat path: complete through real conversation and run APIs.
- Gemini/Vertex backend integration: deferred, not part of this UI task.
- Cloud Run deployment: deferred, not part of this UI task.

## Required verification before marking complete

Run from the repository root:

```powershell
npm run build
npm test
```

Then start the real server with an appropriate verified configuration and inspect the served UI. Verify:

- `/api/health` drives the backend health display.
- file tree expands/selects without invented file content.
- chat uses real conversation APIs.
- starting a workflow displays real task and terminal events.
- event filters operate only on received events.
- run id and hash update from backend results.
- target technologies remain visibly unverified when not reported.
- Artifacts, Sandbox, and Graphs remain reachable and functional.
- desktop and mobile layouts have no obstructed controls or horizontal overflow.

Expected screenshot outputs for this design run (local session scratch checkpoint, not preserved in the repository):

- `oneshot-ide-desktop.png`
- `oneshot-ide-mobile.png`

## Continuation procedure

If this session stops before completion:

1. Read this record and the design brief.
2. Inspect the current `ui/` files; do not assume the delegated implementation completed.
3. Re-run build/tests rather than trusting status text.
4. Launch the actual server and verify the real API/event path.
5. Run an independent visual evaluation against the brief.
6. Apply only the evaluator's priority fixes, then repeat verification.
7. Update this file with changed paths, exact test results, screenshot paths, unresolved limitations, and a final `COMPLETE` or `BLOCKED` status.

## Completion evidence

Completed at 2026-08-31 15:04:06 -07:00.

Changed files:

- `ui/index.html` — full IDE workbench with Files, Chat, Tasks, Terminal/Events, Proofs, Sandbox, Graphs, and evidence bar.
- `ui/app.css` — compact reference-backed IDE visual system and responsive layouts.
- `ui/app.js` — real health, conversation, run, SSE event, task, proof, sandbox, and graph wiring; no simulated workflow events.
- `backend/intent/intent-collection.ts` — narrowly added `audit`, `review`, and `inspect` as concrete action verbs so the requested demo prompt is accepted by the real intent path.
- `tests_ts/intent-collection.test.ts` — regression proof for the audit command.
- `docs/ONESHOT_IDE_BUILD_RECORD.md` — this continuation and completion record.

Automated verification:

```text
node --check ui/app.js     PASS
npm test                  PASS
tests                     42
passed                    42
failed                    0
```

Live browser verification at `http://127.0.0.1:8787`:

- `/api/health` rendered `Canonical backend online` and `Local backend`.
- Exact audit prompt produced `Intent revision 1 recorded. Ready to run the canonical workflow.`
- Chat-triggered run reached `PASSED`.
- Tasks reached `13 / 13 complete`.
- Terminal received 39 real workflow events.
- A backend hash was rendered and exposed for copying.
- Confirmed artifact loaded from the real artifact endpoint.
- Authority graph loaded from the real graph endpoint.
- At 390x844, measured document width did not exceed the viewport.
- Browser console/page-error check returned no errors.
- Automated WCAG A/AA scan reported 0 violations and 0 incomplete checks.

Screenshots (local session scratch checkpoint, not preserved in the repository):

- `oneshot-ide-desktop.png`
- `oneshot-ide-mobile.png`
- `oneshot-ide-live-run.png`
- `oneshot-ide-chat-run.png`

Known boundary: the active repository still does not contain a Gemini/Vertex provider or Cloud Run deployment. The UI therefore labels Gemini 3.7 Flash as `TARGET`, ADK as `NOT OBSERVED` until ADK events arrive, ADC as `SERVER SIDE`, and the current runtime as local. This is intentional and prevents the demo from claiming unproved infrastructure.
