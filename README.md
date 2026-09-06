# Agent Instruction Prompt

```text
You are an autonomous setup agent. Your job is to install, build, verify, and launch OneShot on this machine.

1. Ensure you are in the repository root. If not already cloned:
   git clone https://github.com/itz1508/oneshot_e2e.git oneshot
   cd oneshot

2. Detect the operating system (Windows, Linux/macOS, or Docker) and verify minimum prerequisites:
   - Node.js >= 24.13.0
   - npm >= 11.8.0
   - Python >= 3.11

3. Follow the Installation steps below for your platform:
   - Install Node dependencies: `npm ci` and `npm --prefix app/web ci`
   - Create Python virtual environment `.venv` and install requirements:
     `app/requirements/base.txt` and `app/requirements/workspace-api.txt`
     (On Windows, invoke via `.venv\Scripts\python -m pip` to prevent PowerShell execution policy restrictions)
   - Compile backend and frontend: `npm run build`
   - Run verification: `npm run verify` (must complete with `ONESHOT_PRODUCTION_E2E_VERIFIED`)
   - Launch application: `npm start` (serves at `http://localhost:8787`)

4. If any step fails, autonomously inspect errors and logs, resolve dependencies or environment paths, and retry — do not stop to ask.

5. When complete, confirm http://localhost:8787/api/health is responding and return:
   ONESHOT_INSTALL_RESULT = PASSED
   URL = http://localhost:8787
   PLATFORM = <Windows | Linux/macOS | Docker>
   VERIFICATION = ONESHOT_PRODUCTION_E2E_VERIFIED
   HEALTH = PASSED
```

---

# Installation

---

<details>
<summary>🖥️ Windows</summary>

```powershell
# Step 1: Clone (if not already inside repository)
git clone https://github.com/itz1508/oneshot_e2e.git oneshot
cd oneshot

# Step 2: Check Requirements
node --version    # >= 24.13.0
npm --version     # >= 11.8.0
python --version  # >= 3.11

# Step 3: Install
npm ci
npm --prefix app/web ci
python -m venv .venv
.venv\Scripts\python -m pip install -r app/requirements/base.txt -r app/requirements/workspace-api.txt

# Step 4: Build
npm run build

# Step 5: Verify (expects ONESHOT_PRODUCTION_E2E_VERIFIED)
npm run verify

# Step 6: Launch (serves at http://localhost:8787)
npm start
```

</details>

<details>
<summary>🐧 Linux/macOS</summary>

```bash
# Step 1: Clone (if not already inside repository)
git clone https://github.com/itz1508/oneshot_e2e.git oneshot
cd oneshot

# Step 2: Check Requirements
node --version    # >= 24.13.0
npm --version     # >= 11.8.0
python3 --version # >= 3.11

# Step 3: Install
npm ci
npm --prefix app/web ci
python3 -m venv .venv
.venv/bin/pip install -r app/requirements/base.txt -r app/requirements/workspace-api.txt

# Step 4: Build
npm run build

# Step 5: Verify (expects ONESHOT_PRODUCTION_E2E_VERIFIED)
npm run verify

# Step 6: Launch (serves at http://localhost:8787)
npm start
```

</details>

<details>
<summary>🐳 Docker</summary>

```bash
# Step 1: Clone (if not already inside repository)
git clone https://github.com/itz1508/oneshot_e2e.git oneshot
cd oneshot

# Step 2: Check Requirements
docker --version
docker compose version

# Step 3: Build Container Image
docker build -t oneshot:local .

# Step 4: Launch Container (serves at http://localhost:8787)
docker run -d -p 8787:8787 --name oneshot-runner oneshot:local

# Step 5: Verify Container Health
curl -f http://localhost:8787/api/health
```

</details>

---

## License

This project is licensed under the [Apache License 2.0](LICENSE).
Copyright 2026 OneShot Authors. See [NOTICE](docs/license/NOTICE) for third-party software notices.
