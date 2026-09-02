@echo off
setlocal EnableDelayedExpansion
set "PROJECT_ROOT=%~dp0"
pushd "%PROJECT_ROOT%" || exit /b 1

echo.
echo ================================================================
echo   OneShot Production E2E 1.3.0 - Automated Setup & Verification
echo ================================================================
echo.

REM -- Step 1: Prerequisites --------------------------------------------------
echo [1/5] Checking prerequisites...

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js 20+ from https://nodejs.org
    popd
    endlocal
    exit /b 1
)

for /f "tokens=*" %%v in ('node -e "process.stdout.write(process.versions.node)"') do set NODE_VER=%%v
for /f "tokens=1 delims=." %%m in ("!NODE_VER!") do set NODE_MAJOR=%%m
if !NODE_MAJOR! LSS 20 (
    echo [ERROR] Node.js !NODE_VER! found, but 20+ is required.
    popd
    endlocal
    exit /b 1
)
echo        Node.js !NODE_VER! ... [OK]

where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not installed. Please install Python 3.11+ from https://www.python.org
    popd
    endlocal
    exit /b 1
)

for /f "tokens=*" %%v in ('python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"') do set PY_VER=%%v
for /f "tokens=1,2 delims=." %%a in ("!PY_VER!") do (
    set PY_MAJOR=%%a
    set PY_MINOR=%%b
)
if !PY_MAJOR! LSS 3 (
    echo [ERROR] Python !PY_VER! found, but 3.11+ is required.
    popd
    endlocal
    exit /b 1
)
if !PY_MAJOR! EQU 3 if !PY_MINOR! LSS 11 (
    echo [ERROR] Python !PY_VER! found, but 3.11+ is required.
    popd
    endlocal
    exit /b 1
)
echo        Python !PY_VER! ... [OK]

REM -- Step 2: Python Virtual Environment -------------------------------------
echo.
echo [2/5] Initializing Python virtual environment...

if not exist ".venv\Scripts\activate.bat" (
    python -m venv .venv
    echo        Created .venv virtual environment
) else (
    echo        .venv virtual environment already exists
)
call .venv\Scripts\activate.bat

REM -- Step 3: Python Dependencies --------------------------------------------
echo.
echo [3/5] Installing pinned Python dependencies...
pip install -q -r requirements\core.txt
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Core Python dependency installation failed.
    popd
    endlocal
    exit /b 1
)

pip install -q -r requirements\workspace-api.txt
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Workspace API dependency installation failed.
    popd
    endlocal
    exit /b 1
)
echo        Python dependencies installed successfully ... [OK]

REM -- Step 4: Node Dependencies & Build --------------------------------------
echo.
echo [4/5] Installing Node dependencies and compiling bundles...
call npm ci --offline --ignore-scripts --no-audit --no-fund >nul 2>&1
if %ERRORLEVEL% neq 0 (
    call npm install --no-audit --no-fund >nul 2>&1
)
call npm --prefix web install --no-audit --no-fund >nul 2>&1
echo        Node dependencies installed ... [OK]

call npm run build >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] TypeScript / Vite build failed.
    popd
    endlocal
    exit /b 1
)
echo        Backend and frontend bundles compiled ... [OK]

REM -- Step 5: Verification Suite ---------------------------------------------
echo.
echo [5/5] Executing full verification matrix (Python + Node + Vitest + Manifest)...
echo.

call npm run verify
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Master verification suite failed.
    popd
    endlocal
    exit /b 1
)

call npm --prefix web test
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] React IDE Vitest tests failed.
    popd
    endlocal
    exit /b 1
)

echo.
echo ================================================================
echo   SETUP COMPLETE - All verification suites passed (100%% Green)
echo ================================================================
echo.
echo   To launch the OneShot platform:
echo     npm run oneshot    Auto-start and open http://localhost:8787
echo     npm start          Start backend server directly
echo     .\start-oneshot.ps1 1-Click Docker container launcher
echo.

popd
endlocal
exit /b 0
