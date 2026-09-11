# OneShot — One Click Installation

[![Workflow](https://img.shields.io/badge/WORKFLOW-2563EB?style=for-the-badge)](docs/WORKFLOW_TREE)
[![Index](https://img.shields.io/badge/INDEX-475569?style=for-the-badge)](INDEX.md)
[![App review](https://img.shields.io/badge/APP_REVIEW-7C3AED?style=for-the-badge)](docs/APP_REVIEW.md)
[![Download ZIP](https://img.shields.io/badge/DOWNLOAD_ZIP-059669?style=for-the-badge)](https://github.com/itz1508/oneshot_e2e/archive/refs/heads/main.zip)

**Installation scripts:** [Windows installer](scripts/install-e2e.ps1) · [Linux / macOS installer](scripts/install-e2e.sh)

These links open the scripts for review; run them locally using the agent prompt below.

Copy this prompt into your coding agent:

```text
You are an autonomous setup agent. Install and launch OneShot on this machine.

Repository: https://github.com/itz1508/oneshot_e2e
Local URL: http://localhost:8787

1. Detect the operating system. Use Docker if the user requests it;
   otherwise use the native installer.

2. Clone the repository into a new directory and enter it:
   git clone https://github.com/itz1508/oneshot_e2e.git oneshot
   cd oneshot
   If already working in this repository, use the current checkout.
   Preserve existing files and changes.

3. Check and install missing prerequisites:
   Native: Node.js 24.13.0+, npm 11.8.0+, Python 3.11+.
   Linux/macOS native: Bash and Python venv support.
   Docker: install and start Docker Desktop on Windows/macOS, or
   Docker Engine on Linux. Use Linux containers.
   Linux/macOS Docker: Bash and curl.
   Follow the official installation instructions:
   https://nodejs.org/en/download
   https://www.python.org/downloads/
   https://docs.docker.com/get-started/get-docker/
   https://docs.docker.com/engine/install/
   For Docker, confirm docker version reports both Client and Server.
   Complete available setup steps autonomously. Request user action only
   when required for administrator access, interactive setup, or restart.

4. Run the matching command from the repository root:

   Windows:
   powershell -ExecutionPolicy Bypass -File .\scripts\install-e2e.ps1

   Linux/macOS:
   bash ./scripts/install-e2e.sh

   Docker on Windows:
   powershell -ExecutionPolicy Bypass -File .\scripts\install-e2e.ps1 -Docker

   Docker on Linux/macOS:
   bash ./scripts/install-e2e.sh --docker

   Before the Docker installer, check for an existing oneshot-local
   container and containers publishing port 8787. The installer removes
   these containers. Do not remove existing user data without approval.

5. If installation fails, inspect the first error, diagnose its cause,
   apply a focused fix, and retry. Do not bypass verification, overwrite
   user work, or report success while a required check is failing.

6. Confirm the server is listening and the web page responds at the local
   URL. Keep the application running. The installers default to sample
   mode; report that mode accurately. Docker startup checks do not prove
   the full native verification suite passed.

7. Finish with only:
   Status: RUNNING or BLOCKED
   URL: the verified local URL, or unavailable
   Mode: the actual mode
   Verification: checks that actually passed
   Blocker: only if unresolved
```

[Source repository](https://github.com/itz1508/oneshot_e2e) · [Download ZIP](https://github.com/itz1508/oneshot_e2e/archive/refs/heads/main.zip)

[Apache License 2.0](LICENSE) · [Third-party notices](docs/license/NOTICE)
