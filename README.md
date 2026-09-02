# OneShot Production E2E 1.3.0

Deterministic AI execution platform combining strict Draft 2020-12 schema validation, multi-turn conversational intent collection, verifiable AI research providers (Google ADK & Featherless), multi-stage planning, refactoring, triple validation (Schema, Fixture, Goal), RFC 8785 canonicalization, SHA-256 verification, isolated sandbox execution, and workspace tooling.

Licensed under the **Apache License, Version 2.0** for all workflow processing components.

> **Hackathon judges:** See [JUDGE_README.md](JUDGE_README.md) for the focused evaluation quick start.

---

## Install OneShot

Choose one installation path. All instructions are collapsed by default; select **Review steps** only when needed.

<details>
<summary><strong>Windows — Download ZIP</strong> · Recommended · <strong>Review steps</strong></summary>

1. Download the OneShot ZIP release package.
2. Extract the ZIP.
3. Start Docker Desktop.
4. Run:

   ```powershell
   .\start-oneshot.ps1
   ```

5. Open `http://localhost:8787`.

</details>

<details>
<summary><strong>CLI</strong> · Terminal installation · <strong>Review steps</strong></summary>

1. Install Node.js 20+ and Python 3.11+.
2. Clone OneShot and enter the repository:

   ```bash
   git clone https://github.com/itz1508/oneshot_e2e.git
   cd oneshot_e2e
   ```

3. Launch:

   ```bash
   npm run oneshot
   ```

</details>

<details>
<summary><strong>Developer / Source</strong> · Build from source · <strong>Review steps</strong></summary>

1. Clone OneShot.
2. Bootstrap dependencies:

   ```bash
   python scripts/bootstrap.py
   ```

3. Build:

   ```bash
   npm run build
   ```

4. Launch:

   ```bash
   npm start
   ```

</details>

---

## Repository Architecture

```text
oneshot_e2e/
├─ backend/        OneShot backend/runtime authority
├─ schema/         canonical JSON Schema contracts
├─ validation/     deterministic Python proof/validation
├─ workspace_api/  optional workspace/control-plane service
├─ web/            OneShot React IDE
└─ ui/             legacy standalone UI
```

---

## Workflow

<details>
<summary><strong>Review Workflow</strong></summary>

```text
Prompt_id
   ↓
Researcher(Job_id)
   ↓
Planner
   ↓
Refactor
   ↓
Gap Analysis
   ├─ gaps found → Gap Fix → Recheck ──↺ Gap Analysis
   └─ gap_0
        ↓
Evaluation
   ├─ ROOT_CAUSE → Root Cause
   └─ PASSED
        ↓
   ┌────────────┬────────────┐
   ↓            ↓            ↓
 Schema       Fixture       Goal
 Validation   Validation    Validation
   └────────────┼────────────┘
                ↓
             JoinNode
                ↓
         Validation Gate
         ├─ NOT_VALID → Root Cause
         └─ ALL_VALID
                ↓
            Confirmed
                ↓
             Builder
                ↓
        Hash Verification
         ├─ MATCH → DONE
         └─ MISMATCH → Root Cause
```

The graph view summarizes the real OneShot execution topology: explicit Gap Analysis recheck routing, Evaluation routing, Triple Validation fan-out/fan-in, JoinNode synchronization, validation routing, Builder execution, and final hash verification.

For the governing workflow and contract references, see [`docs/WORKFLOW_TREE`](docs/WORKFLOW_TREE) and [`CANONICAL_WORKFLOW.md`](CANONICAL_WORKFLOW.md).

</details>

---

## Subsystem Ownership

- **JSON Schema Draft 2020-12 (`schema/`)**: structural source of truth for canonical artifact and validation contracts.
- **Python canonical engine (`validation/`)**: strict Pydantic runtime validation, reference resolution, fixture execution, schema parity proof, RFC 8785 canonicalization, and SHA-256 verification.
- **TypeScript runtime (`backend/`)**: intent collection, role orchestration, Google ADK graph routing, task events, checkpoints, HTTP/SSE, sandbox coordination, and Builder handoff.
- **Workspace API (`workspace_api/`)**: optional FastAPI workspace/control-plane service.
- **React IDE (`web/`)**: frontend presentation of runtime state, workflow activity, tasks, artifacts, and execution evidence.

