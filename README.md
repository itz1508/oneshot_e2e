# OneShot

OneShot is an enterprise-grade deterministic AI execution platform that transforms natural language intent into a provably correct, cryptographically hash-verified execution plan. Every operation traverses a canonical 27-phase state machine governed by 21 JSON Schema Draft 2020-12 contracts, independent multi-tier Triple Validation, RFC 8785 JSON Canonicalization (JCS), and sandbox isolation.

---

## Quick Start

```bash
# Bootstrap, build, verify proofs, and launch the Web IDE
npm run oneshot
```

`npm run oneshot` executes the complete startup sequence:
1. Verifies system requirements (Node.js & Python)
2. Manages Python virtual environment (`.venv`) and validates dependencies
3. Installs vendored Node dependencies offline
4. Compiles the strict TypeScript backend and Web IDE frontend
5. Validates contract schemas and verifies `MANIFEST.sha256` integrity
6. Runs all verification proof suites (Python + TypeScript)
7. Boots the HTTP/SSE runtime and opens `http://localhost:8787`

### Alternative Commands

```bash
# Run standalone sample mode (no API key required)
npm run demo

# Run all TypeScript integration tests
npm test

# Run frontend unit tests
npm --prefix web test

# Run full end-to-end verification pipeline
python app/scripts/verify_all.py

# Build backend and frontend
npm run build
```

---

## Requirements

- **Node.js**: `>= 24.13.0`
- **npm**: `>= 11.8.0`
- **Python**: `>= 3.11`

All npm dependencies are vendored offline under `app/vendor/npm/`, enabling hermetic offline builds.

---

## Architecture

OneShot enforces strict separation of concerns across runtime, contracts, and interfaces:

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
├── app/                     # Control plane & validation engine
│   ├── bootstrap/           # Demonstration & setup scripts
│   ├── fixtures/            # Canonical seed fixtures & test suites
│   ├── legal/               # Third-party license documentation
│   ├── requirements/        # Pinned Python requirements
│   ├── scripts/             # Manifest generation & dependency verifiers
│   └── workspace_api/       # FastAPI control plane sidecar (Argon2, rate limits)
├── web/                     # Canonical Web IDE frontend (plain HTML/CSS/JS)
│   ├── src/                 # Reactive interface modules & styles
│   └── tests/               # Frontend unit test suite (node:test)
├── e2e/                     # End-to-end integration tests & evidence
│   ├── browser/             # CDP-based state-adaptive browser test suite
│   └── evidence/video/      # Verified demonstration video
└── CANONICAL_WORKFLOW.md    # Definitive workflow specification & state matrix
```

---

## Execution Modes

### Mode A: Deterministic Sample Provider (Default)

Runs completely offline without external credentials using canonical fixture seeds:

```bash
npm run demo
```

- **Mode**: `SAMPLE`
- **Provider**: `Deterministic Sample Provider` (`FixtureResearchProvider`)
- **External Services**: None required. Fully reproducible offline benchmark.

### Mode B: Production AI Provider (Featherless)

Runs live model inference through external API providers while traversing the exact same canonical validation and proof chain:

```bash
ONESHOT_MODE=production \
ONESHOT_RESEARCH_PROVIDER=featherless \
FEATHERLESS_API_KEY="your_api_key" \
npm run demo
```

- **Mode**: `PRODUCTION`
- **Provider**: `Featherless`
- **Model**: Configurable (default: `deepseek-ai/DeepSeek-V3.1`)

### Mode C: Docker Container

Deploy OneShot in an isolated, multi-stage container:

```bash
docker build -t oneshot:latest .
docker run -d -p 8787:8787 --name oneshot-runner oneshot:latest
```

Access the Web IDE at `http://localhost:8787`.

---

## Canonical Proof Chain

Every user request is deterministically validated before entering execution:

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

## Hardened Sandbox Security

- **Process Isolation**: Execution runs in an isolated runner with restricted working directories.
- **Resource Limits**: Configurable process timeout limits, memory boundaries, and output write quotas.
- **Network Denial**: Enforces `DENY_ALL` network access during sandboxed execution.
- **API Security**: Non-loopback bindings require Bearer token authentication via `ONESHOT_API_TOKEN`.

---

## Verification Suite

Run the full verification matrix across all layers:

```bash
python app/scripts/verify_all.py
```

The verification suite validates:
- **Python Unit Tests**: Contract schema validation, RFC 8785 JCS canonicalization, SHA-256 hash equality, and Workspace API security.
- **TypeScript Integration Tests**: Full canonical chain, provider boundaries, multi-turn intent collection, sandbox admission, negative fault injection, SSE streaming, and skill activation.
- **Frontend Unit Tests**: State-adaptive UI view models, activity separation, and contract alignment.
- **Source Integrity**: `MANIFEST.sha256` hash verification over all repository assets.

---

## License

OneShot-owned source code is licensed under the [Apache License, Version 2.0](LICENSE). Third-party software remains governed by its respective upstream licenses; see [NOTICE](NOTICE) and [app/legal/third-party/](app/legal/third-party).
