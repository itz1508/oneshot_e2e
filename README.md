# OneShot Production E2E 1.3.0

OneShot is a governed AI engineering workflow that turns user intent into researched, planned, validated, executed, and cryptographically verified work.

The runtime combines TypeScript orchestration, Google ADK graph routing, strict JSON Schema contracts, deterministic Python validation, RFC 8785 canonicalization, SHA-256 proof, isolated execution, and an event-driven React IDE.

**Release:** `1.3.0` · **Local UI:** `http://localhost:8787`  
**Video:** [YouTube](https://www.youtube.com/watch?v=RQTxYwcNx_0) · **Judge quick start:** [JUDGE_README.md](JUDGE_README.md)

---

## Install OneShot

<details>
<summary><strong>Windows — Download ZIP</strong> · Recommended · Click to install</summary>

1. Download the `oneshot-judge-1.3.0.zip` release package.
2. Extract the ZIP.
3. Start Docker Desktop.
4. Run:

   ```powershell
   .\start-oneshot.ps1
   ```

5. Open `http://localhost:8787`.

No Node.js, Python, npm, or Git is required on the host for this packaged path.

</details>

<details>
<summary><strong>CLI</strong> · Terminal installation · Click for <strong>Review steps</strong></summary>

1. Install Node.js 20+, Python 3.11+, and Git.
2. Clone OneShot:

   ```bash
   git clone https://github.com/itz1508/oneshot_e2e.git
   cd oneshot_e2e
   ```

3. Launch:

   ```bash
   npm run oneshot
   ```

4. Open `http://localhost:8787`.

</details>

<details>
<summary><strong>Developer / Source</strong> · Build from source · Click for <strong>Review steps</strong></summary>

1. Clone the repository.
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

5. Open `http://localhost:8787`.

</details>

---

## Workflow

<details>
<summary><strong>Review Workflow</strong> · Google ADK graph · Click for full route</summary>

The live graph in OneShot is driven by backend execution events for the active `Job_id`.

```text
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

**Core invariants**

- Researcher owns the plan, schema, fixture, goal, and validation artifacts.
- Planner consumes the plan and produces `audit_id`.
- Refactor preserves the same logical `plan_id` with revision provenance.
- Gap Analysis reaches `gap_0` before Evaluation proceeds.
- Schema, Fixture, and Goal validation fan out independently and join before the validation gate.
- Confirmation freezes the comparable package core.
- Hashing uses RFC 8785 canonicalization and SHA-256.
- Post-build verification compares the same canonical comparable representation; equality routes to `DONE`.

Supporting material: [Workflow Tree](docs/WORKFLOW_TREE) · [workflow/](workflow/) · [Task Management and ADK Graph](docs/TASK_MANAGEMENT_AND_ADK_GRAPH.md)

</details>

---

## Project Details

<details>
<summary><strong>Architecture</strong> · Runtime boundaries and repository layout</summary>

| Layer | Responsibility |
| --- | --- |
| `backend/` | TypeScript runtime, role orchestration, ADK graph routing, HTTP/SSE, Builder handoff |
| `schema/` | JSON Schema Draft 2020-12 contracts |
| `validation/` | Deterministic Python validation, RFC 8785 canonicalization, SHA-256 proof |
| `web/` | React 19 + Vite event-driven IDE |
| `workspace_api/` | Optional FastAPI multi-workspace control-plane service |
| `workflow/` | Graph specifications and topology |
| `skill/` | Reusable OneShot skills and tools |

```text
oneshot_e2e/
├── backend/
├── web/
├── schema/
├── validation/
├── workspace_api/
├── requirements/
├── skill/
├── workflow/
├── tests/
├── tests_ts/
├── scripts/
├── deploy/
│   ├── docker/
│   └── judge/
├── docs/
├── dist/
├── pyproject.toml
├── package.json
├── package-lock.json
├── Dockerfile
├── docker-compose.yml
├── AGENTS.md
├── JUDGE_README.md
└── MANIFEST.sha256
```

</details>

<details>
<summary><strong>Python Dependency Profiles</strong> · Click to review</summary>

`pyproject.toml` is the Python dependency declaration authority. Pinned installation profiles live under `requirements/`.

| Profile | Purpose |
| --- | --- |
| `requirements/core.txt` | Deterministic production validation runtime |
| `requirements/provider-adk.txt` | Optional Google ADK research worker |
| `requirements/provider-featherless.txt` | Optional Featherless provider |
| `requirements/workspace-api.txt` | Optional FastAPI workspace service |

```bash
# Core
python scripts/bootstrap.py

# Optional profiles
python scripts/bootstrap.py --with-adk
python scripts/bootstrap.py --with-featherless
python scripts/bootstrap.py --with-workspace-api
```

</details>

<details>
<summary><strong>Research Provider Modes</strong> · Click to review</summary>

### Deterministic sample mode

```bash
export ONESHOT_MODE=sample
npm start
```

### Google ADK + local Gemma

```bash
docker compose -f deploy/docker/docker-compose.local-ai.yml up -d
export ONESHOT_MODE=production
export ONESHOT_RESEARCH_PROVIDER=adk_gemma2
npm start
```

### Featherless

```bash
export ONESHOT_MODE=production
export ONESHOT_RESEARCH_PROVIDER=featherless
export FEATHERLESS_API_KEY="your_api_key_here"
npm start
```

</details>

<details>
<summary><strong>Verification</strong> · Locked 1.3.0 baseline · Click to review</summary>

| Verification | Result |
| --- | ---: |
| Python unit tests | 49 / 49 |
| Node E2E + ADK graph tests | 57 / 57 |
| React IDE Vitest | 104 / 104 |
| Source manifest | 480 / 480 |
| Dependency profiles | `ONESHOT_DEPENDENCIES_PINNED profile=all` |
| Production image | `oneshot:1.3.0` |
| Judge clean-room package | `PASSED` |

```bash
npm run verify
python scripts/verify_dependencies.py --profile all
python scripts/verify_manifest.py
npm --prefix web test
```

</details>

<details>
<summary><strong>Docker Environments</strong> · Click to review</summary>

```text
Production
├── Dockerfile
└── docker-compose.yml

Supplemental
└── deploy/docker/
    ├── local AI
    ├── sandbox
    └── GPU configurations

Distribution
└── deploy/judge/
```

The generated judge bundle is `dist/oneshot-judge-1.3.0.zip` in the release build workspace.

</details>

<details>
<summary><strong>Documentation</strong> · Click to review</summary>

- [Workflow Tree](docs/WORKFLOW_TREE)
- [Google ADK + Gemma integration](docs/ADK_GEMMA2_INTEGRATION.md)
- [Task Management and ADK Graph](docs/TASK_MANAGEMENT_AND_ADK_GRAPH.md)
- [Intent Authority and Help](docs/INTENT_AUTHORITY_AND_HELP.md)
- [Workspace API Design](docs/WORKSPACE_API_DESIGN.md)
- [IDE Build Record](docs/ONESHOT_IDE_BUILD_RECORD.md)

</details>

---

## Running From Source

```bash
npm run build
npm start
```

Open `http://localhost:8787`.

`ONESHOT_API_TOKEN` secures the local OneShot API session. It is not a third-party AI-provider API key.

---

## License

This repository currently declares the Apache License, Version 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
