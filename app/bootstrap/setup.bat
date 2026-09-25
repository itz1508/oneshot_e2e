@echo off
echo OneShot Setup (Windows)
echo ======================

:: Check Node.js
echo [1/7] Checking Node.js...
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

:: Check pnpm
echo [2/7] Checking pnpm...
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

:: Install dependencies
echo [3/7] Installing dependencies...
call pnpm install --frozen-lockfile
if errorlevel 1 (
    echo [ERROR] pnpm install failed
    exit /b 1
)
echo [OK] Dependencies installed

:: Build backend
echo [4/7] Building backend...
call pnpm run build:backend
if errorlevel 1 (
    echo [ERROR] Backend build failed
    exit /b 1
)
echo [OK] Backend built

:: Build frontend
echo [5/7] Building frontend...
call pnpm run build:ui
if errorlevel 1 (
    echo [ERROR] Frontend build failed
    exit /b 1
)
echo [OK] Frontend built

:: Generate manifest
echo [6/7] Generating manifest...
python app/scripts/generate_manifest.py
if errorlevel 1 (
    echo [WARNING] Manifest generation failed
) else (
    echo [OK] Manifest generated
)

:: Verify
echo [7/7] Running verification...
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
