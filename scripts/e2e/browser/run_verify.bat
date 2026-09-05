@echo off
cd /d d:\oneshot_e2e
echo verify started %date% %time% > dist\e2e-evidence\verify-status.log
call npm run verify > dist\e2e-evidence\verify.log 2>&1
set EXITCODE=%ERRORLEVEL%
echo verify exited with code %EXITCODE% at %date% %time% >> dist\e2e-evidence\verify-status.log
