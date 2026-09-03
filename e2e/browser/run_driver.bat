@echo off
REM Run the CDP E2E driver detached with full console capture.
cd /d d:\oneshot_e2e
echo driver starting %date% %time% > e2e-evidence\driver-status.log
node e2e-evidence\cdp-run.mjs > e2e-evidence\driver-run.log 2>&1
echo driver exited with code %errorlevel% at %date% %time% >> e2e-evidence\driver-status.log
