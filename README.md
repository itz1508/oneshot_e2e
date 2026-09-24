<div align="center">

# OneShot

**Automatic end-to-end agent testing — one command to install, run, and verify.**

<p>
  <a href="https://raw.githubusercontent.com/itz1508/oneshot_e2e/main/scripts/install.ps1">
    <img src="https://img.shields.io/badge/⚡_OneShot_Installation-One_Click_Automatic_E2E-2563EB?style=for-the-badge&logo=powershell&logoColor=white" alt="OneShot Installation" />
  </a>
</p>

<p>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D24.13.0-339933?style=flat-square&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/pnpm-%3E%3D10.0.0-F69220?style=flat-square&logo=pnpm&logoColor=white" />
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

<div align="center">
  <a href="public/demo/oneshot-demo.webm">
    <img src="public/demo/ui-mock.jpg" alt="OneShot UI — Prompt composer on the left, real-time streaming response in the center, Task Rail with live stage events on the right" width="100%" />
  </a>
  <br />
  <sub>▶ Click to watch the full walkthrough video &nbsp;|&nbsp; Left: prompt input &nbsp;·&nbsp; Center: live streaming response &nbsp;·&nbsp; Right: Task Rail with real stage events</sub>
</div>

---

## 🔄 How It Works

| Step | What happens |
|------|-------------|
| **1. Enter prompt** | Type your task in the Prompt Composer and press Enter |
| **2. Research streams** | Agent starts, real-time tokens stream into the response panel |
| **3. Task Rail fires** | Right panel shows live stage events: Research → Planning → Build → Review |
| **4. Human gates** | Review cards appear at each stage boundary — inspect, approve, or reject |
| **5. Result persists** | Final artifacts, logs, and hashes saved — verifiable, not fabricated |

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

> **Requirements:** Node.js `>= 24.13.0` · pnpm `>= 10.0.0`

---

## 🔑 Optional: Connect Live Model Providers

```bash
# Set your API key, then launch
export GEMINI_API_KEY="your-gemini-api-key"
pnpm run oneshot
```

Or configure **OpenAI**, **Anthropic**, and other providers directly in the **Integrations** drawer inside the web UI — no restart required.

---

## License

[Apache-2.0](LICENSE)
