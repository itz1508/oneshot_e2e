@echo off
title OneShot E2E Launcher
cd /d "%~dp0\.."
echo ============================================================
echo          OneShot E2E - 1-Click Application Launcher
echo ============================================================
echo.
echo 📍 Project Folder: %CD%
echo 🌐 Launching OneShot console...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0\start-web.ps1"
pause
