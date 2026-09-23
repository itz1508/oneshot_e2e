@echo off
echo OneShot Setup (Windows)
echo ======================

:: Check Node.js
echo [1/7] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found
    echo Please install Node.js >= 24.13.0 from https://nodejs.org/
    exit /b 1
)
for /f "tokens=2 delims=v" %%a in ('node --version') do set NODE_VER=%%a
for /f "tokens=1 delims=." %%a in ("%NODE_VER%") do set NODE_MAJOR=%%a
if %NODE_MAJOR% LSS 24 (
    echo [ERROR] Node.js version %NODE_VER% is too old
    echo Please install Node.js >= 24.13.0
    exit /b 1
)
echo [OK] Node.js %NODE_VER%

:: Check npm
echo [2/7] Checking npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found
    exit /b 1
)
for /f "tokens=1 delims=." %%a in ('npm --version') do set NPM_MAJOR=%%a
if %NPM_MAJOR% LSS 11 (
    echo [WARNING] npm version may be too old
)
echo [OK] npm found

:: Install dependencies
echo [3/7] Installing dependencies...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed
    exit /b 1
)
echo [OK] Dependencies installed

:: Build backend
echo [4/7] Building backend...
call npm run build:backend
if errorlevel 1 (
    echo [ERROR] Backend build failed
    exit /b 1
)
echo [OK] Backend built

:: Build frontend
echo [5/7] Building frontend...
call npm run build:ui
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
echo Start server: npm start
echo.
echo Open browser: http://localhost:8080
echo.
