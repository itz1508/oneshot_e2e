# OneShot Production E2E 1.3.0

Deterministic AI execution platform combining strict Draft 2020-12 schema validation, multi-turn conversational intent collection, verifiable AI research providers (Google ADK & Featherless), multi-stage planning, refactoring, triple validation (Schema, Fixture, Goal), RFC 8785 canonicalization, cryptographic SHA-256 hashing, isolated sandbox execution, and a standalone FastAPI Workspace API control plane.

Licensed under the **Apache License, Version 2.0** for all workflow processing components.

> **ðŸ“‹ Hackathon judges:** See [JUDGE_README.md](JUDGE_README.md) for a focused quick-start guide.

---

## âš¡ 60-Second Start

### Prerequisites
- **Node.js 20+** â€” [nodejs.org](https://nodejs.org)
- **Python 3.11+** â€” [python.org](https://www.python.org)

### Setup and launch (one command)

```bash
git clone https://github.com/itz1508/oneshot_e2e.git
cd oneshot_e2e
npm run oneshot
```

`npm run oneshot` detects Windows, macOS, or Linux; checks Node.js and Python; creates `.venv`; installs the required Python, root Node, and `web/` dependency profiles; builds the backend and React IDE; verifies canonical contracts and `MANIFEST.sha256`; runs all 49 Python and 49 TypeScript tests; starts the real backend; waits for `/api/health`; and opens `http://localhost:8787` in the default browser.

### Run Tests
```bash
npm test          # 49 TypeScript tests
npm run verify    # Full 98-test suite (Python + TypeScript)
```

### Start the Server (without demo launcher)
```bash
npm run build
npm start
```
Open **http://localhost:8787** for the real-time IDE.

---

## ðŸ›ï¸ Repository Architecture

```text
oneshot_e2e/
â”œâ”€ backend/        OneShot backend/runtime authority
â”œâ”€ schema/         OneShot canonical contracts
â”œâ”€ validation/     OneShot deterministic proof
â”œâ”€ workspace_api/  OneShot workspace/control-plane support
â”œâ”€ web/            OneShot React IDE
â””â”€ ui/             legacy OneShot standalone UI
```

---

## 1. Canonical Workflow Pipeline

The OneShot execution engine follows an immutable, deterministic pipeline:

```text
Chat / Multi-turn Intent Collection
 â””â”€â”€ Intent(id) revision
      â””â”€â”€ Prompt_id
           â””â”€â”€ Researcher
                â””â”€â”€ Researcher(id)
                     â””â”€â”€ Planner
                          â””â”€â”€ audit_id
                               â””â”€â”€ Refactor
                                    â””â”€â”€ same plan_id
                                         â””â”€â”€ Gap Analysis
                                              â””â”€â”€ gap_0 + plan_id
                                                   â””â”€â”€ Evaluation
                                                        â””â”€â”€ plan_id
                                                             â”œâ”€â”€ Schema Validation â”€â”€â”
                                                             â”œâ”€â”€ Fixture Validation â”€â”€â”¼â”€ Triple Validation
                                                             â””â”€â”€ Goal Validation â”€â”€â”€â”€â”˜      â”‚
                                                                                            v
                                                                                       all VALID
                                                                                            â”‚
                                                                                            v
                                                                                        CONFIRMED
                                                                                            â”‚
                                                                                            v
                                                                                       CREATE HASH
                                                                                            â”‚
                                                                                            v
                                                                                          HASH
                                                                                            â”‚
                                                                                            v
                                                                                          DONE
                                                                                            â”‚
                                                                                            v
                                                                                    Sandbox Execution
```

For the complete detailed hierarchy and source-of-truth specification, see [`docs/WORKFLOW_TREE`](docs/WORKFLOW_TREE) and [`CANONICAL_WORKFLOW.md`](CANONICAL_WORKFLOW.md).

---

## 2. Multi-Tier Subsystem Ownership

- **JSON Schema Draft 2020-12 (`schema/`)**: Single structural source of truth for all 21 artifact, event, and validation payload contracts.
- **Python Canonical Engine (`validation/`)**: Strict Pydantic model validation, reference resolution, fixture assertion execution, schema parity proof, RFC 8785 canonicalization (JCS), and SHA-256 verification.
- **TypeScript Runtime (`backend/`)**: Multi-turn Intent collection, Role workflow orchestration, provider resolution, append-only Task Management event store, W3C trace propagation, checkpoint projections, and fast HTTP/SSE server.
- **Workspace API Control Plane (`workspace_api/`)**: FastAPI control plane providing multi-tenant workspaces, encrypted API keys, provider routing, rate limiting, and token analytics.
- **OneShot React IDE (`web/`)**: Event-driven React frontend providing user interaction, live workflow visualization, task state tracking, artifact inspection, and sandbox execution proofs.

---

## 3. Installation & Dependency Bootstrap

### Prerequisites
- **Node.js**: $\ge 20.0.0$
- **Python**: $\ge 3.11$ (Python 3.12 recommended)
- **Git**

### Step 1: Clone Repository
```bash
git clone https://github.com/itz1508/oneshot_e2e.git
cd oneshot_e2e
```

### Step 2: Bootstrap Dependencies

#### Option A: Base Environment (Standard Local Workflow)
Installs base Python requirements and locked, offline npm packages from `vendor/npm/`:
```bash
python scripts/bootstrap.py
```
*(Or install manually:)*
```bash
npm ci --offline --ignore-scripts --no-audit --no-fund
pip install -r requirements.txt
```

#### Option B: With Google ADK + Local Gemma 2 Provider
Installs Google ADK, LiteLLM, and Ollama bridge dependencies:
```bash
python scripts/bootstrap.py --with-adk
```
*(Or `pip install -r requirements-adk.txt`)*

#### Option C: With Featherless Cloud Provider
Installs OpenAI-compatible client libraries for Featherless API (`google/gemma-4-31B-it`):
```bash
python scripts/bootstrap.py --with-featherless
```
*(Or `pip install -r requirements-featherless.txt`)*

#### Option D: With Workspace API Sidecar Control Plane
Installs FastAPI, SQLAlchemy, Redis, JWT,and security libraries:
```bash
python scripts/bootstrap.py --with-workspace-api
```
*(Or `pip install -r requirements-workspace-api.txt`)*

---

## 4. Running the Platform

### Start the OneShot IDE & HTTP Server

Copy `.env.example` to `.env` to configure the Node runtime. On Node.js 20.12+, the launchers and compiled backend load it automatically; variables already set by the parent process take precedence. With an earlier Node.js 20 release, set the variables in the parent process instead.

```bash
npm run build
npm start
```
Open your browser at **`http://localhost:8787`**.

The Node server binds to `127.0.0.1` by default. External binding is an explicit authenticated mode:

```bash
ONESHOT_BIND_HOST=0.0.0.0 ONESHOT_API_TOKEN="replace-with-a-secret" npm start
```

When `ONESHOT_API_TOKEN` is configured, every `/api`, `/api/*`, `/v1`, and `/v1/*` requestâ€”including `/api/health`â€”must send `Authorization: Bearer <token>`. Static UI assets remain public. The browser bundle never embeds the server token, so token-enabled operation is intended for authenticated launchers, probes, and API clients.

Use `.env.workspace.example` for the FastAPI sidecar and `web/env.example` for Vite development-proxy settings. Real `.env*`, credentials, private keys, secrets, and `data/` are ignored and excluded from source archives.

### Research Provider Configuration Modes

#### 1. Sample Mode (Default / Deterministic Benchmark)
```bash
export ONESHOT_MODE=sample
npm start
```

#### 2. Local AI Production Mode (Google ADK + Ollama Gemma 2 + Redis)
Start the local AI containers and run:
```bash
docker compose -f deploy/docker/docker-compose.local-ai.yml up -d
export ONESHOT_MODE=production
export ONESHOT_RESEARCH_PROVIDER=adk_gemma2
npm start
```

#### 3. Cloud Production Mode (Featherless Gemma 4)
```bash
export ONESHOT_MODE=production
export ONESHOT_RESEARCH_PROVIDER=featherless
export FEATHERLESS_API_KEY="your_api_key_here"
npm start
```

### Starting the FastAPI Workspace API Sidecar
```bash
python scripts/verify_workspace_api.py
uvicorn workspace_api.main:app --host 0.0.0.0 --port 8080
```

---

## 5. Comprehensive Verification

Run the full end-to-end multi-tier verification suite:
```bash
python scripts/verify_all.py
```

This master script verifies:
1. **Dependency Versions**: Exact pinned versions across Python and Node.
2. **Python Canonical Engine**: 49 unit tests including schema validator, model parity, graph validator, fixture assertions, JCS canonicalization, Workspace API, path portability, and archive secret-selection parity.
3. **TypeScript Compilation**: `tsc -p tsconfig.json`.
4. **TypeScript E2E Test Suite**: 49 E2E integration tests including ADK adapter, Featherless adapter, intent collection, runtime path relocation, sandbox boundary, SSE server, task management, and workspace filesystem security.

### Specialized Verification Commands
```bash
# Verify checksum manifest integrity
python scripts/verify_manifest.py

# Verify Workspace API endpoints & OpenAPI schema
python scripts/verify_workspace_api.py

# Live test for Google ADK + Ollama (requires Ollama running)
python scripts/verify_adk_live.py

# Live test for Featherless API (requires FEATHERLESS_API_KEY)
node scripts/verify_featherless_live.mjs

# Ollama preflight check
python scripts/ollama_preflight.py
```

---

## 6. Durable State & Storage Layout

- `data/conversations/`: Multi-turn conversational history and intent revisions.
- `data/run-state/`: Run snapshots and active execution state.
- `data/runs/`: Canonical workflow artifacts (`prompt.json`, `researcher.json`, `plan.gap.json`, `audit.json`, `evaluation.json`, `triple-validation.json`, `confirmed.json`, `hash-proof.json`).
- `data/task-events/`: Append-only monotonic event logs (`<run_id>.jsonl`).
- `data/checkpoints/`: Milestone execution checkpoints.
- `data/sandbox-workspaces/`: Ephemeral isolated sandbox workspaces.

---

## 7. Reusable Skills & Tools

The platform provides 5 built-in skills with 26 callable tools:

1. **`oneshot-canonical-contracts`** (Python): `validate_schema`, `validate_artifact`, `validate_references`, `validate_parity`, `validate_registry`, `validate_graph`, `resolve_artifact`, `trace_artifact`, `run_fixture`, `canonicalize`, `create_hash`, `verify_hash`.
2. **`oneshot-task-runtime`** (TypeScript): `project_run`, `audit_run`, `project_adk_graph`, `project_authority_graph`.
3. **`oneshot-intent-collection`** (TypeScript): `get_intent`, `project_intent_graph`.
4. **`oneshot-sandbox-runtime`** (TypeScript): `verify_admission`, `execute_sandbox`, `audit_sandbox`, `project_sandbox_graph`.
5. **`oneshot-init`** (TypeScript): `init_workspace`, `check_preflight`.

For reusable-skill vs. role placement rules, see [`.agents/rules/oneshot-skill-architecture.md`](.agents/rules/oneshot-skill-architecture.md); for canonical workflow ordering, see [`CANONICAL_WORKFLOW.md`](CANONICAL_WORKFLOW.md). Contributor guidelines live in [`AGENTS.md`](AGENTS.md).

---

## 8. License

All workflow processing code, contracts, runtime engines, validation frameworks, and tooling in this repository are open-source software licensed under the **Apache License, Version 2.0**.

See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE) for full terms.
