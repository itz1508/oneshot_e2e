<div align="left">

# OneShot: Deterministic E2E Agent Runtime

<p>
  <a href="README.md"><b>[README]</b></a> · <a href="DIAGRAM.md"><b>[ARCHITECTURE DIAGRAM]</b></a> · <a href="LICENSE"><b>[LICENSE]</b></a>
</p>

<p>
  <a href="https://raw.githubusercontent.com/itz1508/oneshot_e2e/main/scripts/install.ps1">
    <img src="https://img.shields.io/badge/⚡_OneShot_Installation-One_Click_Automatic_E2E-2563EB?style=for-the-badge&logo=powershell&logoColor=white" alt="OneShot Installation" />
  </a>
</p>
</div>

---

## ⚡ One Click Installation — Launch Server

**Windows (PowerShell — one command, fully automatic):**

```powershell
irm https://raw.githubusercontent.com/itz1508/oneshot_e2e/main/scripts/install.ps1 | iex
```

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/itz1508/oneshot_e2e/main/scripts/install.sh | bash
```

> The installer automatically: clones the repo → installs dependencies → compiles → discovers an open port → **launches the browser console ready for testing**. Zero configuration required.

---

## 🎬 Live 60s Fast-Forward Demo & Video Walkthrough

<div align="center">

<p align="center">
  <a href="https://youtu.be/lE9vtKB-fSk"><img src="https://img.shields.io/badge/YouTube-Watch_Video_Walkthrough-red?style=for-the-badge&logo=youtube&logoColor=white" alt="Watch Video Walkthrough" /></a>
  <a href="https://raw.githubusercontent.com/itz1508/oneshot_e2e/main/scripts/install.ps1"><img src="https://img.shields.io/badge/⚡_Launch_Console-One_Click_Local-2563EB?style=for-the-badge&logo=powershell&logoColor=white" alt="Launch Real Console" /></a>
</p>

<!-- Autoplaying 60s fast-forward visualization — click to open full YouTube walkthrough -->
<p align="center">
  <a href="https://youtu.be/lE9vtKB-fSk">
    <img src="public/demo/oneshot-60s.gif" width="100%" alt="OneShot 60s Fast-Forward Workflow Walkthrough" />
  </a>
</p>

<sub>
  ▶ <b><a href="https://youtu.be/lE9vtKB-fSk">Watch Full Walkthrough on YouTube</a></b> · <a href="public/demo/oneshot-60s.mp4">Direct MP4</a> · <a href="public/demo/oneshot-demo.vtt">Subtitles (.vtt)</a>
</sub>

</div>

---

## 📸 Live Event Progression — Key UI States

| 1. Ready State | 2. Sidebar Collapsed |
|:---|:---|
| <img src="public/demo/screen-1-loading.png" width="100%" alt="Ready state — research banner, research toggle, empty composer" /><br /><sub><b>Ready</b>: Backend connected, banner shows real status, per-message research toggle visible</sub> | <img src="public/demo/screen-1c-sidebar-collapsed.png" width="100%" alt="Sidebar collapsed — full-width content reflow" /><br /><sub><b>Collapsed</b>: Content expands via <code>cubic-bezier(0.16, 1, 0.3, 1)</code> spring animation</sub> |

| 3. Prompt Typed — Drawer Idle | 4. Run RUNNING — SSE Stream |
|:---|:---|
| <img src="public/demo/screen-2-typing.png" width="100%" alt="Prompt typed, drawer showing IDLE state" /><br /><sub><b>Pre-submit</b>: Real prompt typed, composer auto-grows, drawer shows <code>IDLE</code></sub> | <img src="public/demo/screen-3-submitted.png" width="100%" alt="Run RUNNING — Python subprocess streaming" /><br /><sub><b>Live stream</b>: <code>RUNNING</code> badge, <code>IN_PROGRESS</code> pipeline, real SSE deltas</sub> |

| 5. Tasks COMPLETED | 6. Backends — Sandbox Security |
|:---|:---|
| <img src="public/demo/screen-4-interactive.png" width="100%" alt="COMPLETED — event log with timestamps" /><br /><sub><b>Completed</b>: <code>COMPLETED</code> badge, full event log, real response rendered</sub> | <img src="public/demo/screen-8-backends.png" width="100%" alt="Backends — 4 filesystem partitions, ENFORCED sandbox" /><br /><sub><b>Backends</b>: <code>virtual_mode ENFORCED</code>, 4 partitions: <code>/workspace/</code> <code>/scratch/</code> <code>/memories/</code> <code>/artifacts/</code></sub> |

| 7. Human Gate Approval | 8. Full-Width Chat |
|:---|:---|
| <img src="public/demo/screen-7-gates.png" width="100%" alt="Gate 1 — explicit human confirm control" /><br /><sub><b>Gates</b>: Gate 1 pending → human clicks Confirm → state updates to APPROVED</sub> | <img src="public/demo/screen-9-final.png" width="100%" alt="Full-width chat with completed response" /><br /><sub><b>Auto-scaled</b>: Drawer closed, chat expands to full width, smooth scroll response</sub> |

---

## ⚡ Terminal — Installation, Build & Tests (426 Passing)

<div align="left">
  <img src="public/demo/screen-0-install-test.png" width="100%" alt="Terminal verification — all test suites passing with zero failures" />
  <br />
  <sub><b>Terminal Verification</b>: <code>pnpm test</code> (222 backend), <code>test:runtime</code> (99 runtime), <code>test:web</code> (84 frontend), <code>test:e2e</code> (21 browser), <code>verify</code> (7/7 checks). 100% deterministic — zero mocks.</sub>
</div>

---

## 🏛️ System Architecture & Workflow Diagram

<div align="left">
  <img src="public/demo/architecture-diagram.svg" alt="OneShot Architecture — Agent SSE, Python Reasoning, Filesystem Sandbox, Human Gates" width="100%" />
</div>

### 🔄 Governed Multi-Agent Workflow State Machine

GitHub natively renders this interactive architecture DAG on page:

```mermaid
flowchart TD
    NORMAL_CHAT["💬 Normal Chat (Composer)"]

    NORMAL_CHAT -->|"1. Ordinary Request"| MAIN_CHAT["💬 Main Chat\n• Conversational response\n• Explanations & quick answers\n• Does NOT trigger research or planning"]

    NORMAL_CHAT -->|"2. Choose Research"| RES_FLOW["🔍 Research Workflow\n• 7 governed phases\n• Scans documentation & codebase\n• Emits structured ResearchBundle\n• Stops at handoff boundary"]

    NORMAL_CHAT -->|"3. Choose Design_Planning"| PLAN_FLOW["🧭 Design_Planning Workflow\n• 5 formal reviews (Coverage, Deps, Sandbox)\n• Generates actionable implementation plan\n• Stops at human approval"]

    RES_FLOW --> READY_FOR_PLANNING["🛑 READY_FOR_PLANNING\n(Handoff Boundary · STOPS)"]

    READY_FOR_PLANNING --> GATE1{"🚪 Boundary 1: Human Gate 1\nHuman verifies ResearchBundle"}
    GATE1 -.->|"Approved ResearchBundle input"| PLAN_FLOW

    PLAN_FLOW --> APPROVED_PLAN["🛑 APPROVED PLAN\n(Gate 2 Approval · STOPS)"]

    APPROVED_PLAN --> GATE2{"🚪 Boundary 2: Human Gate 2\nBound to SHA-256 package hash"}
    GATE2 -.->|"Consumed by"| IMPL_RT["📦 Implementation Runtime\n• 4-Partition Sandbox (/workspace, /scratch, /memories, /artifacts)\n• Python Reasoner Subprocess\n• 426 Deterministic Tests Passing"]

    classDef chat fill:#0e1e38,stroke:#3b82f6,stroke-width:2px,color:#f8fafc;
    classDef res fill:#082f49,stroke:#06b6d4,stroke-width:2px,color:#f8fafc;
    classDef plan fill:#3b0764,stroke:#a855f7,stroke-width:2px,color:#f8fafc;
    classDef stop fill:#4c0519,stroke:#f43f5e,stroke-width:2px,color:#fff1f2;
    classDef exec fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#f8fafc;
    classDef gate fill:#451a03,stroke:#f59e0b,stroke-width:2px,color:#fef3c7;

    class NORMAL_CHAT,MAIN_CHAT chat;
    class RES_FLOW res;
    class PLAN_FLOW plan;
    class READY_FOR_PLANNING,APPROVED_PLAN stop;
    class IMPL_RT exec;
    class GATE1,GATE2 gate;
