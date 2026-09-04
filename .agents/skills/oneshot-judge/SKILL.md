---
name: oneshot-judge
description: Deterministically evaluate, launch, and verify the containerized OneShot platform for competition judging with zero external API credentials.
---

# OneShot Judge Skill

Execute this workflow when the user requests judging, competition evaluation, automated platform verification, or runs the prompt in `docs/JUDGE_AGENT_PROMPT.txt`.

## Operating Principles

- **Zero External Credentials**: Never request or require `GOOGLE_API_KEY`, `GEMINI_API_KEY`, `FEATHERLESS_API_KEY`, `TAVILY_API_KEY`, `OPENAI_API_KEY`, or any other provider key. The evaluation runtime operates in deterministic `sample` mode.
- **Dynamic Security**: Generate a cryptographically random local `ONESHOT_API_TOKEN` at runtime. Never commit or print the token value.
- **Deterministic Execution**: Invoke the platform launcher script (`scripts/judge-launch.ps1` on Windows, `scripts/judge-launch.sh` on POSIX) to ensure repeatable container lifecycle, health polling, authentication barriers, and UI validation.
- **No Faking**: Never invent or fabricate results, hashes, terminal states, or test metrics. Every metric must derive from live inspection.

## Procedure

### Step 1: Detect Environment and Verify Docker

1. Determine repository root. Ensure the current working directory is the repository root.
2. Confirm Docker daemon is running:
   ```bash
   docker version
   ```
   If Docker is unavailable, halt immediately with:
   ```text
   ROOT_CAUSE: Docker daemon is unavailable. Ensure Docker Desktop / dockerd is active.
   ```

### Step 2: Execute Canonical Launcher

On Windows PowerShell:
```powershell
if (Test-Path ".\scripts\judge-launch.ps1") { & ".\scripts\judge-launch.ps1" } else { & ".\scripts\installation\windows\judge-launch.ps1" }
```

On POSIX / Linux / macOS:
```bash
if [ -f "./scripts/judge-launch.sh" ]; then chmod +x ./scripts/judge-launch.sh && ./scripts/judge-launch.sh; else chmod +x ./scripts/installation/mac/judge-launch.sh && ./scripts/installation/mac/judge-launch.sh; fi
```

The launcher script will:
1. Locate or load `OneShot-1.3.0-judge.tar` (or build `oneshot:judge` if tar is absent).
2. Generate a secure, uncommitted ephemeral token.
3. Clean up any stale container on port 8787.
4. Launch container `oneshot-judge-runner` with `ONESHOT_BIND_HOST=0.0.0.0`, `PORT=8787`, `ONESHOT_MODE=sample`.
5. Poll `http://127.0.0.1:8787/api/health` until `status: ok` (bounded 30s timeout).
6. Verify authentication gate: unauthenticated `/api/health` must yield HTTP 401.
7. Verify root UI (`/`) and static assets (`/app.js`, `/styles.css`) yield HTTP 200.
8. Execute canonical browser E2E test against the container if host environment supports it (`node scripts/e2e/browser/state-adaptive-e2e.mjs`).

### Step 3: Handle Failures

If any step fails, diagnose container state using:
```bash
docker logs --tail 50 oneshot-judge-runner
```
Return a structured `ROOT_CAUSE` containing:
- Failing check
- Observed result
- Exact command executed
- Specific corrective action

### Step 4: Return Standardized Judge Result

On successful verification, output strictly:

```text
ONESHOT_JUDGE_RESULT = PASSED
URL = http://localhost:8787
MODE = sample
PROVIDER_KEY_REQUIRED = NO
LOCAL_ACCESS_TOKEN = GENERATED
CONTAINER = <actual container name>
IMAGE = <actual image tag / ID>
HEALTH = PASSED
UI = PASSED
AUTH = PASSED
E2E = PASSED | NOT_RUN (<reason>)
```
