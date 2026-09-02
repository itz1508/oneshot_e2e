# OneShot 1.3.0 - Hackathon Judge Quick-Start & Evaluation Guide

Fast-path evaluation guide for hackathon judges to verify the OneShot deterministic AI execution platform, triple validation gates (Schema, Fixture, Goal), RFC 8785 canonicalization, SHA-256 cryptographic proofs, and interactive React IDE in **under 60 seconds**.

---

## 🎬 Instant Video Demonstration & Walkthrough

Review the full end-to-end execution, task drawer telemetry, live activity disclosures, and proof generation in under 60 seconds:

- 📺 **Watch Video Demonstration on YouTube:** [https://www.youtube.com/watch?v=RQTxYwcNx_0](https://www.youtube.com/watch?v=RQTxYwcNx_0)
- 📁 **Direct Local MP4 File:** [`docs/OneShot_Task_Drawer_Compatibility_Fixed.mp4`](docs/OneShot_Task_Drawer_Compatibility_Fixed.mp4)

<video width="100%" max-width="880px" controls autoplay muted loop playsinline preload="auto">
  <source src="docs/OneShot_Task_Drawer_Compatibility_Fixed.mp4" type="video/mp4">
  Your browser does not support the video tag. You can watch the demonstration on YouTube at <a href="https://www.youtube.com/watch?v=RQTxYwcNx_0">https://www.youtube.com/watch?v=RQTxYwcNx_0</a> or view the local video file at <a href="docs/OneShot_Task_Drawer_Compatibility_Fixed.mp4">docs/OneShot_Task_Drawer_Compatibility_Fixed.mp4</a>.
</video>

---

<details open>
<summary><b>📖 Interactive Table of Contents</b> (click to expand / collapse)</summary>

- [⚡ Option 1: Judge Fast-Path (Prebuilt Docker Image — Recommended)](#-option-1-judge-fast-path-prebuilt-docker-image--recommended)
  - [Prerequisites](#prerequisites)
  - [Start OneShot](#start-oneshot)
    - [Windows](#windows)
    - [macOS / Linux](#macos--linux)
  - [Manual Step-by-Step Launch](#manual-step-by-step-launch)
  - [Stop the Platform](#stop-the-platform)
- [🛠️ Option 2: Developer & Source Build Verification Path](#️-option-2-developer--source-build-verification-path)
  - [Source Prerequisites](#source-prerequisites)
  - [One-Command Source Launch](#one-command-source-launch)
  - [Run Test Suites](#run-test-suites)
- [⚙️ Backend Configuration & Settings (Human-Readable Guide)](#️-backend-configuration--settings-human-readable-guide)
- [🎯 Interactive 3-Minute IDE Evaluation Walkthrough](#-interactive-3-minute-ide-evaluation-walkthrough)
- [🏛️ Architectural Proofs & Verification Matrix](#️-architectural-proofs--verification-matrix)
- [🔍 Troubleshooting & Common Questions](#-troubleshooting--common-questions)

</details>

---

## ⚡ Option 1: Judge Fast-Path (Prebuilt Docker Image — Recommended)

The fastest way to evaluate OneShot. No repository cloning, Node.js, Python, npm, or local compilation is required.

### Prerequisites

- **Docker Desktop** (or Docker Engine) running on Windows (WSL 2 or Hyper-V), macOS, or Linux.

---

## Start OneShot

### Windows

```powershell
.\start-oneshot.ps1
```

### macOS / Linux

```bash
chmod +x ./start-oneshot.sh ./stop-oneshot.sh
./start-oneshot.sh
```

Wait for the launcher to report that OneShot is healthy. The browser will open automatically at `http://localhost:8787`.

The launcher will:

- load the prebuilt `oneshot:1.3.0` image (`oneshot-1.3.0.tar`)
- generate the local access token in `.env`
- start Docker Compose (non-root, resource-limited)
- wait for the container to become healthy
- open `http://localhost:8787` automatically

No repository clone or build is required.

---

### Manual Step-by-Step Launch

If you prefer running standard Docker CLI commands manually:

#### Step 1: Load Prebuilt Image

```bash
docker load < oneshot-1.3.0.tar
```

#### Step 2: Configure Local Access Token

Copy the environment template:

- **Windows PowerShell**: `Copy-Item .env.example -Destination .env`
- **macOS / Linux**: `cp .env.example .env`

Edit `.env` and set `ONESHOT_API_TOKEN` to any local secret string:

```env
ONESHOT_BIND_HOST=0.0.0.0
PORT=8787
ONESHOT_API_TOKEN=oneshot-judge-2026-random-secret
```

> [!IMPORTANT]
> `ONESHOT_API_TOKEN` is **NOT** an external third-party API key. It is simply a local secret token securing your OneShot container session. Both the container and the browser use this token for authenticated access.

#### Step 3: Start the Container

```bash
docker compose -f docker-compose.judge.yml up -d
```

*(Or `docker compose up -d`)*

#### Step 4: Open the IDE

Wait 20–25 seconds for the healthcheck to reach healthy status, then open:
**`http://localhost:8787`**

When prompted for access in the browser, enter the token you set in `.env` (e.g. `oneshot-judge-2026-random-secret`).

---

### Stop the Platform

- **Windows**: `.\stop-oneshot.ps1`
- **macOS / Linux**: `./stop-oneshot.sh`
- **Docker Compose**: `docker compose -f docker-compose.judge.yml down`

---

## 🛠️ Option 2: Developer & Source Build Verification Path

If you wish to inspect the TypeScript/Python source code, rebuild the bundles, or execute the test matrix:

### Source Prerequisites

- **Node.js**: $\ge 20.0.0$
- **Python**: $\ge 3.11$
- **Git**

### One-Command Source Launch

```bash
git clone https://github.com/itz1508/oneshot_e2e.git
cd oneshot_e2e
npm run oneshot
```

`npm run oneshot` creates `.venv`, installs locked dependencies, compiles the strict TypeScript backend and Vite frontend, verifies canonical contracts and `MANIFEST.sha256`, runs the full test suite, starts the HTTP server, and opens `http://localhost:8787`.

### Run Test Suites

```bash
# Run all 49 Python and 57 TypeScript tests
npm run verify

# Run React IDE Vitest unit tests (104 tests)
npm --prefix web test

# Verify source hash manifest integrity
python scripts/verify_manifest.py
```

---

## ⚙️ Backend Configuration & Settings (Human-Readable Guide)

All settings are configured via environment variables or `.env` and map directly to runtime controls:

| Environment Variable | Default Value | Human-Readable Role & Description | IDE / Front-View Representation |
|---|---|---|---|
| `ONESHOT_MODE` | `sample` | **Execution Mode**: `sample` (deterministic offline benchmark) or `production` (live AI model execution). | Displays `Benchmark Mode` or `Production Mode` badge in Top Navigation Bar. |
| `ONESHOT_RESEARCH_PROVIDER` | `adk_gemma2` | **AI Research Engine**: Provider used for automated intent analysis (`adk_gemma2`, `featherless`, or `mock`). | Reflected in live stage drawer under `Research Engine: Google ADK / Gemma 2`. |
| `PORT` | `8787` | **HTTP Server Port**: The network port where the backend and React IDE are served. | Reflected in browser URL `http://localhost:8787`. |
| `ONESHOT_BIND_HOST` | `127.0.0.1` | **Network Interface Binding**: `127.0.0.1` (loopback only) or `0.0.0.0` (container / network). Non-loopback binding requires `ONESHOT_API_TOKEN`. | Gated by network security boundary; enforces authentication outside localhost. |
| `ONESHOT_API_TOKEN` | *Local Secret* | **Local Container Token**: Secret string (e.g. `oneshot-judge-2026-random-secret`) required when binding to `0.0.0.0`. Validated via HTTP header `Authorization: Bearer <token>` or session cookies. Not an external key. | Login prompt displayed on unauthenticated sessions. |
| `ONESHOT_SANDBOX_TIMEOUT_MS` | `30000` | **Sandbox Execution Timeout**: Maximum allowable runtime (ms) for sandboxed command execution. | Progress bar in sandbox execution panel. |
| `ONESHOT_SANDBOX_MAX_BYTES` | `1048576` (1MB) | **Execution Output Cap**: Buffer limit protecting client from runaway stdout/stderr. | Output truncated indicator in sandbox logs. |
| `FEATHERLESS_API_KEY` | *(Optional)* | **Cloud Inference Key**: API key used when `ONESHOT_RESEARCH_PROVIDER=featherless` (`google/gemma-4-31B-it`). | Configured in provider settings modal. |

---

## 🎯 Interactive 3-Minute IDE Evaluation Walkthrough

Once the IDE loads at `http://localhost:8787`:

### Step 1: Explore the Welcome Hub & Video Demonstration

- The Welcome screen features native video playback of a full workflow run.
- Click any card (e.g. **Canonical Execution**, **Google ADK & Authority Graph**, or **Contract Specification**) to open the document directly in the multi-tab `FileViewer`.
- Click **"📚 Specification & Contract Index"** or press `Ctrl+K` to search through 21 schema contracts and architecture documents.

### Step 2: Trigger 1-Click Execution

- Click **"🚀 1-Click Run Canonical Sample"** or click **"Start Verification Session"** in the chat input.
- Watch the live workflow progression:

  1. `INTENT_COLLECTED`: Deterministic intent revision created.
  2. `RESEARCH_COMPLETE`: Research gathered via Google ADK / Provider.
  3. `PLAN_PROPOSED` & `REFACTOR_EVALUATED`: Multi-stage plan synthesized.
  4. `TRIPLE_VALIDATED`: Parallel Schema, Fixture, and Goal validation gates evaluated.
  5. `CONFIRMED` & `HASH_CREATED`: RFC 8785 JCS canonicalization and SHA-256 cryptographic proof generated.
  6. `SANDBOX_EXECUTED`: Ephemeral isolated execution with evidence capture.

### Step 3: Inspect Telemetry & Artifact Proofs

- Open the collapsible **Task Drawer** on the right to inspect real-time stage progress, event log timestamps, and W3C trace identifiers.
- Click on the generated hash proof to view the deterministic SHA-256 digest and verify hash equality.

---

## 🏛️ Architectural Proofs & Verification Matrix

### Multi-Tier Ownership Model

- **`schema/`**: 21 Draft 2020-12 schemas defining canonical contracts.
- **`validation/`**: Python canonicalization (RFC 8785), SHA-256 hashing, and fixture execution.
- **`backend/`**: TypeScript runtime, append-only event store, and HTTP/SSE server.
- **`web/`**: Event-driven React IDE with real-time SSE stream consumption.

### Master Verification Gate Results

```text
======================================================================
ONE-SHOT PRODUCTION E2E 1.3.0 - MASTER VERIFICATION SUMMARY
======================================================================
  [PASS] Python Unit Suite:            49 / 49 tests passed
  [PASS] TypeScript E2E Suite:         57 / 57 tests passed
  [PASS] React IDE Vitest Suite:       104 / 104 tests passed
  [PASS] Checksum Manifest Integrity:  Verified (MANIFEST.sha256)
  [PASS] Docker Packaging & Runtime:   5 / 5 container tests passed
======================================================================
  STATUS: ONESHOT_PRODUCTION_E2E_VERIFIED (100% PASS)
======================================================================
```

---

## 🔍 Troubleshooting & Common Questions

<details>
<summary><b>Q: How do I access the IDE if the browser does not open automatically?</b></summary>

Open your browser and navigate to `http://localhost:8787`. If prompted for an access token, use the token printed in your terminal or found in `.env` under `ONESHOT_API_TOKEN`.
</details>

<details>
<summary><b>Q: How do I change the listening port?</b></summary>

Pass the `Port` parameter to the startup script:

- Windows: `.\start-oneshot.ps1 -Port 9000`
- macOS / Linux: `PORT=9000 ./start-oneshot.sh`

</details>

<details>
<summary><b>Q: How do I inspect container logs?</b></summary>

Run `docker compose -f docker-compose.judge.yml logs -f oneshot` or `docker logs -f oneshot-app`.
</details>
