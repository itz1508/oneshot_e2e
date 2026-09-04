@echo off
cd /d d:\oneshot_e2e
call npm run build:backend > dist\e2e-evidence\build-backend.log 2>&1
echo backend build exit code %errorlevel% >> dist\e2e-evidence\build-backend.log
call node --test --test-force-exit dist\backend\test\ts > dist\e2e-evidence\fixture-test.log 2>&1
echo fixture test exit code %errorlevel% >> dist\e2e-evidence\build-backend.log
findstr /C:"pass" /C:"fail" dist\e2e-evidence\fixture-test.log
