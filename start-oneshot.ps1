# ==============================================================================
# OneShot Production 1.3.0 - Judge Quick-Start Launcher (Windows PowerShell)
# ==============================================================================
[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [string]$Port = "8787"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  OneShot Production E2E 1.3.0 - Judge Quick-Start Launcher" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Docker availability
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Docker CLI not found. Please install and start Docker Desktop." -ForegroundColor Red
    Write-Host "        Download Docker Desktop: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
    exit 1
}

# 2. Check Docker daemon responsiveness
try {
    $null = docker info 2>&1
} catch {
    Write-Host "[ERROR] Docker daemon is not running. Please start Docker Desktop and retry." -ForegroundColor Red
    exit 1
}

# 3. Generate or load local token in .env
$envFile = Join-Path $PSScriptRoot ".env"
$token = ""

if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*ONESHOT_API_TOKEN\s*=\s*(.+)$') {
            $token = $matches[1].Trim()
        }
    }
}

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "[INFO] Generating cryptographically secure local OneShot token..." -ForegroundColor Yellow
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $token = [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
    
    if (Test-Path $envFile) {
        Add-Content -Path $envFile -Value "`nONESHOT_API_TOKEN=$token"
    } else {
        Set-Content -Path $envFile -Value "ONESHOT_API_TOKEN=$token`nONESHOT_BIND_HOST=0.0.0.0`nPORT=$Port"
    }
}

$env:ONESHOT_API_TOKEN = $token
$env:PORT = $Port

# 4. Check for local image tarball (if distributed offline)
$tarPath = Join-Path $PSScriptRoot "oneshot-1.3.0.tar.gz"
if (Test-Path $tarPath) {
    Write-Host "[INFO] Loading offline prebuilt Docker image: oneshot:1.3.0..." -ForegroundColor Yellow
    docker load -i $tarPath
}

# 5. Start Container via Docker Compose
Write-Host "[INFO] Launching OneShot via Docker Compose..." -ForegroundColor Yellow
docker compose up -d

# 6. Wait for container healthcheck
$url = "http://localhost:$Port"
Write-Host "[INFO] Waiting for OneShot container to reach healthy status..." -NoNewline

$maxAttempts = 30
$healthy = $false
for ($i = 1; $i -le $maxAttempts; $i++) {
    Start-Sleep -Seconds 1
    Write-Host "." -NoNewline
    try {
        $headers = @{ "Authorization" = "Bearer $token" }
        $resp = Invoke-RestMethod -Uri "$url/api/health" -Headers $headers -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($resp.status -eq "ok") {
            $healthy = $true
            break
        }
    } catch {
        # continue waiting
    }
}
Write-Host ""

if (-not $healthy) {
    Write-Host "[WARNING] Healthcheck timed out. Checking container logs:" -ForegroundColor Yellow
    docker compose logs --tail 20
}

# 7. Print Completion Banner
Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Write-Host "  OneShot Platform is Running and Ready for Evaluation!" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  IDE URL:      " -NoNewline
Write-Host "$url" -ForegroundColor Cyan
Write-Host "  Access Token: " -NoNewline
Write-Host "$token" -ForegroundColor Yellow
Write-Host ""
Write-Host "  * The token has been saved to your local .env file." -ForegroundColor Gray
Write-Host "  * To stop the container, run: .\stop-oneshot.ps1 (or docker compose down)" -ForegroundColor Gray
Write-Host "=================================================================" -ForegroundColor Green
Write-Host ""

# 8. Open browser
if (-not $NoBrowser) {
    Write-Host "[INFO] Opening $url in default browser..." -ForegroundColor Cyan
    Start-Process $url
}
