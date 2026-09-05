# OneShot

OneShot is an enterprise-grade deterministic AI execution platform that transforms natural language intent into a provably correct, cryptographically hash-verified execution plan. Every operation traverses a canonical state machine governed by JSON Schema Draft 2020-12 contracts, independent multi-tier Triple Validation, RFC 8785 JSON Canonicalization Scheme (JCS), and sandbox isolation.

---

## Agent-First Setup (Primary)

To set up, build, test, and launch OneShot, open this repository in your coding agent (Claude Code, Cursor, Windsurf, Copilot, Antigravity, etc.) and paste the prompt below:

```text
Set up and launch this OneShot repository.

Inspect the repository first. Determine the supported setup from the
actual package scripts, environment examples, bootstrap files, Docker
configuration, and source layout.

Then install missing dependencies, prepare local configuration without
overwriting secrets, build, test, launch the backend and web UI, verify
health and browser rendering, and return the local URL.

Use sample/fixture mode when supported without external credentials.

If a credential is required, tell me only the missing environment
variable name.

Do not fabricate credentials.
Do not print secrets.
Do not deploy.
Do not push.
Do not commit unrelated changes.

Return:
SETUP_RESULT =
BUILD =
TESTS =
BACKEND =
WEB_UI =
LOCAL_URL =
MISSING_CONFIGURATION =
ROOT_CAUSE =
```

---

## Judge / Evaluator

1. Open the repository in your coding agent.
2. Paste `docs/JUDGE_AGENT_PROMPT.txt`:
   > "Run the OneShot judge skill and launch the verified application."

The OneShot judge skill performs setup, launch, authentication, health verification, and application verification automatically.

No external model/provider API key is required for judge/sample mode.

---

## Developer Reference (Secondary)

Manual commands for local development, testing, and debugging.

### Prerequisites
- **Node.js**: `>= 24.13.0`
- **npm**: `>= 11.8.0`
- **Python**: `>= 3.11`

### Commands

```bash
# Bootstrap, build, verify proofs, and launch the Web IDE
npm run oneshot

# Build backend and frontend
npm run build

# Run all TypeScript integration tests
npm test

# Run frontend unit tests
npm --prefix app/web test

# Run full end-to-end verification pipeline
python app/scripts/verify_all.py

# Run standalone sample mode (no API key required)
npm run demo
```

### Docker

```bash
docker build -t oneshot:latest .
docker run -d -p 8787:8787 --name oneshot-runner oneshot:latest
```

Web IDE will be available at `http://localhost:8787`.

---

## Architecture

```text
oneshot/
├── backend/                  # TypeScript runtime & canonical workflow
│   ├── graph/               # Canonical workflow graph & state machine
│   ├── role/                # Role definitions (Researcher, Planner, Refactor, Evaluator)
│   ├── sandbox/             # Hardened process execution & boundary admission
│   ├── schema/              # JSON Schema Draft 2020-12 contract authorities
│   ├── server/              # HTTP server, SSE event streaming & security
│   ├── skill/               # Governed reusable skills & activation engine
│   ├── task/                # Append-only event store & task management
│   └── validation/          # JCS canonicalization & SHA-256 verification bridge
├── app/                       # Control plane & validation engine
│   ├── bootstrap/           # Demonstration & setup scripts
│   ├── fixtures/            # Canonical seed fixtures & test suites
│   ├── legal/               # Third-party license documentation
│   ├── requirements/        # Pinned Python requirements
│   ├── scripts/             # Manifest generation & dependency verifiers
│   └── workspace_api/       # FastAPI control plane sidecar (Argon2, rate limits)
├── app/web/                   # Canonical Web IDE frontend (plain HTML/CSS/JS)
│   ├── src/                   # Reactive interface modules & styles
│   └── tests/                 # Frontend unit test suite (node:test)
├── scripts/                   # Launchers, helpers, installation & browser E2E
│   └── e2e/browser/           # CDP-based state-adaptive browser test suite
├── docs/                      # Documentation, judge materials, evidence & licenses
│   └── evidence/video/        # Verified demonstration video
└── app/contract-registry.json # Canonical contract registry
```

---

## Canonical Proof Chain

```text
Natural Intent
     │
     v
Intent Engine ──> Multi-Turn Turn Accumulator
     │
     v
Prompt Creation ──> Research Provider (Sample / Featherless / ADK)
     │
     v
Planner ──> Plan Definition & Step Matrix
     │
     v
Refactor ──> Preserved Plan Identity
     │
     v
Gap Analysis ──> Loop Termination Proof (gap_0 == true)
     │
     v
Evaluation ──> Triple Validation
                ├── 1. Schema Validation (JSON Schema Draft 2020-12)
                ├── 2. Fixture Validation (Deterministic operator assertions)
                └── 3. Goal Validation (Intent satisfaction proof)
                     │
                     v
                All VALID ──> CONFIRMED
                                 │
                                 v
                            CREATE HASH ──> RFC 8785 Canonicalization (JCS)
                                 │
                                 v
                              HASH ──> SHA-256 Equality Proof
                                 │
                                 v
                              DONE
```

---

## License & Third-Party Notices

OneShot-owned source code is licensed under the [Apache License, Version 2.0](docs/license/LICENSE). Third-party software remains governed by its respective upstream licenses; see [NOTICE](docs/license/NOTICE) and [app/legal/third-party/](app/legal/third-party).
