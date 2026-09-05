@echo off
REM OneShot production runtime; activate a public provider through the UI.
cd /d d:\oneshot_e2e
echo server launch starting %date% %time% > dist\e2e-evidence\server-status.log
set ONESHOT_MODE=production
set PORT=8787
node dist\backend\index.js 1> dist\e2e-evidence\server-stdout.log 2> dist\e2e-evidence\server-stderr.log
set EXITCODE=%ERRORLEVEL%
echo server exited with code %EXITCODE% at %date% %time% >> dist\e2e-evidence\server-status.log
