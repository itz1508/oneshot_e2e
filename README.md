<div align="left">

# OneShot: Deterministic E2E Agent Runtime

<p>
  <a href="https://raw.githubusercontent.com/itz1508/oneshot_e2e/main/scripts/install.ps1">
    <img src="https://img.shields.io/badge/⚡_OneShot_Installation-One_Click_Automatic_E2E-2563EB?style=for-the-badge&logo=powershell&logoColor=white" alt="OneShot Installation" />
  </a>
</p>

## 🏛️ Architecture & Workflow

For full state machine DAGs [**DIAGRAM.md**](DIAGRAM.md).

## ⚡ One Click Installation — Launch Server

**Windows (PowerShell — one command, fully automatic):**

```powershell
irm https://raw.githubusercontent.com/itz1508/oneshot_e2e/main/scripts/install.ps1 | iex
```

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/itz1508/oneshot_e2e/main/scripts/install.sh | bash
```

> The installer automatically: clones the repo → installs dependencies → compiles → discovers an open port → **launches the browser ready for testing**.

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

## 📸 Live Event Captures

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

## ⚡ Terminal — Build & Verification

```text
$ pnpm run build
✓ Compiled backend dist/
✓ Compiled static frontend dist/

$ pnpm test
tests 222   pass 222   fail 0

$ pnpm run test:runtime
tests 99    pass 99    fail 0

$ pnpm --prefix frontend/web test
tests 84    pass 84    fail 0

$ pnpm run test:e2e
21 passed (38.6s)

$ pnpm run verify
======================================================================
  OneShot Verification Suite (7/7 Checks)
======================================================================
  [✓] environment       Node v24.21.0, pnpm 11.27.1, Python 3.12
  [✓] dependencies      @strands-agents/sdk, dotenv, openai, ai
  [✓] build_outputs     dist/backend/index.js, frontend/web/dist
  [✓] configuration     tsconfig, package.json, app/env/.env.example
  [✓] manifest          224 files matching SHA-256 tree (committed sources only)
  [✓] tests             backend, runtime, web, e2e
  [✓] security          .env git protection, no hardcoded secrets

Passed: 7/7 - All checks passed!
```

---

## 📦 Manual Install & Run

```bash
# Clone
git clone https://github.com/itz1508/oneshot_e2e.git
cd oneshot_e2e

# Install all dependencies (Node + uv-managed Python env)
pnpm install
node scripts/setup-python.mjs

# No uv? Install the generated Python lockfile export instead
python -m pip install -r backend/python/requirements.txt

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

> **Requirements:** Node.js `>= 24.21.0` · pnpm `>= 11.27.1` · Python `>= 3.12` · uv (owns `backend/python/.venv` via `uv sync --frozen`; without uv, install `backend/python/requirements.txt` with pip)

---

## 🔑 Optional: Connect Live Model Providers

```bash
# Set your API key, then launch
export GEMINI_API_KEY="your-gemini-api-key"
pnpm run oneshot
```

Or configure **Google Gemini**, **OpenAI**, **Nebius**, **Mistral**, or local **Ollama** directly in the **Integrations** drawer inside the web UI — no restart required.

---

## 📜 License

[Apache-2.0](LICENSE)
