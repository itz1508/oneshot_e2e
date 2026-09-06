# scripts/install-e2e.ps1
# All-In-One End-to-End Installation, Build, Verification, and Launch for Windows
[CmdletBinding()]
param(
    [switch]$Docker,
    [switch]$VerifyOnly,
    [switch]$Launch = $true,
    [int]$Port = 8787,
    [string]$Mode = "sample"
)

$ErrorActionPreference = "Continue"
if (Test-Path Variable:PSNativeCommandUseErrorActionPreference) {
    $PSNativeCommandUseErrorActionPreference = $false
}
if (-not $env:NODE_OPTIONS) {
    $env:NODE_OPTIONS = "--max-old-space-size=2048"
}
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
Set-Location -LiteralPath $RepoRoot

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " OneShot Production E2E - All-In-One Installer & Launcher" -ForegroundColor Cyan
Write-Host " Target Root: $RepoRoot" -ForegroundColor Cyan
Write-Host " Target Mode: $(if ($Docker) { 'Docker' } else { 'Native Windows' })" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

function Fail([string]$Message) {
    Write-Host ""
    Write-Host "ROOT_CAUSE: $Message" -ForegroundColor Red
    exit 1
}

# -----------------------------------------------------------------------------
# DOCKER INSTALLATION PATH
# -----------------------------------------------------------------------------
if ($Docker) {
    Write-Host "[1/4] Checking Docker daemon..." -ForegroundColor Yellow
    try {
        $null = docker version 2>&1
        if ($LASTEXITCODE -ne 0) { throw "Docker unavailable" }
        Write-Host "      Docker daemon is running." -ForegroundColor Green
    } catch {
        Fail "Docker daemon is not running or accessible. Start Docker Desktop and retry."
    }

    Write-Host "[2/4] Building Docker container image (oneshot:local)..." -ForegroundColor Yellow
    docker build -t oneshot:local .
    if ($LASTEXITCODE -ne 0) {
        Fail "Docker build failed."
    }
    Write-Host "      Docker image built successfully." -ForegroundColor Green

    # Free port if occupied by existing container
    $portContainer = docker ps -q --filter "publish=$Port" 2>$null
    if ($portContainer) {
        Write-Host "      Freeing port $Port occupied by existing container..."
        docker rm -f $portContainer | Out-Null
    }

    $Existing = docker ps -a -q --filter "name=^/oneshot-local$" 2>$null
    if ($Existing) {
        Write-Host "      Cleaning up existing container 'oneshot-local'..."
        docker rm -f oneshot-local | Out-Null
    }

    $Token = [System.Guid]::NewGuid().ToString("N")
    Write-Host "[3/4] Launching container and verifying health..." -ForegroundColor Yellow
    $containerId = docker run -d `
        --name oneshot-local `
        -p "${Port}:${Port}" `
        -e ONESHOT_MODE=$Mode `
        -e ONESHOT_BIND_HOST=0.0.0.0 `
        -e PORT=$Port `
        -e ONESHOT_API_TOKEN=$Token `
        -e API_RATE_LIMIT_WINDOW_MS=1000 `
        -e API_RATE_LIMIT_MAX=10000 `
        -e ONESHOT_QUEUE_READY_TIMEOUT=1000 `
        oneshot:local

    if ($LASTEXITCODE -ne 0 -or -not $containerId) {
        Fail "Failed to launch oneshot-local container."
    }

    $HealthUrl = "http://127.0.0.1:${Port}/api/health"
    $Healthy = $false
    $Deadline = (Get-Date).AddSeconds(60)
    Write-Host "      Waiting for container health check at $HealthUrl..."
    while ((Get-Date) -lt $Deadline) {
        try {
            $headers = @{ Authorization = "Bearer $Token" }
            $resp = Invoke-RestMethod -Uri $HealthUrl -Headers $headers -TimeoutSec 2 -ErrorAction Stop
            if ($resp.status -eq "ok" -or $resp.workflow -eq "oneshot-canonical-workflow") {
                $Healthy = $true
                Write-Host "      Health check PASSED: mode=$($resp.mode), provider=$($resp.provider)" -ForegroundColor Green
                break
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    }

    if (-not $Healthy) {
        $logs = docker logs --tail 30 oneshot-local 2>&1
        Fail "Container health check timed out.`n$logs"
    }

    # Verify Auth Gate & UI
    $unauthCode = 0
    try {
        $null = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    } catch {
        if ($_.Exception.Response) { $unauthCode = [int]$_.Exception.Response.StatusCode }
    }
    if ($unauthCode -ne 401) {
        Fail "Auth gate failed: expected 401 on unauthenticated access, observed $unauthCode"
    }
    Write-Host "      Auth gate check PASSED (401 on unauthenticated access)." -ForegroundColor Green

    $uiResp = Invoke-WebRequest -Uri "http://127.0.0.1:${Port}/" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    if ($uiResp.StatusCode -ne 200) {
        Fail "Web UI check failed: root returned $($uiResp.StatusCode)"
    }
    Write-Host "      Web UI check PASSED (200 OK)." -ForegroundColor Green

    if ($VerifyOnly) {
        docker rm -f oneshot-local | Out-Null
        Write-Host ""
        Write-Host "ONESHOT_INSTALL_E2E = PASSED (Docker Verify Only)" -ForegroundColor Green
        exit 0
    }

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host " ONESHOT_INSTALL_E2E = PASSED" -ForegroundColor Green
    Write-Host " URL       = http://localhost:$Port" -ForegroundColor Green
    Write-Host " MODE      = $Mode" -ForegroundColor Green
    Write-Host " CONTAINER = oneshot-local" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    exit 0
}

# -----------------------------------------------------------------------------
# NATIVE WINDOWS INSTALLATION PATH
# -----------------------------------------------------------------------------

# Step 1: Check Prerequisites
Write-Host "[1/5] Checking prerequisites (Node.js, npm, Python)..." -ForegroundColor Yellow

# Node.js
try {
    $nodeVer = (node --version).Trim()
    Write-Host "      Node.js: $nodeVer ... OK" -ForegroundColor Green
} catch {
    Fail "Node.js is not installed or not in PATH. Please install Node.js 20+ from https://nodejs.org"
}

# npm
try {
    $npmVer = (npm --version).Trim()
    Write-Host "      npm: $npmVer ... OK" -ForegroundColor Green
} catch {
    Fail "npm is not installed or not in PATH."
}

# Python
$PythonExe = ""
if (Get-Command python -ErrorAction SilentlyContinue) {
    $PythonExe = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $PythonExe = "py -3"
} else {
    Fail "Python 3.11+ is not installed or not in PATH. Install from https://www.python.org"
}

$pyVer = & $PythonExe -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"
Write-Host "      Python: $pyVer ... OK" -ForegroundColor Green

# Step 2: Install Dependencies
Write-Host "[2/5] Installing dependencies (Node.js & Python)..." -ForegroundColor Yellow

# Root Node modules
Write-Host "      Installing root Node dependencies..."
cmd.exe /c "npm ci --no-audit --no-fund --loglevel=error"
if ($LASTEXITCODE -ne 0) {
    Write-Host "      Retrying with npm install..."
    cmd.exe /c "npm install --no-audit --no-fund --loglevel=error"
    if ($LASTEXITCODE -ne 0) { Fail "Root npm dependency installation failed." }
}

# Web App Node modules
Write-Host "      Installing app/web Node dependencies..."
cmd.exe /c "npm --prefix app/web ci --no-audit --no-fund --loglevel=error"
if ($LASTEXITCODE -ne 0) {
    cmd.exe /c "npm --prefix app/web install --no-audit --no-fund --loglevel=error"
    if ($LASTEXITCODE -ne 0) { Fail "app/web dependency installation failed." }
}

# Python Virtual Environment
$VenvPath = Join-Path $RepoRoot ".venv"
$VenvPython = Join-Path $VenvPath "Scripts\python.exe"

if (-not (Test-Path -LiteralPath $VenvPython)) {
    Write-Host "      Creating Python virtual environment in .venv..."
    & $PythonExe -m venv $VenvPath
    if ($LASTEXITCODE -ne 0) { Fail "Failed to create Python virtual environment." }
}

Write-Host "      Installing Python requirements..."
& $VenvPython -m pip install --quiet --upgrade pip
& $VenvPython -m pip install --quiet -r (Join-Path $RepoRoot "app\requirements\base.txt") -r (Join-Path $RepoRoot "app\requirements\workspace-api.txt")
if ($LASTEXITCODE -ne 0) { Fail "Python package installation failed." }
Write-Host "      All dependencies installed successfully." -ForegroundColor Green

# Step 3: Build
Write-Host "[3/5] Building project (TypeScript backend & React Web IDE)..." -ForegroundColor Yellow
cmd.exe /c "npm run build"
if ($LASTEXITCODE -ne 0) { Fail "Build failed (TypeScript or Web IDE compilation error)." }
Write-Host "      Build completed successfully." -ForegroundColor Green

# Step 4: Verify E2E
Write-Host "[4/5] Running canonical verification suite..." -ForegroundColor Yellow
Write-Host "      Checking repository manifest SHA-256 integrity..."
& $VenvPython app/scripts/verify_manifest.py
if ($LASTEXITCODE -ne 0) { Fail "Manifest verification failed." }
Write-Host "      Manifest verified: MANIFEST_VERIFIED." -ForegroundColor Green

Write-Host "      Running test matrix and contracts..."
& $VenvPython app/scripts/verify_all.py
if ($LASTEXITCODE -ne 0) { Fail "Verification suite failed." }
Write-Host "      Verification passed: ONESHOT_PRODUCTION_E2E_VERIFIED." -ForegroundColor Green

Write-Host "      Verifying canonical cryptographic workflow hash proof..."
$hashOutput = & node -e "import('./dist/backend/tests/ts/harness.js').then(async m => { const h = await m.harness('install-verify'); const runId = 'canonical-verify'; h.runs.create(runId); const res = await h.runtime.run(runId, m.prompt(runId)); console.log(JSON.stringify(res.hash_proof)); process.exit(0); })" 2>&1
$hashJson = ($hashOutput | Where-Object { $_ -match '"canonicalization_id"' }) | Select-Object -First 1
if (-not $hashJson) { Fail "Canonical cryptographic hash verification failed.`n$hashOutput" }
$hashObj = $hashJson | ConvertFrom-Json
if (-not $hashObj.equal) { Fail "Canonical hash equality mismatch: created_hash != recomputed_hash" }
$CanonicalHash = $hashObj.created_hash
Write-Host "      Cryptographic Hash: $CanonicalHash (equal=$($hashObj.equal))" -ForegroundColor Green

if ($VerifyOnly) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host " ONESHOT_INSTALL_E2E = PASSED (Native Verify Only)" -ForegroundColor Green
    Write-Host " CANONICAL_HASH      = $CanonicalHash" -ForegroundColor Green
    Write-Host " HASH_PROOF_EQUAL    = true (SHA-256 / RFC 8785 JCS)" -ForegroundColor Green
    Write-Host " MANIFEST_STATUS     = MANIFEST_VERIFIED" -ForegroundColor Green
    Write-Host " TEST_SUITE          = ONESHOT_PRODUCTION_E2E_VERIFIED" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    exit 0
}

# Step 5: Launch
Write-Host "[5/5] Preparing to launch OneShot..." -ForegroundColor Yellow
$env:ONESHOT_MODE = $Mode
$env:PORT = "$Port"
$env:ONESHOT_BIND_HOST = "127.0.0.1"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " ONESHOT_INSTALL_E2E = PASSED" -ForegroundColor Green
Write-Host " CANONICAL_HASH      = $CanonicalHash" -ForegroundColor Green
Write-Host " HASH_PROOF_EQUAL    = true (SHA-256 / RFC 8785 JCS)" -ForegroundColor Green
Write-Host " MANIFEST_STATUS     = MANIFEST_VERIFIED" -ForegroundColor Green
Write-Host " TEST_SUITE          = ONESHOT_PRODUCTION_E2E_VERIFIED" -ForegroundColor Green
Write-Host " URL                 = http://localhost:$Port" -ForegroundColor Green
Write-Host " STATUS              = READY" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

if ($Launch) {
    Write-Host "Starting OneShot server (Ctrl+C to stop)..." -ForegroundColor Cyan
    node dist/backend/index.js
}
