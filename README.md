# OneShot

A human-gated, hash-verified autonomous build pipeline. OneShot turns a chat
prompt into a researched, validated, and cryptographically confirmed build
package — and only executes it in a hardened sandbox after you explicitly
approve the build.

[![License](https://img.shields.io/badge/LICENSE-Apache--2.0-E7B008?style=for-the-badge)](LICENSE)
[![Architecture](https://img.shields.io/badge/ARCHITECTURE-0F766E?style=for-the-badge)](docs/ARCHITECTURE.md)
[![Workflow](https://img.shields.io/badge/WORKFLOW-2563EB?style=for-the-badge)](docs/WORKFLOW_TREE)
[![Index](https://img.shields.io/badge/INDEX-475569?style=for-the-badge)](INDEX.md)
[![App review](https://img.shields.io/badge/APP_REVIEW-7C3AED?style=for-the-badge)](docs/APP_REVIEW.md)
[![Download ZIP](https://img.shields.io/badge/DOWNLOAD_ZIP-059669?style=for-the-badge)](https://github.com/itz1508/oneshot_e2e/archive/refs/heads/main.zip)

[What it does](#what-is-oneshot) · [Who it's for](#who-its-for) · [How it works](#how-it-works) · [Quickstart](#quickstart) · [Tests](#verification-and-tests) · [Demo video](#demo-video) · [License](#license)

## What is OneShot

OneShot is a local-first engineering workspace where an AI pipeline builds
software **with you in control**. You describe what you want in a chat; a
six-stage agent pipeline researches, plans, and validates the work; two
mandatory human review gates keep you in charge; and a cryptographic hash
binds exactly what you approved to exactly what gets executed.

- **Six governed LLM stages** — Researcher → Planner → Refactor → Gap
  Analysis → Evaluation → Builder — orchestrated with the official Google
  ADK TypeScript package (`SequentialAgent`, `LoopAgent`, `ParallelAgent`).
- **Two mandatory human gates** — Research Review and Build Ready. The
  pipeline cannot pass either gate without your explicit action; a returned
  Build Ready leaves the run waiting and Builder never starts.
- **Deterministic Triple Validation** — independent schema, fixture, and
  goal validators return `VALID | NOT_VALID`, with bounded refinement
  (up to 3 iterations). An LLM never grades its own work.
- **Cryptographic accountability** — the confirmed package core
  (`confirmed_package.core`) is hashed; Builder executes only that exact
  package in a sandbox; success requires `HASH == hash_sandbox`.
- **Durable execution** — BullMQ/Redis queues, checkpoints, and recovery,
  with a fully functional in-process fallback when Redis is unavailable.

## Who it's for

- **Developers and teams** who want autonomous code generation they can
  audit and trust, not just watch.
- **Teams adopting AI agents under review or compliance requirements**,
  where the approved artifact and its hash must be provable after the fact.
- **Judges, researchers, and practitioners** studying human-in-the-loop
  agent workflows end to end.

## How it works

The canonical workflow is a fixed stage order with two human gates
([architecture](docs/ARCHITECTURE.md) ·
[workflow tree](docs/WORKFLOW_TREE) ·
[canonical workflow](docs/CANONICAL_WORKFLOW.md)):

```text
Chat/Intent → Prompt → Researcher → STOP: Research Review (you accept)
→ Planner → Refactor → Gap Analysis → Evaluation
→ Triple Validation (Schema · Fixture · Goal — deterministic)
→ CONFIRMED package → HASH
→ STOP: Build Ready (you confirm) → Builder in sandbox
→ HASH == hash_sandbox → DONE
```

Everything the workflow produces — stage artifacts, events, validation
results, and proofs — is stored server-side and projected into the UI. The
browser is a viewer over real backend records; it is never the store, and
progress, evidence, and hashes are never fabricated.

## Quickstart

### Prerequisites

| Requirement | Notes |
| --- | --- |
| Node.js ≥ 24.13.0 and npm ≥ 11.8.0 | [nodejs.org/en/download](https://nodejs.org/en/download) |
| Python 3.11+ | Deterministic validators, Python reasoner, and verification tooling ([python.org/downloads](https://www.python.org/downloads/)) |
| Docker Desktop / Engine (optional) | Container sandbox, Redis, and the Docker install path ([docs.docker.com](https://docs.docker.com/get-started/get-docker/)) |
| Redis (optional) | `npm run redis:up`; without Redis, runs execute inline in-process |

The app serves on **http://localhost:8787** by default.

### Option A — Windows launcher (fastest on Windows)

```powershell
.\start-web.ps1              # launch the full production runtime, open the UI
.\start-web.ps1 -Sample      # deterministic sample provider, no API keys needed
.\start-web.ps1 -Rebuild     # force recompilation of backend + frontend
.\start-web.ps1 -Port 9000 -NoBrowser
```

### Option B — one-command bootstrap through launch

```powershell
npm run oneshot
```

### Option C — Linux / macOS installer

```bash
bash ./scripts/install-e2e.sh
```

### Option D — Docker (server + worker + Redis + Python reasoner)

```bash
npm run dev:up               # docker compose -f docker/docker-compose.dev.yml up --build -d
# open http://localhost:8787
npm run dev:down             # stop
```

### Manual native path

```bash
npm install
npm run build                # TypeScript backend + Next.js frontend → dist/
npm start                    # serve on http://localhost:8787
```

### Configure a provider

- **Sample mode** (default for demos): the Deterministic Sample Provider
  runs the real workflow with no external keys — `npm run demo` or
  `.\start-web.ps1 -Sample`.
- **Production mode**: open **Provider Configuration** in the app, paste
  your key for OpenAI, Anthropic, or Gemini, and choose **Save and
  activate**. Keys are write-only from the browser and never live in the
  repository. `app/env/.env.example` documents every variable, including
  optional Ollama, Featherless, and custom providers, plus optional Tavily
  research evidence.

### Choose the target workspace

OneShot operates on an explicitly selected target project — it never treats
its own source as the target. Configure it before starting a run from the
UI:

```powershell
Copy-Item app/env/.env.example app/env/.env
# edit app/env/.env:  ONESHOT_WORKSPACE_ROOT=<absolute path to your project>
npm run dev                  # loads app/env/.env, serves http://localhost:8787
```

The UI requires the backend to report a configured target before Research
can start — by design, so runs always touch the workspace you intended.

## Verification and tests

| Purpose | Command |
| --- | --- |
| Backend tests (compile + run) | `npm test` |
| Web tests + typecheck | `npm --prefix app/web test` · `npm --prefix app/web run typecheck` |
| Repository verification suite | `npm run verify` |
| Compile tests only | `npm run build:test` |
| Pipeline E2E (needs server, worker, Redis) | `npm run test:pipeline:e2e` |
| Source manifest | `python app/scripts/generate_manifest.py` then `python app/scripts/verify_manifest.py` |

## Repository map

| Path | What lives there |
| --- | --- |
| `app/web/` | Production UI — Next.js App Router → static export → `app/web/dist`, served by the backend |
| `backend/` | Server entry, HTTP + workspace access, pipeline, runtime state, workflow + ADK, agents, skills, schemas, sandbox |
| `backend/validation/python/` | Deterministic validators — schema, fixture, goal, canonicalization, hashing |
| `backend/python/` | Standalone Python reasoner service |
| `app/workspace_api/` | FastAPI workspace control plane |
| `scripts/`, `docker/` | Installers, bootstrap, E2E browser checks, containers |
| `docs/` | Canonical workflow, architecture, source of truth, app review, submission kit |

Full file inventory: [INDEX.md](INDEX.md).

## Documentation

- [Architecture diagram](docs/ARCHITECTURE.md) — system, workflow, runtime,
  contracts, and deployment views
- [Canonical workflow](docs/CANONICAL_WORKFLOW.md) — stage order, artifact
  ownership, human gates
- [Web app source of truth v3](docs/ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v3.md) —
  authoritative product behavior
- [App review](docs/APP_REVIEW.md) — latest verification evidence and known
  gaps
- [Submission package](docs/SUBMISSION.md) ·
  [Demo video kit](docs/DEMO_VIDEO_SCRIPT.md)

## Demo video

- Walkthrough recording: `docs/evidence/video/oneshot-live-processing-demo.mp4`
- Online: <https://www.youtube.com/watch?v=RQTxYwcNx_0>
- Fresh ≤ 5-minute recording kit (script, storyboard, voiceover, checklist):
  [docs/DEMO_VIDEO_SCRIPT.md](docs/DEMO_VIDEO_SCRIPT.md)

## License

[Apache License 2.0](LICENSE) · third-party notices:
[docs/license/NOTICE](docs/license/NOTICE)

## Agent-assisted installation

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
