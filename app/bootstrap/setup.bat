@echo off
setlocal enabledelayedexpansion

echo OneShot Setup (Windows)
echo ======================

:: 1. Check Git
echo [1/8] Checking Git...
git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git not found
    echo Please install Git from https://git-scm.com/
    exit /b 1
)
echo [OK] Git detected

:: 2. Check Python >= 3.12
echo [2/8] Checking Python runtime...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found
    echo Please install Python >= 3.12
    exit /b 1
)
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)"
if errorlevel 1 (
    echo [ERROR] Python version is too old. Python >= 3.12 is required.
    exit /b 1
)
for /f "tokens=*" %%p in ('python --version') do echo [OK] %%p

:: 3. Setup Environment Configuration
echo [3/8] Checking environment configuration...
if not exist "app\env\.env" (
    if exist "app\env\.env.example" (
        copy "app\env\.env.example" "app\env\.env" >nul
        echo [OK] Created app\env\.env from template
    ) else (
        echo [WARNING] app\env\.env.example template not found
    )
) else (
    echo [OK] app\env\.env exists
)

:: 4. Check Node.js >= 24.21.0
echo [4/8] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found
    echo Please install Node.js >= 24.21.0 from https://nodejs.org/
    exit /b 1
)
for /f "tokens=2 delims=v" %%a in ('node --version') do set NODE_VER=%%a
node -e "const v=process.versions.node.split('.').map(Number),r=[24,21,0];process.exit(v[0]!==r[0]?v[0]-r[0]:v[1]!==r[1]?v[1]-r[1]:v[2]-r[2])"
if errorlevel 1 (
    echo [ERROR] Node.js version %NODE_VER% is too old
    echo Please install Node.js >= 24.21.0
    exit /b 1
)
echo [OK] Node.js %NODE_VER%

:: 5. Check pnpm >= 11.27.1
echo [5/8] Checking pnpm...
pnpm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] pnpm not found
    echo Enable Corepack or install pnpm >= 11.27.1, then try again.
    exit /b 1
)
for /f %%v in ('pnpm --version') do set PNPM_VER=%%v
node -e "const v=process.argv[1].split('.').map(Number),r=[11,27,1];process.exit(v[0]!==r[0]?v[0]-r[0]:v[1]!==r[1]?v[1]-r[1]:v[2]-r[2])" %PNPM_VER%
if errorlevel 1 (
    echo [ERROR] pnpm version %PNPM_VER% is too old
    echo Please install pnpm >= 11.27.1
    exit /b 1
)
echo [OK] pnpm %PNPM_VER%

:: 6. Install dependencies
echo [6/8] Installing dependencies...
call pnpm install --frozen-lockfile
if errorlevel 1 (
    echo [ERROR] pnpm install failed
    exit /b 1
)
echo [OK] Dependencies installed

:: 6b. Sync uv-managed Python reasoning env
where uv >nul 2>&1
if errorlevel 1 (
    echo [WARNING] uv not found; backend/python/.venv not synced
) else (
    call node scripts/setup-python.mjs
    if errorlevel 1 echo [WARNING] Python env sync failed
)

:: 7. Build backend & UI
echo [7/8] Compiling backend and UI...
call pnpm run build:backend
if errorlevel 1 (
    echo [ERROR] Backend build failed
    exit /b 1
)
call pnpm run build:ui
if errorlevel 1 (
    echo [ERROR] Frontend build failed
    exit /b 1
)
echo [OK] Backend and UI built

:: 8. Generate and verify manifest
echo [8/8] Verifying repository manifest and integrity...
python app/scripts/generate_manifest.py
if errorlevel 1 (
    echo [WARNING] Manifest generation failed
) else (
    echo [OK] Manifest generated
)
python app/scripts/verify_all.py
if errorlevel 1 (
    echo [WARNING] Verification failed
) else (
    echo [OK] Verification passed
)

echo.
echo Setup complete!
echo.
echo Start server: pnpm run start
echo.
echo Open browser: http://localhost:8787
echo.
