# 🎯 OneShot Judge Demonstration Guide

> **Time estimate:** Clone → Setup → Launch OneShot for Demonstration in under 3 minutes.

---

## 1. What Is OneShot?

**OneShot** is an enterprise-grade deterministic AI execution platform that transforms natural language intent into a provably correct, cryptographically hash-verified execution plan.


---

## 2. 60-Second Setup

### Prerequisites
- **Node.js 24.13.0+** — [nodejs.org](https://nodejs.org)
- **Python 3.11+** — [python.org](https://www.python.org)

### Windows, macOS, or Linux
```bash
git clone https://github.com/itz1508/oneshot_e2e.git
cd oneshot_e2e
npm run oneshot
```

**What `npm run oneshot` does:**
- ✅ Verifies Node.js (≥24.13.0) and Python (≥3.11)
- ✅ Creates `.venv` when it is missing and verifies pinned Python profiles
- ✅ Installs root and `web/` Node dependencies from their lockfiles
- ✅ Builds the TypeScript backend and web frontend
- ✅ Verifies canonical contracts and `MANIFEST.sha256`
- ✅ Runs the entire test verification suite (Python + TypeScript)
- ✅ Starts the runtime, waits for `/api/health`, and opens `http://localhost:8787`

---

## 3. Run the OneShot Demonstration

```bash
npm run oneshot
```

### What Happens:

1. **Bootstrap & Build** — Verifies the environment and compiles current backend and web source
2. **Proof Gates** — Verifies contracts, manifest integrity, and all tests
3. **Backend Startup** — Boots the real OneShot HTTP & Server-Sent Events (SSE) backend on port 8787
4. **Web Launch** — Waits for health and opens your default browser at `http://localhost:8787`
5. **Status Verification** — Status bar displays active `MODE` and `PROVIDER`

### Real Demonstration Path:

```text
IDE Chat
 └── Conversation API (/api/conversations)
      └── Intent Engine (intent:id revision)
           └── Prompt Creation (prompt:id)
                └── Researcher (selected ResearchProvider)
                     └── Planner (audit:id)
                          └── Refactor (preserves plan:id)
                               └── Gap Analysis (gap_0: true)
                                    └── Evaluation (9-point matrix)
                                         ├── Schema Validation ──┐
                                         ├── Fixture Validation ──┼─ Triple Validation
                                         └── Goal Validation ────┘      │
                                                                        v
                                                                   all VALID
                                                                        │
                                                                        v
                                                                    CONFIRMED
                                                                        │
                                                                        v
                                                                   CREATE HASH
                                                                        │
                                                                        v
                                                                      HASH
                                                                        │
                                                                        v
                                                                      DONE
```

### Interactive Steps for Judges:

1. In the **OneShot web interface**, enter a prompt in the chat input (or use an example prompt)
2. Click **Send** — this initiates the real Chat → Intent → Prompt flow
3. Watch the **workflow processors** update in real time (`PENDING` → `RUNNING` → `COMPLETE`):
   - `Researcher`, `Planner`, `Refactor`, `Gap Analysis`, `Evaluation`
   - `Schema Validation`, `Fixture Validation`, `Goal Validation`, `Triple Validation`
   - `Confirmed`, `Create Hash`, `Hash`, `Done`
4. Watch the **event stream** in the interface showing real-time processing events
5. Inspect the generated **SHA-256 hash** and proof artifacts
6. View the **task management** panel showing role-based workflow progression

---

## 4. Demonstration Modes

### Mode A: Deterministic Sample Provider (Default)

```bash
npm run demo
```

- **Mode:** `SAMPLE`
- **Provider:** `Deterministic Sample Provider` (`FixtureResearchProvider`)
- **External Services:** None required. Fully reproducible offline benchmark.

### Mode B: Production AI Provider (Featherless)

```bash
ONESHOT_MODE=production ONESHOT_RESEARCH_PROVIDER=featherless FEATHERLESS_API_KEY="your_featherless_api_key" npm run demo
```

- **Mode:** `PRODUCTION`
- **Provider:** `Featherless`
- **Model:** `deepseek-ai/DeepSeek-V3.1` (configurable)
- Calls live inference and traverses the exact same canonical validation and proof chain.

### Mode C: Docker Container (Single Command Release)

```bash
docker build -t oneshot:latest .
docker run -d -p 8787:8787 --name oneshot-runner oneshot:latest
```

Open **http://localhost:8787** in your browser. The multi-stage container compiles the TypeScript backend and Web IDE bundle, installs Python validation engines, and serves the live platform.

---

## 5. Verification & Test Suite

Run the full end-to-end verification suite across all layers:

```bash
python app/scripts/verify_all.py
```

### Verification Matrix:
- **Python unit tests** (`backend/test/python/`): Schema validation, model parity, graph structure, fixture assertions, RFC 8785 JCS canonicalization, SHA-256 equality, Workspace API security, rate limiting, and archive secret-selection parity.
- **TypeScript integration tests** (`backend/test/ts/`): Google ADK adapter, Featherless adapter, intent collection, sandbox admission boundary, process isolation, SSE streaming, task event store, and workspace filesystem security.
- **Expected result:** All tests pass

To run TypeScript tests directly:
```bash
npm test
```

---

## 6. Key Technical Highlights for Scoring

| Evaluation Area | Real Implementation Details |
| :--- | :--- |
| **Deterministic Canonical Pipeline** | 27-phase state machine with rigid stage ownership and immutable artifacts |
| **Schema Strictness** | 21 JSON Schema Draft 2020-12 contracts governing all payloads and events |
| **Triple Validation** | Independent multi-tier proofs (Schema, Fixture, Goal) evaluated before confirmation |
| **Cryptographic Integrity** | RFC 8785 canonicalization (JCS) + SHA-256 hash equality proof |
| **Hardened Process Sandbox** | Isolated execution workspace with timeout enforcement, memory limits, and network denial (`DENY_ALL`) |
| **Multi-Turn Intent Collection** | Conversational turn accumulator, provenance tracking, and targeted help requests without retry loops |
| **Dual AI Research Providers** | Integrated Google ADK + Ollama (`gemma2:9b`) and Featherless (`google/gemma-4-31B-it`) |
| **Multi-Tenant Control Plane** | Standalone FastAPI Workspace API sidecar with Argon2 password hashing, encrypted provider credentials, and token analytics |
| **Real-Time IDE** | Event-driven web interface with live SSE streaming, audit graph projection, and artifact explorer |
| **Zero Offline Dependencies** | Pinned npm tarballs vendored in `app/vendor/npm/` — clones and builds with zero network required |

---

## 7. Troubleshooting

- **Port in use:** If port 8787 is occupied, pass a custom port: `PORT=9090 npm run demo`
- **Browser popup blocked:** Open `http://localhost:8787` manually in your browser.
- **Python version:** Ensure Python 3.11+ is available (`python --version`).
- **Node version:** Ensure Node.js 24.13.0+ is available (`node --version`).

---

## 8. License

Apache License, Version 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE) for details.
