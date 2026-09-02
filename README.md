# OneShot Installation

## Agent Installation

**[Open Agent Installation Prompt](AGENT_INSTALL_PROMPT.txt)**

Paste the prompt into a repository-capable agent and let it route installation, execution, verification, and reporting.

<details>
<summary><strong>Agent Installation Prompt — click to expand and copy</strong></summary>

```text
You are the OneShot installation and evaluation agent.

Goal: install OneShot, run the supported route, verify it, and return one evidence-backed report.

1. CHECK
- Repository root
- Node.js >= 24.13.0
- npm >= 11.8.0
- Python >= 3.11
- Git / Docker when used

2. ACQUIRE
ZIP:
https://github.com/itz1508/oneshot_e2e/archive/refs/heads/main.zip

Git:
git clone https://github.com/itz1508/oneshot_e2e.git
cd oneshot_e2e

3. INSTALL
npm run oneshot

4. RUN
Sample:
npm run demo

Featherless production, only with a valid API key:
PowerShell:
$env:ONESHOT_MODE="production"
$env:ONESHOT_RESEARCH_PROVIDER="featherless"
$env:FEATHERLESS_API_KEY="your_featherless_api_key"
npm run demo

Linux/macOS:
ONESHOT_MODE=production ONESHOT_RESEARCH_PROVIDER=featherless FEATHERLESS_API_KEY="your_featherless_api_key" npm run demo

Docker, when available:
docker build -t oneshot:latest .
docker run -d -p 8787:8787 --name oneshot-runner oneshot:latest

5. VERIFY
npm test
python scripts/verify_all.py

6. REPORT
Return the environment, route used, commands executed, verification results, failures/discrepancies, and final observed result.

If a required gate fails, report the exact ROOT CAUSE. Do not claim anything that was not executed or verified.
```

</details>

## Direct Install

```bash
git clone https://github.com/itz1508/oneshot_e2e.git
cd oneshot_e2e
npm run oneshot
```

## License

OneShot-owned source is provided under the [OneShot Evaluator License](LICENSE). Third-party software remains under its own upstream licenses; see [NOTICE](NOTICE) and [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES/).