---

## Developer Dependency Profiles

The normal installation choices above stay short. Provider/service dependency details are available only when needed.

<details>
<summary><strong>Core Python runtime</strong> · <strong>Review steps</strong></summary>

```bash
python scripts/bootstrap.py
```

Core validation dependencies support JSON Schema validation, Pydantic runtime models, canonicalization, and deterministic proof.

</details>

<details>
<summary><strong>Google ADK research provider</strong> · Optional · <strong>Review steps</strong></summary>

```bash
python scripts/bootstrap.py --with-adk
```

Use when enabling the Python Google ADK/Gemma research-provider worker.

</details>

<details>
<summary><strong>Featherless research provider</strong> · Optional · <strong>Review steps</strong></summary>

```bash
python scripts/bootstrap.py --with-featherless
```

Use when enabling the Featherless provider worker.

</details>

<details>
<summary><strong>Workspace API</strong> · Optional service · <strong>Review steps</strong></summary>

```bash
python scripts/bootstrap.py --with-workspace-api
```

Use when running the standalone FastAPI workspace/control-plane service.

</details>

---

## Running OneShot

### Start the IDE and backend

Copy `.env.example` to `.env` when local runtime configuration is required.

```bash
npm run build
npm start
```

Open `http://localhost:8787`.

The Node server binds to `127.0.0.1` by default. External binding is an explicit authenticated mode:

```bash
ONESHOT_BIND_HOST=0.0.0.0 ONESHOT_API_TOKEN="replace-with-a-secret" npm start
```

When `ONESHOT_API_TOKEN` is configured, `/api`, `/api/*`, `/v1`, and `/v1/*` requests must send `Authorization: Bearer <token>`.

### Research provider modes

<details>
<summary><strong>Sample mode</strong> · Deterministic default</summary>

```bash
export ONESHOT_MODE=sample
npm start
```

</details>

<details>
<summary><strong>Google ADK + local Gemma</strong></summary>

```bash
docker compose -f deploy/docker/docker-compose.local-ai.yml up -d
export ONESHOT_MODE=production
export ONESHOT_RESEARCH_PROVIDER=adk_gemma2
npm start
```

</details>

<details>
<summary><strong>Featherless</strong></summary>

```bash
export ONESHOT_MODE=production
export ONESHOT_RESEARCH_PROVIDER=featherless
export FEATHERLESS_API_KEY="your_api_key_here"
npm start
```

</details>

<details>
<summary><strong>Workspace API sidecar</strong></summary>

```bash
python scripts/verify_workspace_api.py
uvicorn workspace_api.main:app --host 0.0.0.0 --port 8080
```

</details>

---

## Verification

Run the complete repository verification:

```bash
python scripts/verify_all.py
```

Useful focused commands:

```bash
# Verify checksum manifest integrity
python scripts/verify_manifest.py

# Verify Workspace API endpoints and OpenAPI schema
python scripts/verify_workspace_api.py

# Live Google ADK/Ollama verification
python scripts/verify_adk_live.py

# Live Featherless verification
node scripts/verify_featherless_live.mjs

# Ollama availability check
python scripts/ollama_preflight.py
```

---

## Durable State

- `data/conversations/`: conversational history and intent revisions.
- `data/run-state/`: active execution state.
- `data/runs/`: canonical workflow artifacts and proofs.
- `data/task-events/`: append-only task event logs.
- `data/checkpoints/`: execution checkpoints.
- `data/sandbox-workspaces/`: isolated sandbox workspaces.

---

## Reusable Skills & Tools

The repository includes reusable skills for canonical contracts, task runtime, intent collection, sandbox runtime, and workspace initialization.

For reusable-skill vs. role placement rules, see [`.agents/rules/oneshot-skill-architecture.md`](.agents/rules/oneshot-skill-architecture.md). Contributor guidance is in [`AGENTS.md`](AGENTS.md).

---

## License

All workflow processing code, contracts, runtime engines, validation frameworks, and tooling in this repository are open-source software licensed under the **Apache License, Version 2.0**.

See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE) for full terms.
