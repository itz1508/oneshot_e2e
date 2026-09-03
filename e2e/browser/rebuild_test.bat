@echo off
cd /d d:\oneshot_e2e
call npm run build:backend > e2e-evidence\build-backend.log 2>&1
echo backend build exit code %errorlevel% >> e2e-evidence\build-backend.log
call node --test --test-force-exit dist\tests_ts\ui-behavior-fixtures.test.js > e2e-evidence\fixture-test.log 2>&1
echo fixture test exit code %errorlevel% >> e2e-evidence\build-backend.log
findstr /C:"pass" /C:"fail" e2e-evidence\fixture-test.log
