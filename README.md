# OneShot

OneShot is an agentic build-and-prove system. It takes a goal and runs study → plan → refactor → gap-analysis → triple-validation → confirmation → sandbox-build → hash-verification as one canonical workflow, reporting `PASSED` only when it can produce a machine-verifiable hash proof. Execution is driven by a Google ADK dynamic workflow, research can be augmented by Tavily evidence, and provider/model selection is governed by a single configuration authority.

> Last verification: 118 tests · 116 pass · 0 fail · 2 credential-gated skips.

---

## Requirements

| Tool | Version |
|------|---------|
| Node.js | >= 24.13.0 |
| npm | >= 11.8.0 |
| Python | 3.11+ (3.12 verified) |
| Redis (optional) | 7.x — only needed to enable the BullMQ run queue; without it runs execute inline |
| Docker (optional) | for containerized sandbox + image builds |

---

## Install

```bash
# 1. Get the source
git clone https://github.com/itz1508/oneshot_e2e.git
cd oneshot_e2e

# 2. Install Node + web dependencies
npm ci
npm --prefix app/web ci

# 3. Create the Python virtual environment and install Python dependencies
python -m venv .venv
# Windows:
.venv\Scripts\python -m pip install -r app/requirements/base.txt -r app/requirements/workspace-api.txt
# Linux/macOS:
.venv/bin/python -m pip install -r app/requirements/base.txt -r app/requirements/workspace-api.txt

# 4. Build the backend (emits dist/backend/index.js)
npm run build
```

On Windows you can use the guided installer instead of the manual steps:

```bash
npm run setup
```

---

## Quick start (no API key required)

OneShot ships with a deterministic **`sample`** provider (no keys, no network) so you can prove the whole chain end-to-end immediately:

```bash
npm run build:backend
npm run demo
```

`demo` runs a full canonical build through the sandbox and prints the hash proof. The default mode is `sample`.

To start the HTTP server (web UI on `http://localhost:8787`):

```bash
npm run build
npm start
```

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

## Provider configuration (single authority)

Provider selection is governed by **one** config authority: `ProviderManager`. It reads the catalog from `backend/config/providers.json` and the persisted runtime config, resolves the active provider per run, builds the adapter, and hands a ready `ResearchProvider` to the Researcher role. There is no competing environment-based provider resolver in the production path.

```jsonc
// backend/config/providers.json (see in-repo copy for full contents)
{
  "version": 1,
  "providers": {
    "sample":      { "label": "OneShot Sample",           "type": "fixture",    "credentialType": "none" },
    "featherless": { "label": "Featherless AI",           "type": "featherless", "credentialType": "api_key",
                     "credentialEnv": "FEATHERLESS_API_KEY" },
    "adk_gemma2":  { "label": "Google ADK / Gemma",       "type": "adk_gemma2",  "credentialType": "api_key" }
  }
}
```

Available providers:

- **`sample`** — deterministic `FixtureResearchProvider`. No keys. Default.
- **`featherless`** — OpenAI-compatible cloud API. Set `FEATHERLESS_API_KEY`.
- **`adk_gemma2`** — Google ADK native Gemini pipeline. Requires three distinct model bindings (`GEMINI_DISTRIBUTION_MODEL`, `GEMINI_RESEARCH_MODEL`, `GEMINI_SYNTHESIS_MODEL`) and Google auth/Vertex (see `app/env/.env.example`).

Select the active provider and (re)submit credentials from the **Provider Configuration drawer** in the web UI, or via the HTTP provider endpoints. Credentials are stored write-only in the secret store (never served back) — see `app/env/.env.example` for `ONESHOT_SECRETS_DIR`. Env-provided keys take precedence over the secret store; do **not** commit real keys.

All configuration placeholders live in `app/env/.env.example` — copy to `app/env/.env` and fill in only what you need.
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

Sandbox admission requires an authentic confirmed package and an exact canonical hash before anything executes. See `RUNTIME_CONTAINMENT_IMPLEMENTATION.md`.

---

## Verification

```bash
npm run verify          # canonical production verification (python app/scripts/verify_all.py)
npm test                # TypeScript backend test suite
npm --prefix app/web test
npm run guard:layout    # root-layout policy report
```

`npm run verify` runs, in order: dependency pin check, Python unit tests (`backend/tests/python`), the workspace-API checks, a clean `npm run build`, and the full TypeScript test suite (`dist/backend/tests/ts`). It prints `ONESHOT_PRODUCTION_E2E_VERIFIED` on success.

Two E2E tests that need real Google credentials are gated and skipped by default (`ONESHOT_LIVE_GEMINI_E2E=true`).

---

## Docker

```bash
docker build -t oneshot:latest .
docker run -d -p 8787:8787 --name oneshot-runner oneshot:latest
```

Provider credentials never live inside the image. Mount a Docker secret and point `ONESHOT_SECRETS_DIR` at it (see `Dockerfile`).

---

## Repository layout

```
backend/            TypeScript backend (workflow, roles, runtime, sandbox, server)
  contracts/        canonical shared types
  config/           provider catalog
  runtime/          event bus, run repo, provider manager, queue, redis
  sandbox/          hardened execution + admission
  skills/           reusable skill system
  tests/            Python + TypeScript test suites
app/                web UI (app/web), bootstrap (app/bootstrap), scripts, requirements
scripts/            bootstrap, judge, oneshot, guard, installation
docs/               architecture, judge, provider, run-job-contract documentation
```

---

## License

OneShot-owned source is provided under the [OneShot Evaluator License](LICENSE). Third-party software remains under its own upstream licenses; see [NOTICE](NOTICE) and [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES/).