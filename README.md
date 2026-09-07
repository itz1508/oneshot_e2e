# Agent Instruction Prompt

```text
You are an autonomous setup agent.

1. Create a new working directory for this project.
2. Follow the Installation steps below, using the variant that matches the machine's OS (Windows, Linux/macOS, or Docker).
3. If a step fails, diagnose and fix it yourself before continuing — do not stop to ask.
4. Finish by confirming the app is running and report the local URL.    

# Installation

<details open>
<summary>🖥️ Windows</summary>
## Quick Start (All-In-One)
- **Source Repository**: 
[github.com/itz1508/oneshot_e2e](https://github.com/itz1508/oneshot_e2e)
- **Direct Download**: 
[main.zip (Source Archive)](https://github.com/itz1508/oneshot_e2e/archive/refs/heads/main.zip)

```powershell
# Step 1: Clone (or extract the downloaded ZIP)
git clone https://github.com/itz1508/oneshot_e2e.git oneshot
cd oneshot

# Step 2: Install, Build, Verify & Launch (Single Command)
powershell -ExecutionPolicy Bypass -File .\scripts\install-e2e.ps1
```

### Expected Hash & Verification Success Output:
```text
[1/5] Checking prerequisites (Node.js, npm, Python)... OK
[2/5] Installing dependencies (Node.js & Python)... OK
[3/5] Building project (TypeScript backend & React Web IDE)... OK
[4/5] Running canonical verification suite...
      Checking repository manifest SHA-256 integrity...
      Manifest verified: MANIFEST_VERIFIED.
      Running test matrix and contracts...
      Verification passed: ONESHOT_PRODUCTION_E2E_VERIFIED.
      Verifying canonical cryptographic workflow hash proof...
      Cryptographic Hash: 6dd464dc06edcc0b4cdb9985df3a7c4d5140de1098d0bba85baaba4fe01952ca (equal=True)

============================================================
 ONESHOT_INSTALL_E2E = PASSED
 CANONICAL_HASH      = 6dd464dc06edcc0b4cdb9985df3a7c4d5140de1098d0bba85baaba4fe01952ca
 HASH_PROOF_EQUAL    = true (SHA-256 / RFC 8785 JCS)
 MANIFEST_STATUS     = MANIFEST_VERIFIED
 TEST_SUITE          = ONESHOT_PRODUCTION_E2E_VERIFIED
 URL                 = http://localhost:8787
 STATUS              = READY
============================================================
```

</details>

<details>
<summary>🐧 Linux/macOS</summary>

### Quick Start (All-In-One)

- **Source Repository**: [github.com/itz1508/oneshot_e2e](https://github.com/itz1508/oneshot_e2e)
- **Direct Download**: [main.zip (Source Archive)](https://github.com/itz1508/oneshot_e2e/archive/refs/heads/main.zip)

```bash
# Step 1: Clone (or extract the downloaded ZIP)
git clone https://github.com/itz1508/oneshot_e2e.git oneshot
cd oneshot

# Step 2: Install, Build, Verify & Launch (Single Command)
chmod +x ./scripts/install-e2e.sh && ./scripts/install-e2e.sh
```
````
#### Expected Hash & Verification Success Output:
```text
[1/5] Checking prerequisites (Node.js, npm, Python)... OK
[2/5] Installing dependencies (Node.js & Python)... OK
[3/5] Building project (TypeScript backend & React Web IDE)... OK
[4/5] Running canonical verification suite...
      Checking repository manifest SHA-256 integrity...
      Manifest verified: MANIFEST_VERIFIED.
      Running test matrix and contracts...
      Verification passed: ONESHOT_PRODUCTION_E2E_VERIFIED.
      Verifying canonical cryptographic workflow hash proof...
      Cryptographic Hash: 6dd464dc06edcc0b4cdb9985df3a7c4d5140de1098d0bba85baaba4fe01952ca (equal=true)

============================================================
 ONESHOT_INSTALL_E2E = PASSED
 CANONICAL_HASH      = 6dd464dc06edcc0b4cdb9985df3a7c4d5140de1098d0bba85baaba4fe01952ca
 HASH_PROOF_EQUAL    = true (SHA-256 / RFC 8785 JCS)
 MANIFEST_STATUS     = MANIFEST_VERIFIED
 TEST_SUITE          = ONESHOT_PRODUCTION_E2E_VERIFIED
 URL                 = http://localhost:8787
 STATUS              = READY
============================================================
```

</details>

<details>
<summary>🐳 Docker</summary>

### Quick Start (All-In-One)

- **Source Repository**: [github.com/itz1508/oneshot_e2e](https://github.com/itz1508/oneshot_e2e)
- **Direct Download**: [main.zip (Source Archive)](https://github.com/itz1508/oneshot_e2e/archive/refs/heads/main.zip)

```bash
# Step 1: Clone (or extract the downloaded ZIP)
git clone https://github.com/itz1508/oneshot_e2e.git oneshot
cd oneshot

# Step 2: Build, Verify & Launch (Single Command)
# On Windows PowerShell:
powershell -ExecutionPolicy Bypass -File .\scripts\install-e2e.ps1 -Docker

# On Linux / macOS:
chmod +x ./scripts/install-e2e.sh && ./scripts/install-e2e.sh --docker
```

#### Expected Hash & Verification Success Output:
```text
[1/4] Checking Docker daemon... OK
[2/4] Building Docker container image (oneshot:local)... OK
[3/4] Launching container and verifying health...
      Health check PASSED: mode=sample, provider=<default>
      Auth gate check PASSED (401 on unauthenticated access).
      Web UI check PASSED (200 OK).

============================================================
 ONESHOT_INSTALL_E2E = PASSED
 URL       = http://localhost:8787
 MODE      = sample
 CONTAINER = oneshot-local
============================================================
```

</details>

---

## License

This project is licensed under the [Apache License 2.0](LICENSE).
Copyright 2026 OneShot Authors. See [NOTICE](docs/license/NOTICE) for third-party software notices.
