# OneShot — One Click Installation

<p align="center">
  <a href="https://raw.githubusercontent.com/itz1508/oneshot_e2e/main/scripts/install.ps1">
    <img src="https://img.shields.io/badge/OneShot-Installation-2563EB?style=for-the-badge&logo=powershell&logoColor=white" alt="OneShot Installation" />
  </a>
  &nbsp;&nbsp;
  <img src="https://img.shields.io/badge/Manual-git%20clone%20https%3A%2F%2Fgithub.com%2Fitz1508%2Foneshot__e2e.git%20%3B%20cd%20oneshot__e2e%20%3B%20.%5Cscripts%5Cstart--web.ps1-1E293B?style=for-the-badge" alt="Manual: git clone https://github.com/itz1508/oneshot_e2e.git; cd oneshot_e2e; .\scripts\start-web.ps1" />
</p>

---

### 🚀 Automated Quickstart (1 Command)

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/itz1508/oneshot_e2e/main/scripts/install.ps1 | iex
```

**macOS / Linux (Terminal):**

```bash
curl -fsSL https://raw.githubusercontent.com/itz1508/oneshot_e2e/main/scripts/install.sh | bash
```

> The automated installer automatically clones via `git clone`, installs dependencies, compiles, discovers an available port, and launches the browser console ready for testing.

> [!TIP]
>
> ### 💻 CLI & Existing Workspace Launch
>
> If you already have the repository:
>
> - **CLI**: `pnpm oneshot` *(supports `--help`, `--dev`, `--sample`, `--no-browser`)*
> - **Windows**: `.\scripts\start-web.ps1` *(or `.\scripts\launch.bat`)*
> - **macOS / Linux**: `pnpm oneshot` *(or `./scripts/launch.sh`)*

### 🤖 Non-API Key Autonomous Style Chat Bot

By default, OneShot starts in **Zero-Config Local Mode**:

- **Interactive Chatbot**: Ask the agent to *"validate fixtures"* or *"run tests"* to watch `fixture(...)` evolve, verify hashes, and record into immutable `fixture_id` records in real time.
- **Human Review Gates**: Ask for *"workflow gate status"* to inspect Gate 1 (Research Review) and Gate 2 (Build Ready).
- **Task Rail Synchronization**: Watch live subtasks, plan status, and validation cards update live across the Task Rail.

### Optional: Live Model Providers

When you are ready to connect external LLM providers:

```bash
export GEMINI_API_KEY="your-gemini-api-key"
pnpm run oneshot
```

*(Or set `OPENAI_API_KEY`, or configure directly inside the web UI under the **Integrations** drawer).*

### Standard Build & Run

```bash
pnpm install && pnpm run build && pnpm start
```

### 🧪 Run Tests & Verification

```bash
pnpm test                         # Backend tests (asserts actual response payloads & fixture proofs)
pnpm run test:runtime             # Workflow engine & state tests
pnpm --prefix frontend/web test   # Web frontend tests
pnpm run verify                   # Full repository verification suite (7/7 checks)
```

> **Requirements:** Node.js `>= 24.13.0`, pnpm `>= 10.0.0`.  
> Web console automatically discovers an available port and launches your browser.

---

## License

[Apache-2.0](LICENSE)
