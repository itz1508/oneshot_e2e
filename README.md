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
    <img src="public/demo/screen-4-interactive.png" alt="OneShot live run showing the real prompt, Python reasoning response, and Task drawer" width="100%" />
  </a>
  <br />
  <sub>▶ <b><a href="public/demo/oneshot-demo.webm">Watch the live capture</a></b><br />Fresh prompt → real backend HTTP stream → Python reasoning deltas → completed response → live Task drawer. The recording ends when the real run completes.</sub>
</div>

---

### 📸 Live Event Progression

| 1. Loading Workspace | 2. Prompt Composer |
|:---|:---|
| <img src="public/demo/screen-1-loading.png" width="100%" alt="Real OneShot workspace loading state" /><br /><sub><b>Loading state</b>: Workspace is fetching real backend state</sub> | <img src="public/demo/screen-2-typing.png" width="100%" alt="Real OneShot prompt entry" /><br /><sub><b>Prompt entry</b>: Actual user request in the composer</sub> |

| 3. Live Python Reasoning Stream | 4. Completed Response |
|:---|:---|
| <img src="public/demo/screen-3-streaming.png" width="100%" alt="Real OneShot backend stream state" /><br /><sub><b>Live state</b>: Backend stream and Python reasoning deltas</sub> | <img src="public/demo/screen-4-interactive.png" width="100%" alt="Completed OneShot response" /><br /><sub><b>Completed run</b>: The backend stream finished</sub> |

| 5. Task and Hook State |
|:---|
| <img src="public/demo/screen-5-task-state.png" width="100%" alt="OneShot Task and hook state" /><br /><sub><b>Task state</b>: Real run lifecycle, pending gates, and emitted events</sub> |

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