```

---

## 🔄 How It Works

| Step | What happens |
| ------ | ------------- |
| **1. Enter prompt** | Type your task in the Prompt Composer and press Enter |
| **2. Python Reasoner streams** | The local Python reasoning subprocess streams real output without requiring API keys |
| **3. Task state updates** | The task drawer shows the active run, lifecycle steps, pending gates, and emitted events |
| **4. Human gates** | Gate 1 and Gate 2 remain explicit until a real human confirmation changes backend state |
| **5. Run completes** | The stream ends with the backend's actual `RUN_FINISH` event |

---

## 🧩 Core Capabilities

| Feature | Description |
| :--- | :--- |
| **Agent Event Streaming** | `stream.messages`, `stream.tool_calls`, `stream.subagents` — real SSE with no fabricated progress |
| **Filesystem Sandbox** | 4 strict partitions: `/workspace/`, `/scratch/`, `/memories/`, `/artifacts/` — path traversal BLOCKED |
| **Human-in-the-Loop Gates** | Gate 1 & Gate 2 require explicit human approval before state transitions |
| **Multi-Model Support** | Google Gemini, OpenAI, Nebius, Mistral, local Ollama — switchable in the UI, no restart |
| **Live Caption HUD** | On-screen telemetry overlay with pulsing status, timecode, and action descriptions |
| **Response Verification** | Every test inspects actual HTTP payloads, status codes, and byte/hash equality |
| **Zero-Config Startup** | One-command installer detects ports, compiles, and opens the browser |

---

## 📦 Manual Install & Run

```bash
# Clone
git clone https://github.com/itz1508/oneshot_e2e.git
cd oneshot_e2e

