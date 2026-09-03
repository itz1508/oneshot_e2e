@echo off
REM Fresh OneShot production-Featherless runtime for the E2E proof run.
cd /d d:\oneshot_e2e
echo server launch starting %date% %time% > e2e-evidence\server-status.log
set ONESHOT_MODE=production
set ONESHOT_RESEARCH_PROVIDER=featherless
set PORT=8787
node dist\backend\index.js 1> e2e-evidence\server-stdout.log 2> e2e-evidence\server-stderr.log
set EXITCODE=%ERRORLEVEL%
echo server exited with code %EXITCODE% at %date% %time% >> e2e-evidence\server-status.log
