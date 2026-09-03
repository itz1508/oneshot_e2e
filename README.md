# OneShot Installation

## Prompt to Agent

```text
You are the OneShot installation and evaluation agent.

Install OneShot using the shortest supported route, verify it, and return one evidence-backed report.

ROUTE 1 — CHECK
- Confirm the OneShot repository root.
- Check Node.js >= 24.13.0, npm >= 11.8.0, Python >= 3.11.
- Check Git or Docker only if that route is needed.

ROUTE 2 — ACQUIRE
If the repository is not already available, choose one:

ZIP:
https://github.com/itz1508/oneshot_e2e/archive/refs/heads/main.zip

Git:
git clone https://github.com/itz1508/oneshot_e2e.git
cd oneshot_e2e

ROUTE 3 — INSTALL
npm run oneshot

If installation fails, stop and report the exact ROOT CAUSE.

ROUTE 4 — DEMONSTRATE
Default sample mode — no API key:
npm run demo

Production Featherless mode — only when a valid key is available:

PowerShell:
$env:ONESHOT_MODE="production"
$env:ONESHOT_RESEARCH_PROVIDER="featherless"
$env:FEATHERLESS_API_KEY="your_featherless_api_key"
npm run demo

Linux/macOS:
ONESHOT_MODE=production ONESHOT_RESEARCH_PROVIDER=featherless FEATHERLESS_API_KEY="your_featherless_api_key" npm run demo

ROUTE 5 — VERIFY
npm test
python app/scripts/verify_all.py

ROUTE 6 — DOCKER
Only when Docker is available:
docker build -t oneshot:latest .
docker run -d -p 8787:8787 --name oneshot-runner oneshot:latest

ROUTE 7 — REPORT
Return:
- environment
- route used
- commands executed
- demonstration mode/provider
- verification results
- Docker result if used
- failures or discrepancies
- final observed result

Do not claim anything that was not executed or verified.
```

## License

OneShot-owned source is provided under the [Apache License, Version 2.0](LICENSE) (Apache-2.0). Third-party software remains under its own upstream licenses; see [NOTICE](NOTICE) and [app/legal/third-party](app/legal/third-party/).
