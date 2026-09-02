# OneShot Installation

Use the prompt below with a repository-capable agent to install, run, and verify OneShot.

## Prompt to Agent

```text
You are the OneShot technical review agent.

Your task is to install OneShot, exercise the supported demonstration paths, run the verification suite, and return one evidence-backed report.

PHASE 1 — INSTALLATION

1. Repository and environment check

Before changing the environment, inspect and report what is already available:
- Operating system
- Node.js version — OneShot requires Node.js 24.13.0 or newer
- npm version — OneShot requires npm 11.8.0 or newer
- Python version — OneShot requires Python 3.11 or newer
- Git availability if using the clone path
- Docker availability if using the container path

Use an existing compatible environment when possible. Do not replace working tools unnecessarily.

2. Acquire OneShot

Choose the acquisition method supported by the environment.

Browser / ZIP:
https://github.com/itz1508/oneshot_e2e/archive/refs/heads/main.zip

Git:
git clone https://github.com/itz1508/oneshot_e2e.git
cd oneshot_e2e

Source repository:
https://github.com/itz1508/oneshot_e2e

3. Install and launch

From the OneShot project root run:

npm run oneshot

This is the repository-supported single-command launcher. It checks the environment, prepares the Python virtual environment and pinned dependency profiles, installs Node dependencies, builds the backend and UI, verifies canonical contracts and the manifest, runs the automated verification suite, and starts OneShot.

If a required gate fails, report the exact failing command and root cause instead of claiming installation succeeded.

PHASE 2 — DEMONSTRATION

Mode A — Deterministic Sample Provider

Run:

npm run demo

Expected configuration:
- Mode: SAMPLE
- Provider: Deterministic Sample Provider
- External provider API key: not required

Use this mode for the reproducible evaluation path when no external AI-provider key is available.

Mode B — Production Featherless Provider

Production mode is separate because it requires an external Featherless API key.

Windows PowerShell:

$env:ONESHOT_MODE="production"
$env:ONESHOT_RESEARCH_PROVIDER="featherless"
$env:FEATHERLESS_API_KEY="your_featherless_api_key"
npm run demo

Windows Command Prompt:

set ONESHOT_MODE=production
set ONESHOT_RESEARCH_PROVIDER=featherless
set FEATHERLESS_API_KEY=your_featherless_api_key
npm run demo

Linux / macOS:

export ONESHOT_MODE=production
export ONESHOT_RESEARCH_PROVIDER=featherless
export FEATHERLESS_API_KEY=your_featherless_api_key
npm run demo

Default Featherless model:
google/gemma-4-31B-it

When a valid key is available, run a real request through the production provider and record the observed workflow result. If no key is available, mark production-provider execution as UNVERIFIED and continue with the sample path.

PHASE 3 — VERIFICATION AND TESTS

Run the repository tests:

npm test

Run the full verification suite:

python scripts/verify_all.py

The full verifier covers the Python validation tests, project build, and compiled TypeScript tests. Record the actual command results. Do not substitute historical test counts for current execution evidence.

PHASE 4 — DOCKER

If Docker is available, build and run the repository container:

docker build -t oneshot:latest .
docker run -d -p 8787:8787 --name oneshot-runner oneshot:latest

Verify that the running service responds at:
http://localhost:8787/api/health

If Docker is unavailable, report that path as UNVERIFIED rather than treating it as a product failure.

PHASE 5 — FINAL REPORT

Return one report containing:
- environment detected;
- acquisition method used;
- installation result;
- commands executed;
- deterministic sample-mode result;
- production-provider result when a key was available;
- npm test result;
- full verification result;
- Docker build/run result when Docker was available;
- failures or discrepancies with exact evidence;
- final evidence classification: EXECUTED, TESTED, IMPLEMENTED, DOCUMENTED, or UNVERIFIED.

Do not infer success from documentation. Report only what was actually observed.
```

## License

OneShot-owned source is pre-release software provided under the [OneShot Evaluator License](LICENSE) solely for evaluation, judging, technical review, testing, verification, and demonstration. Continuing development, retained personal or internal use, redistribution, resale, production use, and commercial use require prior written authorization.

Third-party software is licensed separately under its own upstream terms. See [NOTICE](NOTICE) and [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES/). No third-party license grants rights to OneShot-owned material.
