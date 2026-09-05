# OneShot

**OneShot is an agentic build-and-prove system.** Give it a goal — it researches the problem, writes a plan, hardens it, builds the result inside a hardened sandbox, and reports **`PASSED`** only when the run survives triple validation and ends in a machine-verifiable SHA-256 hash proof. Anything less is a failure with a named root cause — never a silent guess.

```text
goal ──▶ Research ──▶ Plan ──▶ Refactor ──▶ Gap analysis (loops to gap_0)
     ──▶ Triple validation ──▶ Confirmation ──▶ Sandbox build ──▶ Hash proof ──▶ DONE
```

- **Provable, not plausible** — every confirmed run ends in a hash proof; artifacts are contract-checked against JSON Schema (Draft 2020-12).
- **Works with zero configuration** — a deterministic `sample` provider runs the full chain offline. Plug in OpenAI, Anthropic, or Gemini when you want a real model.
- **Dynamic workflow engine** — execution is driven by a Google ADK dynamic workflow; research evidence can be augmented with Tavily.
- **Hardened sandbox** — builds execute with deny-all networking, environment allowlists, and resource limits.

## Requirements

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | >= 24.13.0 | |
| npm | >= 11.8.0 | |
| Python | 3.11+ (3.12 verified) | validation + workspace API |
| Redis | optional, 7.x | enables the BullMQ run queue; without it runs execute inline |
| Docker | optional | containerized sandbox + image builds |

## Install

```bash
git clone https://github.com/itz1508/oneshot_e2e.git
cd oneshot_e2e

# Node dependencies (root + web UI)
npm ci
npm --prefix app/web ci

# Python virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\python -m pip install -r app/requirements/base.txt -r app/requirements/workspace-api.txt
# Linux/macOS:
.venv/bin/python -m pip install -r app/requirements/base.txt -r app/requirements/workspace-api.txt

# Build backend + web UI
npm run build
```

On Windows you can run the guided installer instead: `npm run setup`.

## Quick start — 60 seconds, no API key

```bash
npm run build:backend
npm run demo
```

`demo` runs a complete canonical build through the sandbox using the deterministic `sample` provider and prints the hash proof.

## Run the web UI

```bash
npm run build
npm start
```

Open **http://localhost:8787** — submit a goal, watch the workflow execute live over SSE, and inspect every validation step plus the final hash proof.

---

## Command reference

| Command | What it does |
|---------|--------------|
| `npm ci` / `npm --prefix app/web ci` | Install Node + web dependencies |
| `npm run setup` | Guided install (`app/bootstrap/setup`), builds, runs tests |
| `npm run bootstrap` | Preflight → install → build → verify (`scripts/bootstrap.mjs`) |
| `npm run oneshot` | Custom installation/evaluation driver (`scripts/oneshot.mjs`) |
| `npm run build:backend` | Compile TypeScript backend → `dist/backend/index.js` |
| `npm run build:ui` | Build the web UI → `app/web/dist` |
| `npm run build` | Build backend **and** web UI |
| `npm start` | Start the HTTP server (`node dist/backend/index.js`) |
| `npm run demo` | Deterministic sample-mode end-to-end demonstration |
| `npm test` | Compile + run the TypeScript test suite |
| `npm run verify` | Full production verification (`python app/scripts/verify_all.py`) |
| `npm run judge` | Judge/evaluation driver (`scripts/judge.mjs`) |
| `npm run guard:layout` | Report-only root-layout policy check |
| `npm run guard:layout:enforce` | Blocking root-layout policy check |

---

## Model providers

Provider selection is governed by a single authority: `ProviderManager`, which reads the catalog from `backend/config/providers.json`, resolves the active provider per run, builds the adapter, and hands a ready `ResearchProvider` to the Researcher. There is no silent fallback in production mode — an unconfigured production run fails with a named root cause.

```jsonc
// backend/config/providers.json (see in-repo copy for full contents)
{
  "version": 1,
  "providers": {
    "sample":      { "label": "OneShot Sample",     "type": "fixture",   "credentialType": "none" },
    "openai":      { "label": "OpenAI",             "type": "openai",    "credentialType": "api_key",
                     "credentialEnv": "OPENAI_API_KEY" },
    "anthropic":   { "label": "Anthropic",          "type": "anthropic", "credentialType": "api_key",
                     "credentialEnv": "ANTHROPIC_API_KEY" },
    "gemini":      { "label": "Gemini",             "type": "gemini",    "credentialType": "api_key" }
  }
}
```

Available providers:

- **`sample`** — deterministic `FixtureResearchProvider`. No keys. Default.
- **`openai`** — OpenAI cloud API. Set `OPENAI_API_KEY`.
- **`anthropic`** — Anthropic Claude. Set `ANTHROPIC_API_KEY`.
- **`gemini`** — Google Gemini pipeline. Requires three distinct model bindings (`GEMINI_DISTRIBUTION_MODEL`, `GEMINI_RESEARCH_MODEL`, `GEMINI_SYNTHESIS_MODEL`) and Google auth/Vertex (see `app/env/.env.example`).

Select the active provider and (re)submit credentials from the **Provider Configuration drawer** in the web UI, or via the HTTP provider endpoints. Credentials are stored write-only in the secret store (never served back) — see `app/env/.env.example` for `ONESHOT_SECRETS_DIR`. Env-provided keys take precedence over the secret store; do **not** commit real keys.

