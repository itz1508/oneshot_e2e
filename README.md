# Agent Instruction Prompt

```text
You are an autonomous setup agent.

1. Create a new working directory for this project.
2. Follow the Installation steps below, using the variant that matches the machine's OS (Windows, Linux/macOS, or Docker).
3. If a step fails, diagnose and fix it yourself before continuing — do not stop to ask.
4. Finish by confirming the app is running and report the local URL.
```

---

# Installation

---

🖥️ Windows

```powershell
# Step 1: Clone
git clone https://github.com/itz1508/oneshot_e2e.git oneshot
cd oneshot

# Step 2: Check Requirements
node --version
npm --version
python --version

# Step 3: Install
npm ci
npm --prefix app/web ci
python -m venv .venv
.venv\Scripts\Activate
python -m pip install -r app/requirements/base.txt -r app/requirements/workspace-api.txt

# Step 4: Build
npm run build

# Step 5: Verify
npm run verify

# Step 6: Launch
npm start
```

</details>

<details>
<summary>🐧 Linux/macOS</summary>

```bash
# Step 1: Clone
git clone https://github.com/itz1508/oneshot_e2e.git oneshot
cd oneshot

# Step 2: Check Requirements
node --version
npm --version
python3 --version

# Step 3: Install
npm ci
npm --prefix app/web ci
python3 -m venv .venv
source .venv/bin/activate
pip install -r app/requirements/base.txt -r app/requirements/workspace-api.txt

# Step 4: Build
npm run build

# Step 5: Verify
npm run verify

# Step 6: Launch
npm start
```

</details>

<details>
<summary>🐳 Docker</summary>

```bash
# Step 1: Clone
git clone https://github.com/itz1508/oneshot_e2e.git oneshot
cd oneshot

# Step 2: Check Requirements
docker --version
docker-compose --version

# Step 3: Install
docker build -t oneshot:local .

# Step 4: Verify
docker run --rm oneshot:local node dist/backend/index.js --health

# Step 5: Launch
docker run -p 8787:8787 oneshot:local
```

</details>

---

## License

This project is licensed under the [Apache License 2.0](LICENSE).
Copyright 2026 OneShot Authors. See [NOTICE](docs/license/NOTICE) for third-party software notices.
