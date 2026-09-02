# OneShot Production E2E 1.3.0

OneShot is a governed AI engineering workflow that turns user intent into researched, planned, validated, executed, and cryptographically verified work.

The runtime combines a TypeScript orchestration layer, Google ADK graph routing, strict JSON Schema contracts, deterministic Python validation, RFC 8785 canonicalization, SHA-256 proof, isolated execution, and an event-driven React IDE.

**Release:** `1.3.0`  
**Local UI:** `http://localhost:8787`  
**Video walkthrough:** [YouTube](https://www.youtube.com/watch?v=RQTxYwcNx_0)  
**Judge quick start:** [JUDGE_README.md](JUDGE_README.md)

---

## Quick Start

Choose the path that matches how you want to run it:

```bash
# Fastest judge path
./start-oneshot.sh
# or on Windows
.\start-oneshot.ps1
```

<details>
<summary><strong>Install options</strong> · Click to expand</summary>

### Windows — Download ZIP

1. Download the `oneshot-judge-1.3.0.zip` release package.
2. Extract the ZIP.
3. Start Docker Desktop.
4. Run:

   ```powershell
   .\start-oneshot.ps1
   ```

5. Open `http://localhost:8787`.

### CLI

```bash
git clone https://github.com/itz1508/oneshot_e2e.git
cd oneshot_e2e
npm run oneshot
```

### Developer / Source

```bash
python scripts/bootstrap.py
npm run build
npm start
```

</details>

---

## What OneShot Proves

A successful run does not stop at model output. OneShot preserves artifact ownership, validates the completed plan, executes the confirmed package, and verifies the result against the same canonical comparable representation.

```text
User intent
   ↓
Prompt_id
   ↓
Researcher(Job_id)
   ↓
Planner
   ↓
Refactor
   ↓
Gap Analysis
   ↓
Evaluation
   ↓
Triple Validation
   ↓
Confirmed package
   ↓
Builder execution
   ↓
Hash Verification
   ↓
DONE
```

Workflow operations use `PASSED | ROOT CAUSE`. Validation operations use `VALID | NOT_VALID`.

---

## Review Workflow

<details>
<summary><strong>Review Workflow</strong></summary>

This is a static overview of the runtime topology. The live graph in OneShot is driven by backend execution events for the active `Job_id`.

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

Key invariants:

- Researcher owns the plan, schema, fixture, goal, and validation artifacts.
- Planner consumes the plan and produces `audit_id`.
- Refactor preserves the same logical `plan_id` with revision provenance.
- Gap Analysis must reach `gap_0` before Evaluation proceeds.
- Schema, Fixture, and Goal validation fan out independently and join before the validation gate.
- Confirmation freezes the comparable package core.
- Hashing uses RFC 8785 canonicalization and SHA-256.
- Post-build verification compares the same canonical comparable representation; equality routes to `DONE`.

See [docs/WORKFLOW_TREE](docs/WORKFLOW_TREE), [workflow/](workflow/), and [docs/TASK_MANAGEMENT_AND_ADK_GRAPH.md](docs/TASK_MANAGEMENT_AND_ADK_GRAPH.md) for supporting workflow material.

</details>

---

<details>
<summary><strong>Architecture and repo map</strong> · Click to expand</summary>

| Layer | Responsibility |
| --- | --- |
| `backend/` | TypeScript runtime, role orchestration, ADK graph routing, HTTP/SSE, Builder handoff |
| `schema/` | JSON Schema Draft 2020-12 contracts |
| `validation/` | Deterministic Python validation, RFC 8785 canonicalization, SHA-256 proof |
| `web/` | React 19 + Vite event-driven IDE |
| `workspace_api/` | Optional FastAPI multi-workspace control-plane service |
| `workflow/` | Graph specifications and topology |
| `skill/` | Reusable OneShot skills and tools |

### Repository layout

```text
oneshot_e2e/
├── backend/
├── web/
├── schema/
├── validation/
├── workspace_api/
│
├── requirements/
│   ├── core.txt
│   ├── provider-adk.txt
│   ├── provider-featherless.txt
│   └── workspace-api.txt
│
├── skill/
├── workflow/
├── tests/
├── tests_ts/
├── scripts/
│
├── deploy/
│   ├── docker/
│   └── judge/
│
├── docs/
├── dist/
│
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

---

<details>
<summary><strong>Python dependency profiles</strong> · Click to expand</summary>

`pyproject.toml` is the Python dependency declaration authority. Pinned installation profiles live under `requirements/`.

<details>
<summary><strong>Core runtime</strong> · <strong>Review steps</strong></summary>

```bash
python scripts/bootstrap.py
```

Installs the deterministic Python validation runtime used by the production build.

</details>

<details>
<summary><strong>Google ADK research provider</strong> · Optional · <strong>Review steps</strong></summary>

```bash
python scripts/bootstrap.py --with-adk
```

Installs the Python Google ADK research-worker profile when that provider is enabled.

</details>

<details>
<summary><strong>Featherless provider</strong> · Optional · <strong>Review steps</strong></summary>

```bash
python scripts/bootstrap.py --with-featherless
```

Installs the Featherless research-provider profile.

</details>

<details>
<summary><strong>Workspace API</strong> · Optional service · <strong>Review steps</strong></summary>

```bash
python scripts/bootstrap.py --with-workspace-api
```

Installs the standalone FastAPI workspace service profile.

</details>

---

## Running From Source

```bash
npm run build
npm start
```

Open `http://localhost:8787`.

For explicit external binding:

```bash
ONESHOT_BIND_HOST=0.0.0.0 ONESHOT_API_TOKEN="replace-with-a-secret" npm start
```

`ONESHOT_API_TOKEN` secures the local OneShot API session; it is not a third-party provider key.

---

<details>
<summary><strong>Research provider modes</strong> · Click to expand</summary>

<details>
<summary><strong>Deterministic sample mode</strong></summary>

```bash
export ONESHOT_MODE=sample
npm start
```

Uses the reproducible sample provider and requires no external inference service.

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

---

<details>
<summary><strong>Verification</strong> · Click to expand</summary>

Locked 1.3.0 baseline:

| Verification | Result |
| --- | ---: |
| Python unit tests | 49 / 49 |
| Node E2E + ADK graph tests | 57 / 57 |
| React IDE Vitest | 104 / 104 |
| Source manifest | 480 / 480 |
| Dependency profiles | `ONESHOT_DEPENDENCIES_PINNED profile=all` |
| Production image | `oneshot:1.3.0` |
| Judge clean-room package | `PASSED` |

Run the complete verification suite:

```bash
npm run verify
```

Focused verification:

```bash
python scripts/verify_dependencies.py --profile all
python scripts/verify_manifest.py
python -m unittest discover -s tests -v
npm --prefix web test
```

Production Docker build:

```bash
docker build -t oneshot:1.3.0 .
```

</details>

---

<details>
<summary><strong>Docker environments</strong> · Click to expand</summary>

The repository keeps the normal production path separate from supplemental environments.

```text
Root
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

---

<details>
<summary><strong>Documentation</strong> · Click to expand</summary>

Useful references:

- [Workflow Tree](docs/WORKFLOW_TREE)
- [Google ADK + Gemma integration](docs/ADK_GEMMA2_INTEGRATION.md)
- [Task Management and ADK Graph](docs/TASK_MANAGEMENT_AND_ADK_GRAPH.md)
- [Intent Authority and Help](docs/INTENT_AUTHORITY_AND_HELP.md)
- [Workspace API Design](docs/WORKSPACE_API_DESIGN.md)
- [IDE Build Record](docs/ONESHOT_IDE_BUILD_RECORD.md)

</details>

---

## License

This repository currently declares the Apache License, Version 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
