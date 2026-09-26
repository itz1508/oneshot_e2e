<div align="left">

# OneShot

<p>
  <a href="https://raw.githubusercontent.com/itz1508/oneshot_e2e/main/scripts/install.ps1">
    <img src="https://img.shields.io/badge/⚡_OneShot_Installation-One_Click_Automatic_E2E-2563EB?style=for-the-badge&logo=powershell&logoColor=white" alt="OneShot Installation" />
  </a>
</p>

<p>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D24.21.0-339933?style=flat-square&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/pnpm-%3E%3D11.27.1-F69220?style=flat-square&logo=pnpm&logoColor=white" />
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" />
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

## 🖥️ Live UI — Prompt · Stream · Task Rail

<div align="left">
  <a href="public/demo/oneshot-demo.webm">
    <img src="public/demo/screen-8-backends.png" alt="OneShot live — DeepAgents Filesystem Backends: 4 mounted partitions, virtual_mode ENFORCED, path traversal BLOCKED" width="100%" />
  </a>
  <br />
  <sub>▶ <b><a href="public/demo/oneshot-demo.webm">Watch the live video capture (public/demo/oneshot-demo.webm)</a></b><br />Full real E2E lifecycle, recorded live against the running backend: Ready state with the research banner reporting its true backend status &rarr; Per-message research toggle &rarr; Sidebar collapse/expand &rarr; Real chat prompt typed character-by-character &rarr; Context Review Drawer (Tasks, Gates, Backends) &rarr; Real backend SSE stream &rarr; COMPLETED &rarr; Full-width auto-scale review. <b>29.7&nbsp;s, 1600&times;900, 742 frames.</b></sub>
</div>

---

### ⚡ Terminal Installation, Build & Tests (391 Passing)

<div align="left">
  <img src="public/demo/screen-0-install-test.png" width="100%" alt="OneShot terminal setup and build, with the real test suite passing and zero failures" />
  <br />
  <sub><b>Terminal Verification</b>: <code>pnpm test</code> (200 backend tests), <code>test:runtime</code> (99 runtime tests), <code>test:web</code> (71 frontend tests), <code>test:e2e</code> (21 browser tests, 3 mobile-only skipped), <code>verify_all.py</code> (7/7 checks passed). 100% deterministic proofs with zero mocks.</sub>
</div>

---

### 📸 Live Event Progression — Every Distinct UI State

| 1. Ready State | 2. Sidebar Collapsed |
|:---|:---|
| <img src="public/demo/screen-1-loading.png" width="100%" alt="OneShot ready state — research banner reporting no active run, per-message research toggle, empty composer" /><br /><sub><b>Ready</b>: Workspace loaded, banner truthfully reads "Research not running" until a run actually starts, per-message research toggle available, quick-tool chips visible with gradient fade</sub> | <img src="public/demo/screen-1c-sidebar-collapsed.png" width="100%" alt="OneShot sidebar collapsed — full-width content, auto-scaled composer" /><br /><sub><b>Sidebar collapsed</b>: Content expands to full width via <code>cubic-bezier(0.16, 1, 0.3, 1)</code> spring.</sub> |

| 3. Prompt Typed — Drawer Idle | 4. Run RUNNING + Activity Steps |
|:---|:---|
| <img src="public/demo/screen-2-typing.png" width="100%" alt="Prompt typed in composer, Context Drawer open on Tasks tab showing run-idle IDLE" /><br /><sub><b>Pre-submit</b>: Real prompt typed, composer auto-grows, drawer shows <code>run-idle / IDLE</code>, Gates pending</sub> | <img src="public/demo/screen-3-submitted.png" width="100%" alt="Run RUNNING — Python reasoning subprocess IN_PROGRESS, Strands Agent activity steps, OneShot is responding..." /><br /><sub><b>Live stream</b>: <code>RUNNING</code> badge · <code>IN_PROGRESS</code> pipeline · Strands Agent + Python subprocess activity</sub> |

| 5. Tasks — COMPLETED + Event Log | 6. Backends — Sandbox Security |
|:---|:---|
| <img src="public/demo/screen-4-interactive.png" width="100%" alt="Tasks tab: COMPLETED badge, Python reasoning subprocess COMPLETED, 3-entry deduplicated event log" /><br /><sub><b>Completed</b>: <code>COMPLETED</code> badge · Pipeline <code>COMPLETED</code> · Real response rendered · Full 3-event log with timestamps</sub> | <img src="public/demo/screen-8-backends.png" width="100%" alt="Backends tab: DeepAgents Filesystem — 4 partitions /workspace/ /scratch/ /memories/ /artifacts/, ENFORCED sandbox" /><br /><sub><b>Backends</b>: virtual_mode <code>ENFORCED</code> · path traversal <code>BLOCKED</code> · 4 partitions: <code>/workspace/</code> <code>/scratch/</code> <code>/memories/</code> <code>/artifacts/</code></sub> |

| 7. Full Chat — Drawer Closed |
|:---|
| <img src="public/demo/screen-9-final.png" width="100%" alt="Drawer closed — full-width chat with completed response, all quick-tool chips visible" /><br /><sub><b>Auto-scaled Chat</b>: Drawer closes, chat expands back to full width, all quick-tool chips visible with smooth scroll fade</sub> |

---

## 🏛️ System Architecture

<div align="left">
  <img src="public/demo/architecture-diagram.svg" alt="OneShot Enterprise Architecture — Google ADK, Gemini 3.5 Flash, DeepAgents SSE, and Cloud Run" width="100%" />
</div>

---

## 🔄 How It Works

| Step | What happens |
|------|-------------|
| **1. Enter prompt** | Type your task in the Prompt Composer and press Enter |
| **2. Python Reasoner streams** | The local Python reasoning subprocess streams real output without requiring API keys |
| **3. Task state updates** | The task drawer shows the active run, lifecycle steps, pending gates, and emitted events |
| **4. Human gates** | Gate 1 and Gate 2 remain explicit until a real human confirmation changes backend state |
| **5. Run completes** | The stream ends with the backend’s actual `RUN_FINISH` event |

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

## 🧪 Run Tests & Verification

```bash
# Backend tests — asserts actual response payloads & fixture proofs
pnpm test

# Workflow engine & state machine tests
pnpm run test:runtime

# Web frontend tests
pnpm --prefix frontend/web test

# Full repository verification suite (7/7 checks)
pnpm run verify
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

## License

[Apache-2.0](LICENSE)
