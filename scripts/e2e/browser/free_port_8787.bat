@echo off
REM Free port 8787: terminate any process listening on it (fresh runtime requirement).
set FOUND=
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R ":8787 .*LISTENING"') do (
  set FOUND=%%P
  echo killing pid %%P holding port 8787
  taskkill /F /PID %%P
)
if not defined FOUND echo port 8787 is already free
