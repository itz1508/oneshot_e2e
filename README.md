# OneShot

OneShot is a production E2E research pipeline built on a Google ADK 2.0 workflow graph. It orchestrates planner, researcher, and synthesis roles across pluggable providers (native Gemini / Google ADK, Featherless, Tavily-backed evidence research), exposes a workspace HTTP API, and ships with a web UI, a Python runtime bridge, and a full verification suite.

## Requirements

- Node.js >= 24.13.0
- npm >= 11.8.0
- Python >= 3.11
- Git (for cloning) — Docker optional

## Install

One command bootstrap (installs everything and verifies the environment):

```bash
npm run oneshot
```

Manual install, if you prefer step by step:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm --prefix app/web ci --ignore-scripts --no-audit --no-fund
python -m pip install --disable-pip-version-check -r app/requirements/base.txt
python -m pip install --disable-pip-version-check -r app/requirements/workspace-api.txt
npm run build
```

## Run

Sample mode — no API key required:

```bash
npm run demo
```

Production mode with a real provider — set the environment, then run the same command.

PowerShell (Featherless):

```powershell
$env:ONESHOT_MODE="production"
$env:ONESHOT_RESEARCH_PROVIDER="featherless"
$env:FEATHERLESS_API_KEY="your_featherless_api_key"
npm run demo
```

Linux/macOS (native Gemini):

```bash
ONESHOT_MODE=production ONESHOT_RESEARCH_PROVIDER=adk_gemma2 GEMINI_API_KEY="your_gemini_api_key" npm run demo
```

Provider and model configuration lives in `app/env/` (see `gemini.env.example`, `featherless.env.example`, and friends).

## Verify

```bash
npm test          # build backend + run full TypeScript test suite
npm run verify    # run Python production verification
```

## Docker

```bash
docker build -t oneshot:latest .
docker run -d -p 8787:8787 --name oneshot-runner oneshot:latest
```

## Project layout

```
app/
  bootstrap/     one-command setup + demo entry points
  env/           provider/model environment examples
  fixtures/      deterministic fixtures for tests and demos
  requirements/  pinned Python dependency sets (base, workspace-api, ...)
  scripts/       Python runtime + verification scripts
  web/           web UI (React + Vite)
  workspace_api/ workspace HTTP API
backend/         TypeScript backend: ADK workflow graph, roles, providers, skills, tests
scripts/         Node tooling (oneshot bootstrap, judge, layout guard)
docs/            architecture and integration notes
```

## License

Apache-2.0 — see the `license` field in [package.json](package.json).

