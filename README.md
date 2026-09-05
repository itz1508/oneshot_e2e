# OneShot

OneShot is an agentic build-and-prove system. It takes a goal and runs study → plan → refactor → gap-analysis → triple-validation → confirmation → sandbox-build → hash-verification as one canonical workflow, reporting `PASSED` only when it can produce a machine-verifiable hash proof.

---

## 1. Check requirements

Before installing, verify your machine has:

| Tool | Version | Check command |
|------|---------|---------------|
| Node.js | >= 24.13.0 | `node --version` |
| npm | >= 11.8.0 | `npm --version` |
| Python | 3.11+ (3.12 verified) | `python --version` |
| Redis | 7.x (optional) | only needed for the BullMQ run queue |
| Docker | (optional) | only needed for containerized sandbox |

If any tool is missing, install it first.

---

## 2. Install

```bash
# Clone the repository
git clone https://github.com/itz1508/oneshot_e2e.git
cd oneshot_e2e

# Install Node dependencies
npm ci
npm --prefix app/web ci

# Create Python virtual environment + install Python deps
python -m venv .venv
# Windows:
.venv\Scripts\python -m pip install -r app/requirements/base.txt -r app/requirements/workspace-api.txt
# Linux/macOS:
.venv/bin/python -m pip install -r app/requirements/base.txt -r app/requirements/workspace-api.txt

# Build backend + frontend
npm run build
```

**Windows shortcut:** `npm run setup` does the above interactively.

---

## 3. Launch and verify

```bash
# Start the server (web UI on http://localhost:8787)
npm start
```

Or run a deterministic end-to-end demo (no API key needed):

```bash
npm run build:backend
npm run demo
```

### Verify everything works

```bash
npm run verify          # canonical production verification
npm test                # TypeScript backend test suite
npm --prefix app/web test   # web tests
npm run guard:layout    # root-layout policy check
```

`npm run verify` runs: dependency pin check → Python unit tests → workspace-API checks → clean build → full TypeScript test suite. It prints `ONESHOT_PRODUCTION_E2E_VERIFIED` on success.

---

## 4. Open the Judge

```bash
npm run judge
```

This inspects your environment, installs dependencies if needed, builds, starts the server, verifies health, and opens the live application.

Full judge documentation: [docs/judge/START_HERE.md](docs/judge/START_HERE.md)

---

## Optional: Redis run queue

By default the server executes runs inline. If Redis is available, runs are scheduled through a BullMQ worker. When Redis is unreachable OneShot logs `ONESHOT_QUEUE_REDIS_UNAVAILABLE` and falls back to inline execution — it remains fully functional.

```bash
docker run -d -p 6379:6379 redis:7
```

Runtime state (runs, events, checkpoints, sandbox workspaces, conversations) is written under `.runtime/` and is git-ignored.

---

## Optional: Docker

```bash
docker build -t oneshot:latest .
docker run -d -p 8787:8787 --name oneshot-runner oneshot:latest
```

Provider credentials never live inside the image. Mount a Docker secret and point `ONESHOT_SECRETS_DIR` at it.

> **Status:** Dockerfile and compose file reference current paths. The Docker image build is **not verified** in this session — run `docker build -t oneshot:latest .` and confirm it succeeds before shipping.

---

## Failure recovery

A legitimate sandbox/build/validation failure is not the end of a run. OneShot classifies the failure, collects bounded evidence, determines a root cause, produces an actionable recommendation, and — only when justified and policy-approved — retries.

The main workspace shows: *Failure detected · What failed · Why · Recommended fix · Status* (`Ready to retry`, `Needs configuration change`, `Additional research performed`, or `Manual review required`).

Run Context exposes: normalized failure category, evidence ids, retry count, whether research escalation occurred, and the selected provider/model snapshot (never secrets).

---

## Repository layout

```
backend/            TypeScript backend (workflow, roles, runtime, sandbox, server)
  contracts/        canonical shared types
  config/           provider catalog
  recovery/         failure taxonomy, root cause, research escalation, retry policy
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
