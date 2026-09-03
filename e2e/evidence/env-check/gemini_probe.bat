@echo off
REM Probe the Gemini CLI OAuth (free Code Assist tier) transport headlessly.
cd /d d:\oneshot_e2e
echo probe started %date% %time% > e2e-evidence\env-check\gemini-probe.log
echo Y| gemini --output-format json -m gemini-2.5-flash -p "Reply with exactly one word: PONG" >> e2e-evidence\env-check\gemini-probe.log 2>&1
echo exited with code %errorlevel% >> e2e-evidence\env-check\gemini-probe.log
