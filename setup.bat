@echo off
setlocal EnableDelayedExpansion

echo.
echo  ============================================================
echo   OneShot Production E2E - Automated Setup
echo  ============================================================
echo.

REM ── Prerequisites ──────────────────────────────────────────────
echo [1/6] Checking prerequisites...

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo  ERROR: Node.js is not installed.
    echo  Install Node.js 20+ from https://nodejs.org
    echo.
    exit /b 1
)

for /f "tokens=*" %%v in ('node -e "process.stdout.write(process.versions.node)"') do set NODE_VER=%%v
for /f "tokens=1 delims=." %%m in ("!NODE_VER!") do set NODE_MAJOR=%%m
if !NODE_MAJOR! LSS 20 (
    echo.
    echo  ERROR: Node.js !NODE_VER! found, but 20+ is required.
    echo  Install from https://nodejs.org
    echo.
    exit /b 1
)
echo        Node.js !NODE_VER! ... OK

where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo  ERROR: Python is not installed.
    echo  Install Python 3.11+ from https://www.python.org
    echo.
    exit /b 1
)

for /f "tokens=*" %%v in ('python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"') do set PY_VER=%%v
for /f "tokens=1,2 delims=." %%a in ("!PY_VER!") do (
    set PY_MAJOR=%%a
    set PY_MINOR=%%b
)
if !PY_MAJOR! LSS 3 (
    echo  ERROR: Python !PY_VER! found, but 3.11+ is required.
    exit /b 1
)
if !PY_MAJOR! EQU 3 if !PY_MINOR! LSS 11 (
    echo  ERROR: Python !PY_VER! found, but 3.11+ is required.
    exit /b 1
)
echo        Python !PY_VER! ... OK

REM ── Python venv ────────────────────────────────────────────────
echo.
echo [2/6] Setting up Python virtual environment...

if not exist ".venv\Scripts\activate.bat" (
    python -m venv .venv
    echo        Created .venv
) else (
    echo        .venv already exists
)
call .venv\Scripts\activate.bat

REM ── Python dependencies ────────────────────────────────────────
echo.
echo [3/6] Installing Python dependencies...
pip install -q -r requirements.txt
if %ERRORLEVEL% neq 0 (
    echo  ERROR: Core Python dependency installation failed.
    exit /b 1
)

pip install -q -r requirements-workspace-api.txt
if %ERRORLEVEL% neq 0 (
    echo  ERROR: Workspace API dependency installation failed.
    exit /b 1
)
echo        Python deps installed

REM ── Node dependencies ──────────────────────────────────────────
echo.
echo [4/6] Installing Node.js dependencies (offline from vendor)...
call npm ci --offline --ignore-scripts --no-audit --no-fund >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo        Retrying with network...
    call npm install --no-audit --no-fund >nul 2>&1
)
call npm --prefix web install --no-audit --no-fund >nul 2>&1
echo        Node deps installed

REM ── Build ──────────────────────────────────────────────────────
echo.
echo [5/6] Building TypeScript...
call npm run build >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  ERROR: TypeScript build failed.
    exit /b 1
)
echo        Build complete

REM ── Tests ──────────────────────────────────────────────────────
echo.
echo [6/6] Running test suite (92 tests)...
echo.

python -m unittest discover -s tests -v 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo  !! Python tests failed.
    exit /b 1
)

echo.
node --test --test-force-exit dist/tests_ts/*.test.js
if %ERRORLEVEL% neq 0 (
    echo.
    echo  !! TypeScript tests failed.
    exit /b 1
)

echo.
echo  ============================================================
echo   SETUP COMPLETE - All 92 tests passed!
echo  ============================================================
echo.
echo   Next steps:
echo     npm run demo       Launch OneShot for Demonstration
echo     npm start          Start the full server on http://localhost:8787
echo.

endlocal