# Install all dependencies
pnpm install

# Build backend + frontend
pnpm run build

# Launch server (auto-detects port, opens browser)
pnpm start
```

**Windows shortcut:**

```powershell
.\scripts\start-web.ps1          # default port 8787
.\scripts\start-web.ps1 -Port 9000 -Sample   # custom port + sample data
```

---

## 🧪 Run Tests, Fixtures & Dry Run

OneShot includes **5 deterministic contract fixtures** under `app/fixtures/` and an offline dry-run engine for testing without external API keys or network dependencies:

| Fixture | ID | Purpose & Invariants Verified |
| :--- | :--- | :--- |
| [`sample.json`](app/fixtures/sample.json) | `fix-sample-01` | Baseline contract schema and session isolation proof |
| [`security-invariants.json`](app/fixtures/security-invariants.json) | `fix-sec-01` | Agent 4-partition sandbox (`/workspace/`, `/scratch/`, `/memories/`, `/artifacts/`) |
| [`adk-workflow.json`](app/fixtures/adk-workflow.json) | `fix-adk-01` | Google ADK stage machine (`IDLE` ➔ `VALIDATION`) and Human Gates (Gate 1 & Gate 2) |
| [`reasoning-dryrun.json`](app/fixtures/reasoning-dryrun.json) | `fix-reason-01` | Offline Python reasoning test cases with thinking chain expectations |
| [`data.json`](app/fixtures/data.json) | `fixture-401` | Runtime engine state transition baseline |

```bash
# Execute deterministic dry-run verification against all contract fixtures
pnpm run dry-run

# Or launch OneShot directly in dry-run mode
pnpm run oneshot --dry-run

# Backend tests — asserts actual response payloads & fixture proofs (17 suites)
pnpm test

# Workflow engine & state machine tests
pnpm run test:runtime

# Web frontend tests
pnpm --prefix frontend/web test

# Browser E2E tests
pnpm run test:e2e

# Full repository verification suite (7/7 checks)
pnpm run verify

# Verify demo assets (byte/hash parity)
pnpm run verify:demo
```

> **Requirements:** Node.js `>= 24.21.0` · pnpm `>= 11.27.1`
>
> These are minimum supported versions. CI pins Node.js `24.21.0` and pnpm `11.27.1` exactly for reproducible builds. Newer local versions are allowed when they satisfy the minimums and the lockfile remains reproducible.

---

## 🔑 Optional: Connect Live Model Providers

```bash
# Set your API key, then launch
export GEMINI_API_KEY="your-gemini-api-key"
pnpm run oneshot
```

Or configure **Google Gemini**, **OpenAI**, **Nebius**, **Mistral**, or local **Ollama** directly in the **Integrations** drawer inside the web UI — no restart required.

---

## 🎥 Regenerate Demo Assets

```bash
# Start backend first
pnpm run build && pnpm start

# In another terminal — record the combined live demo
pnpm run capture:demo

# Verify all assets and byte/hash parity
pnpm run verify:demo
```

The capture script ([`scripts/capture-demo.mjs`](scripts/capture-demo.mjs)) drives a Playwright session against the **real running backend**, producing:

- `public/demo/oneshot-demo.mp4` — combined 3m15s H.264 video with embedded subtitles and clean, dry conversational voice-over narration
- `public/demo/oneshot-demo.webm` — HD WebM video with synchronized audio
- `public/demo/oneshot-demo.gif` — animated autoplay preview for GitHub README
- `public/demo/oneshot-demo.vtt` — synchronized WebVTT live captions
- `public/demo/screen-*.png` — full 18-screenshot progression set

---

## 🚀 Deployment

- **Canonical Frontend (GitHub Pages)**:
  Static export hosted via GitHub Actions workflow on [GitHub Pages](https://itz1508.github.io/oneshot_e2e/).
- **Split Frontend Alternative (Vercel)**:
  Static Next.js export optionally deployed to Vercel (see [`frontend/web/VERCEL_DEPLOY.md`](frontend/web/VERCEL_DEPLOY.md)).
- **Stateful Backend Server (Render / Container / VM)**:
  The stateful backend (`node dist/backend/index.js`) runs on a persistent Node.js `>=24.21.0` host.
  - **Build command**: `pnpm install --frozen-lockfile && pnpm run build:backend`
  - **Start command**: `node dist/backend/index.js`
  - **Environment**: `NODE_VERSION=24.21.0`, `PORT=10000`, `HOST=0.0.0.0`, `ONESHOT_DISABLE_PYTHON_SPAWN=1`

---

## License

[Apache-2.0](LICENSE)
