[CmdletBinding()]
param (
    [int]$Port = 8787,
    [switch]$Rebuild,
    [switch]$NoBrowser,
    [switch]$Sample
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -Path $RepoRoot

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "         OneShot v3 - Web Application Launcher             " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verify Node.js
try {
    $nodeVersion = & node -v
    Write-Host "[1/4] Node.js runtime detected: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js was not found on PATH. Please install Node.js >= 24.21.0." -ForegroundColor Red
    exit 1
}

# 2. Check / Install Dependencies
$envPath = Join-Path $RepoRoot "app\env\.env"
$envExample = Join-Path $RepoRoot "app\env\.env.example"
if (-not (Test-Path $envPath) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envPath
}

$nodeModules = Join-Path $RepoRoot "node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Host "[2/4] Fresh repository detected. Installing dependencies (pnpm install)..." -ForegroundColor Yellow
    & pnpm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] pnpm install failed with exit code $LASTEXITCODE." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

$pythonVenv = Join-Path $RepoRoot "backend\python\.venv"
if ((-not (Test-Path $pythonVenv)) -and (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host "[2/4] Syncing Python reasoning env (uv sync)..." -ForegroundColor Yellow
    & node scripts/setup-python.mjs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[WARNING] Python env sync failed." -ForegroundColor Yellow
    }
}

# 3. Check / Run Build
$backendDist = Join-Path $RepoRoot "dist\backend\index.js"
$frontendDist = Join-Path $RepoRoot "frontend\web\dist\index.html"
$needsBuild = $Rebuild -or (-not (Test-Path $backendDist)) -or (-not (Test-Path $frontendDist))

if ($needsBuild) {
    Write-Host "[3/4] Compiling backend and exporting Next.js frontend (pnpm run build)..." -ForegroundColor Yellow
    & pnpm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Build failed with exit code $LASTEXITCODE." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "      Build complete." -ForegroundColor Green
} else {
    Write-Host "[3/4] Build artifacts up-to-date (dist/ and frontend/web/dist/ ready)" -ForegroundColor Green
}

# Occupancy must include connect probes and a wildcard bind probe: Windows lets a
# loopback bind succeed while another process holds 0.0.0.0 / :: on the same port,
# which is how a stale instance used to be mistaken for a free port.
function Test-PortOccupied([int]$candidate) {
    foreach ($address in @([System.Net.IPAddress]::Loopback, [System.Net.IPAddress]::IPv6Loopback)) {
        $client = [System.Net.Sockets.TcpClient]::new()
        try {
            $connectTask = $client.ConnectAsync($address, $candidate)
            if ($connectTask.Wait(300) -and $client.Connected) { return $true }
        } catch {
            # Nothing answers on this loopback address
        } finally {
            $client.Dispose()
        }
    }

    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $candidate)
        $listener.ExclusiveAddressUse = $true
        $listener.Start()
        return $false
    } catch [System.Net.Sockets.SocketException] {
        return $true
    } finally {
        if ($listener) { try { $listener.Stop() } catch { } }
    }
}

function Get-AvailablePort([int]$start = 8787) {
    for ($candidate = $start; $candidate -lt 65535; $candidate++) {
        if (-not (Test-PortOccupied $candidate)) { return $candidate }
    }
    Write-Host "[ERROR] No free port found between $start and 65534." -ForegroundColor Red
    exit 1
}

# 4. Port & Environment Setup
$browserSafe = $true
if (-not $PSBoundParameters.ContainsKey('Port')) {
    $Port = Get-AvailablePort 8787
} elseif (Test-PortOccupied $Port) {
    $browserSafe = $false
    Write-Host "[WARNING] Port $Port is already serving; the backend will advance to the next free port." -ForegroundColor Yellow
    Write-Host "          Use the [OneShot] Listening on ... line below for the verified URL." -ForegroundColor Yellow
}
$env:PORT = "$Port"
if ($Sample) {
    $env:ONESHOT_MODE = "sample"
    Write-Host "[4/4] Launching in deterministic SAMPLE mode..." -ForegroundColor Cyan
} else {
    Write-Host "[4/4] Launching in PRODUCTION mode..." -ForegroundColor Cyan
}

$url = "http://localhost:$Port"
Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  📍 Working Directory: $RepoRoot" -ForegroundColor Yellow
Write-Host "  🌐 Application Screen: $url" -ForegroundColor Cyan
Write-Host "  ⚡ Backend Health   : $url/api/health" -ForegroundColor DarkCyan
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  Press Ctrl+C at any time to stop the server.`n" -ForegroundColor DarkGray

# 4. Asynchronously open browser once the health payload verifies on this port
if (-not $NoBrowser -and $browserSafe) {
    [System.Threading.Tasks.Task]::Run([Action]{
        $maxTries = 30
        $opened = $false
        for ($i = 0; $i -lt $maxTries; $i++) {
            Start-Sleep -Milliseconds 400
            try {
                $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 1 -ErrorAction SilentlyContinue
                if ($response -and $response.ok -eq $true -and $response.status -eq 'healthy') {
                    Start-Sleep -Milliseconds 200
                    Start-Process $url
                    $opened = $true
                    break
                }
            } catch {}
        }
        if (-not $opened) {
            Write-Host "[WARNING] No healthy /api/health payload on $url after 12s; browser not opened." -ForegroundColor Yellow
        }
    }) | Out-Null
}

# Start production server in foreground
$envFile = Join-Path $RepoRoot "app\env\.env"
if (Test-Path $envFile) {
    & node --env-file=$envFile dist\backend\index.js
} else {
    & node dist\backend\index.js
}