All configuration placeholders live in `app/env/.env.example` — copy to `app/env/.env` and fill in only what you need.

**Optional research evidence (Tavily).** Set `TAVILY_API_KEY` to augment the Researcher with web evidence (modes: `off | search | search-extract | research-stream`). Tavily supplements — it never replaces — the active research provider.

---

## Optional run queue (Redis / BullMQ)

By default the server executes runs inline. If Redis is available, runs are scheduled through a BullMQ worker (dedicated worker: `node dist/backend/scripts/run-worker-cli.js`). When Redis is unreachable OneShot logs `ONESHOT_QUEUE_REDIS_UNAVAILABLE` and falls back to inline execution — it remains fully functional.

```bash
docker run -d -p 6379:6379 redis:7
```

Compose alternative: `docker compose -f docker-compose.local.yml up -d`.

Runtime state (runs, events, checkpoints, sandbox workspaces, conversations) is written under `.runtime/` and is git-ignored.

---

## Sandbox

Execution runs in a hardened sandbox:

- **Process runner** (default): OS-isolated commands with environment allowlists, network policy, output/resource limits, and full cleanup.
- **Container runner**: select with `ONESHOT_SANDBOX_RUNNER=container` against a Sandbox image.

Sandbox admission requires an authentic confirmed package and an exact canonical hash before anything executes.

---

## Verification

```bash
npm run verify          # production gate: dependency pins → Python tests → workspace API → clean build → TypeScript suite
npm test                # TypeScript backend test suite (node:test)
npm --prefix app/web test
npm run guard:layout    # root-layout policy report
```

`npm run verify` prints `ONESHOT_PRODUCTION_E2E_VERIFIED` on success. On the current tree that measures **124 TypeScript tests (122 pass, 2 credential-gated skips)** plus **47 Python unit tests**. The two credential-gated E2E tests need real Google credentials and run only with `ONESHOT_LIVE_GEMINI_E2E=true`.

Every tracked source file is covered by `MANIFEST.sha256`, a SHA-256 integrity snapshot. CI regenerates it and fails on any unexplained change. After intentional edits, refresh it locally:

```bash
python app/scripts/generate_manifest.py
python app/scripts/verify_manifest.py
```

---

## Docker

```bash
docker build -t oneshot:latest .
docker run -d -p 8787:8787 --name oneshot-runner oneshot:latest
```

Provider credentials never live inside the image — mount a Docker secret and point `ONESHOT_SECRETS_DIR` at it (see `Dockerfile`).

---

## Repository layout

```text
backend/               TypeScript backend
  contracts/           canonical shared types
  config/              provider catalog (providers.json)
  runtime/             event bus, run repo, provider manager, queue, Redis
  sandbox/             hardened execution + admission
  skills/              reusable skill system
  workflow/            canonical workflow graph + ADK nodes
  server/              HTTP + SSE
  tests/               Python + TypeScript test suites
app/
  web/                 web UI (plain HTML/CSS/JS)
  workspace_api/       FastAPI control-plane sidecar
  bootstrap/           setup + demo scripts
  env/                 .env.example + provider env templates
  requirements/        pinned Python requirements
  scripts/             manifest, verification, packaging tools
scripts/               bootstrap, judge, oneshot, guard, browser E2E
docs/                  documentation, judge materials, evidence, licenses
```

Runtime state (runs, events, checkpoints, sandbox workspaces, conversations) lives under `.runtime/` — git-ignored, never committed.

---

## Documentation

| Doc | What it covers |
|-----|----------------|
| [`docs/README.md`](docs/README.md) | docs home — agent-driven setup prompt + judge walkthrough |
| [`docs/CANONICAL_WORKFLOW.md`](docs/CANONICAL_WORKFLOW.md) | authority for workflow order and responsibilities |
| [`docs/PROVIDER_MANAGEMENT.md`](docs/PROVIDER_MANAGEMENT.md) | provider configuration, credentials, HTTP endpoints |
| [`docs/RUN_JOB_CONTRACT.md`](docs/RUN_JOB_CONTRACT.md) | BullMQ run job contract |
| [`docs/TASK_MANAGEMENT_AND_ADK_GRAPH.md`](docs/TASK_MANAGEMENT_AND_ADK_GRAPH.md) | task management + ADK workflow graph |
| [`docs/INTENT_AUTHORITY_AND_HELP.md`](docs/INTENT_AUTHORITY_AND_HELP.md) | intent parsing authority |
| [`docs/JUDGE_README.md`](docs/JUDGE_README.md) | judge / evaluation driver |

---

## Security notes

- Credentials are **write-only**: stored in the OS secret store, never returned by any API, never embedded in job payloads or logs.
- Env-provided keys take precedence over the secret store. Never commit real keys.
- Non-loopback bind addresses require `ONESHOT_API_TOKEN`.
- The sandbox network policy defaults to deny-all, with environment allowlists and resource caps.

---

## License

OneShot-owned source is provided under the [Apache License, Version 2.0](docs/license/LICENSE). Third-party software remains under its own upstream licenses; see [NOTICE](docs/license/NOTICE) and [app/legal/third-party/](app/legal/third-party).