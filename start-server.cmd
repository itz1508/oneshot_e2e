@echo off
cd /d %~dp0
set ONESHOT_MODE=sample
set REDIS_URL=redis://127.0.0.1:6379
npm start
