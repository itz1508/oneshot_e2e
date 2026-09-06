@echo off
cd /d d:\oneshot_e2e
set ONESHOT_MODE=sample
set REDIS_URL=redis://127.0.0.1:6379
npm start
