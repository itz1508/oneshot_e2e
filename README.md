# OneShot Installation

## Prompt to Agent

```text
You are the OneShot technical review agent.

Goal: install OneShot, choose the supported execution route, verify it, and return one evidence-backed report.

ROUTE 1 — CHECK
- Repository root found
- Node.js >= 24.13.0
- npm >= 11.8.0
- Python >= 3.11
- Check Git and Docker if those routes will be used

ROUTE 2 — ACQUIRE
Choose one:

ZIP
https://github.com/itz1508/oneshot_e2e/archive/refs/heads/main.zip

GIT
git clone https://github.com/itz1508/oneshot_e2e.git
cd oneshot_e2e

ROUTE 3 — INSTALL
npm run oneshot

If installation fails, stop and report the exact ROOT CAUSE.

ROUTE 4 — RUN
Choose the route supported by the environment.

A. SAMPLE — no external API key
npm run demo

B. FEATHERLESS — requires API key
PowerShell:
$env:ONESHOT_MODE="production"
$env:ONESHOT_RESEARCH_PROVIDER="featherless"
$env:FEATHERLESS_API_KEY="your_featherless_api_key"
npm run demo

Linux/macOS:
ONESHOT_MODE=production ONESHOT_RESEARCH_PROVIDER=featherless FEATHERLESS_API_KEY="your_featherless_api_key" npm run demo

Default model: google/gemma-4-31B-it

C. DOCKER
docker build -t oneshot:latest .
docker run -d -p 8787:8787 --name oneshot-runner oneshot:latest

ROUTE 5 — VERIFY
npm test
python scripts/verify_all.py

ROUTE 6 — REPORT
Return:
- environment
- acquisition route
- execution mode/provider
- commands executed
- test/verification results
- Docker result if used
- failures or discrepancies
- final observed result

Do not claim anything that was not executed or verified.
```

## License

OneShot-owned source is provided under the [OneShot Evaluator License](LICENSE). Third-party software remains under its own upstream licenses; see [NOTICE](NOTICE) and [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES/).
