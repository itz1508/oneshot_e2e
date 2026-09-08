<#
.SYNOPSIS
    OneShot v3 Web Application & Backend Launcher

.DESCRIPTION
    Starts the full OneShot production runtime and serves the Next.js static
    web application on http://localhost:8787 with live backend bindings.

.PARAMETER Port
    Port to bind the HTTP server on (default: 8787).

.PARAMETER Rebuild
    Force a re-compilation of TypeScript backend and Next.js frontend before launching.

.PARAMETER NoBrowser
    Do not automatically open the web application in the default browser.

.PARAMETER Sample
    Launch in deterministic sample mode (no live external API keys required).

.EXAMPLE
    .\start-web.ps1
    Starts the application on http://localhost:8787 and opens the browser.

.EXAMPLE
    .\start-web.ps1 -Rebuild
    Rebuilds frontend and backend, then starts the server.

.EXAMPLE
    .\start-web.ps1 -Port 9000 -NoBrowser
    Starts on custom port 9000 without opening browser automatically.
#>

[CmdletBinding()]
param (
    [int]$Port = 8787,
    [switch]$Rebuild,
    [switch]$NoBrowser,
    [switch]$Sample
)

$ErrorActionPreference = "Stop"
$ScriptRoot = $PSScriptRoot
Set-Location -Path $ScriptRoot

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "         OneShot v3 - Web Application Launcher             " -ForegroundColor Cyan -NoNewline
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verify Node.js
try {
    $nodeVersion = & node -v
    Write-Host "[1/5] Node.js runtime detected: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js was not found on PATH. Please install Node.js 20+." -ForegroundColor Red
    exit 1
}

# 2. Add Python Virtualenv if present
$venvScripts = Join-Path $ScriptRoot ".venv\Scripts"
if (Test-Path $venvScripts) {
    if ($env:PATH -notlike "*$venvScripts*") {
        $env:PATH = "$venvScripts;$env:PATH"
    }
    Write-Host "[2/5] Python virtual environment active (.venv)" -ForegroundColor Green
} else {
    Write-Host "[2/5] Python virtual environment: using system python" -ForegroundColor Yellow
}

# 3. Check / Run Build
$backendDist = Join-Path $ScriptRoot "dist\backend\index.js"
$frontendDist = Join-Path $ScriptRoot "app\web\dist\index.html"
$needsBuild = $Rebuild -or (-not (Test-Path $backendDist)) -or (-not (Test-Path $frontendDist))

if ($needsBuild) {
    Write-Host "[3/5] Compiling backend and exporting Next.js frontend (npm run build)..." -ForegroundColor Yellow
    $env:NODE_OPTIONS = "--max-old-space-size=2048"
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Build failed with exit code $LASTEXITCODE." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "      Build complete." -ForegroundColor Green
} else {
    Write-Host "[3/5] Build artifacts up-to-date (dist/ and app/web/dist/ ready)" -ForegroundColor Green
}

# 4. Check Port Availability
$portInUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
    $pidToKill = $portInUse.OwningProcess | Select-Object -Unique
    Write-Host "[4/5] Port $Port is currently in use by process PID $pidToKill." -ForegroundColor Yellow
    
    # Check if it's a node process
    $proc = Get-Process -Id $pidToKill -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq "node") {
        Write-Host "      Stopping lingering node process (PID $pidToKill)..." -ForegroundColor Yellow
        Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 800
        Write-Host "      Port $Port released." -ForegroundColor Green
    } else {
        Write-Host "[WARNING] Process $pidToKill ($($proc.ProcessName)) is using port $Port. Continuing anyway..." -ForegroundColor Yellow
    }
} else {
    Write-Host "[4/5] Port $Port is available" -ForegroundColor Green
}

# 5. Environment & Execution Mode
$envFile = Join-Path $ScriptRoot "app\env\.env"
if (-not (Test-Path $envFile)) {
    Write-Host "[WARNING] $envFile not found. Using default environment." -ForegroundColor Yellow
}

$env:PORT = "$Port"
if ($Sample) {
    $env:ONESHOT_MODE = "sample"
    Write-Host "[5/5] Launching in deterministic SAMPLE mode..." -ForegroundColor Cyan
} else {
    Write-Host "[5/5] Launching in PRODUCTION mode..." -ForegroundColor Cyan
}

$url = "http://localhost:$Port"
Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  OneShot Console : " -NoNewline; Write-Host $url -ForegroundColor Cyan
Write-Host "  Backend Health  : " -NoNewline; Write-Host "$url/api/health" -ForegroundColor DarkCyan
Write-Host "  Workspace API   : " -NoNewline; Write-Host "$url/v1/workspace/tree" -ForegroundColor DarkCyan
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  Press Ctrl+C at any time to stop the server.`n" -ForegroundColor DarkGray

# Asynchronously open browser when server is ready
if (-not $NoBrowser) {
    [System.Threading.Tasks.Task]::Run([Action]{
        $maxTries = 30
        $ready = $false
        for ($i = 0; $i -lt $maxTries; $i++) {
            Start-Sleep -Milliseconds 400
            try {
                $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 1 -ErrorAction SilentlyContinue
                if ($response) {
                    $ready = $true
                    break
                }
            } catch {}
        }
        if ($ready) {
            Start-Sleep -Milliseconds 200
            Start-Process $url
        }
    }) | Out-Null
}

# Start server in foreground with full interactive logging
if (Test-Path $envFile) {
    & node --env-file=$envFile dist\backend\index.js
} else {
    & node dist\backend\index.js
}
