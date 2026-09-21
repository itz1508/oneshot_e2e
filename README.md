# OneShot — One Click Installation

[![Workflow](https://img.shields.io/badge/WORKFLOW-2563EB?style=for-the-badge)](docs/WORKFLOW_TREE)
[![Index](https://img.shields.io/badge/INDEX-475569?style=for-the-badge)](INDEX.md)
[![App review](https://img.shields.io/badge/APP_REVIEW-7C3AED?style=for-the-badge)](docs/APP_REVIEW.md)
[![Download ZIP](https://img.shields.io/badge/DOWNLOAD_ZIP-059669?style=for-the-badge)](https://github.com/itz1508/oneshot_e2e/archive/refs/heads/main.zip)

**Installation scripts:** [Windows installer](scripts/install-e2e.ps1) · [Linux / macOS installer](scripts/install-e2e.sh)

These links open the scripts for review; run them locally using the agent prompt below.

Copy this prompt into your coding agent:

```text
You are an autonomous setup agent. Install and launch OneShot on this machine.

Repository: https://github.com/itz1508/oneshot_e2e
Local URL: http://localhost:8787

1. Detect the operating system. Use Docker if the user requests it;
   otherwise use the native installer.

2. Clone the repository into a new directory and enter it:
   git clone https://github.com/itz1508/oneshot_e2e.git oneshot
   cd oneshot
   If already working in this repository, use the current checkout.
   Preserve existing files and changes.

3. Check and install missing prerequisites:
   Native: Node.js 24.13.0+, npm 11.8.0+, Python 3.11+.
   Linux/macOS native: Bash and Python venv support.
   Docker: install and start Docker Desktop on Windows/macOS, or
   Docker Engine on Linux. Use Linux containers.
   Linux/macOS Docker: Bash and curl.
   Follow the official installation instructions:
   https://nodejs.org/en/download
   https://www.python.org/downloads/
   https://docs.docker.com/get-started/get-docker/
   https://docs.docker.com/engine/install/
   For Docker, confirm docker version reports both Client and Server.
   Complete available setup steps autonomously. Request user action only
   when required for administrator access, interactive setup, or restart.

4. Run the matching command from the repository root:

   Windows:
   powershell -ExecutionPolicy Bypass -File .\scripts\install-e2e.ps1

   Linux/macOS:
   bash ./scripts/install-e2e.sh

   Docker on Windows:
   powershell -ExecutionPolicy Bypass -File .\scripts\install-e2e.ps1 -Docker

   Docker on Linux/macOS:
   bash ./scripts/install-e2e.sh --docker

   Before the Docker installer, check for an existing oneshot-local
   container and containers publishing port 8787. The installer removes
   these containers. Do not remove existing user data without approval.

5. If installation fails, inspect the first error, diagnose its cause,
   apply a focused fix, and retry. Do not bypass verification, overwrite
   user work, or report success while a required check is failing.

6. Confirm the server is listening and the web page responds at the local
   URL. Keep the application running. The installers default to sample
   mode; report that mode accurately. Docker startup checks do not prove
   the full native verification suite passed.

7. Finish with only:
   Status: RUNNING or BLOCKED
   URL: the verified local URL, or unavailable
   Mode: the actual mode
   Verification: checks that actually passed
   Blocker: only if unresolved
```

[Source repository](https://github.com/itz1508/oneshot_e2e) · [Download ZIP](https://github.com/itz1508/oneshot_e2e/archive/refs/heads/main.zip)

[Apache License 2.0](LICENSE) · [Third-party notices](docs/license/NOTICE)

---

## Researcher Workflow Preview

**Source:** `frontend/web/src/patterns/deep-agent-todo-list/`
**Embed preview:** `frontend/web/public/embed/researcher-workflow-demo.html`
**Tests:** `frontend/web/tests/researcher-workflow.test.mjs` — 23 pass / 0 fail

### Architecture invariants

| Invariant | Implementation |
|---|---|
| One `useStream` boundary | `useStream<typeof deepAgentTodoListAgent>` in `preview.tsx` — the single live agent connection |
| Live Agent Progress | `getTodosFromStreamValues(stream.values)` → `liveTodos` → `data-source="live"` region |
| Fixture todos isolated | Local `useState` only → `fixtureTodos` → `data-source="fixture"` region |
| No stream/fixture merge | `liveTodos` and `fixtureTodos` are **never concatenated or written into `stream.values`** |
| Preview controls are offline | `openResearcherPreview`, `closeResearcherPreview`, `startFixture`, `cancelFixture`, `continueFixture`, `requestSectionChange` — none call `stream.submit`, `fetch`, `WebSocket`, or `EventSource` |

### Fixture scenarios

- **Fixture 1 (`straight-success`):** Sourced accessibility findings — keyboard focus visibility, ARIA live regions, cited from W3C WAI and MDN.
- **Fixture 2 (`section-change-reloop`):** Sourced correction loop — targeted revision of a single Facts and Sources section without re-running unaffected sections.

### Normal chat vs Preview

Normal chat remains connected to the live agent stream whether the Researcher Preview is open or closed. `stream.submit` is called only from `handleSubmit` (the normal-chat path). The Researcher Preview is a deterministic product-review fixture — it does not execute the Researcher, call an API, or write into live stream state.

---

## Evaluation Middleware

**Source:** `backend/validation/python/evaluation_middleware/`
**Tests:** `backend/tests/python/evaluation_middleware/` — 48 pass / 0 fail

Framework-level build-requirement evaluation middleware. Provider-neutral, deterministic-first, offline-mandatory.

**Status flags:** `FRAMEWORK_PROOF_ONLY` · `DETERMINISTIC_FIRST` · `PROVIDER_NEUTRAL` · `NO_LIVE_MODEL` · `NO_NETWORK` · `NO_COSMOS_INSTALL`

### Public evaluator roles

| Role | Upstream Strands reference | Outcome vocabulary |
|---|---|---|
| `RequirementEvaluator` | `goal_success_rate_evaluator.py` | `SATISFIED` / `PARTIALLY_SATISFIED` / `MISSING` / `UNVERIFIED` / `NOT_APPLICABLE` / `BLOCKED` |
| `GoalEvaluator` | `goal_success_rate_with_assertions_evaluator.py` | `ACHIEVED` / `PARTIAL` / `NOT_ACHIEVED` / `UNVERIFIED` |
| `OutputEvaluator` | `output_evaluator.py` | `PASS` / `MARGINAL` / `FAIL` / `UNVERIFIED` |
| `WorkflowEvaluator` | `trajectory_evaluator.py` | `HONORED` / `HONORED_WITH_GAPS` / `VIOLATED` / `UNVERIFIED` |

The `EvaluationMiddleware` async facade composes all four evaluators and returns an `EvaluationReceipt` with `recommendedDisposition` ∈ `{READY_FOR_APPROVAL, CORRECTION_REQUIRED, MORE_EVIDENCE_REQUIRED, BLOCKED, CANCELLED}`.

### Invariants

| ID | Statement |
|---|---|
| INV-1 | A requirement that is blank, missing, skipped, or unevaluated is **never** `SATISFIED`. |
| INV-2 | A model-based score, however high, does **not** override a deterministic missing-requirement disposition. |
| INV-3 | Timeout, cancellation, and failure are **distinct** on the receipt. One evaluator's timeout does not erase another's payload. |
| INV-4 | The receipt exposes `recommendedDisposition` + `limitations` only — no patch, no deployment instruction, no hidden reasoning. |
| INV-5 | `MultimodalObservation` is always `MODEL_DERIVED_VISUAL_OBSERVATION`; never a confirmed fact / component / requirement / root cause / approved implementation. |

### Run tests

```powershell
python -m pytest backend/tests/python/evaluation_middleware/ -v
# 48 passed, 0 failed — no network, no GPU, no credentials required
```
