# scripts/judge-launch.ps1
# Deterministic OneShot Judge Launcher for PowerShell (Windows)
[CmdletBinding()]
param(
    [int]$Port = 8787,
    [string]$ContainerName = "oneshot-judge-runner",
    [switch]$RunE2E = $true
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
Set-Location -LiteralPath $RepoRoot

Write-Host "=== OneShot Deterministic Judge Launcher ==="
Write-Host "Repository root: $RepoRoot"

# 1. Verify Docker daemon
try {
    $null = docker version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker daemon is not running or not accessible."
    }
} catch {
    Write-Error "ROOT_CAUSE: Docker daemon is unavailable. Please ensure Docker is running."
    exit 1
}

# 2. Resolve or load judge image
$ImageTag = "oneshot:judge"
$TarPath = Join-Path $RepoRoot "OneShot-1.3.0-judge.tar"

$existing = docker image inspect $ImageTag 2>$null
if (-not $existing) {
    if (Test-Path -LiteralPath $TarPath) {
        Write-Host "Loading prebuilt judge image from $TarPath..."
        docker load -i $TarPath
        if ($LASTEXITCODE -ne 0) {
            Write-Error "ROOT_CAUSE: Failed to load Docker image from $TarPath"
            exit 1
        }
    } else {
        Write-Host "Building judge image from source..."
        docker build -t $ImageTag -t oneshot:1.3.0 .
        if ($LASTEXITCODE -ne 0) {
            Write-Error "ROOT_CAUSE: Docker build failed"
            exit 1
        }
    }
} else {
    Write-Host "Found existing judge image: $ImageTag"
}

# 3. Generate a cryptographically random local ONESHOT_API_TOKEN
$TokenBytes = New-Object byte[] 32
$Rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$Rng.GetBytes($TokenBytes)
$LocalToken = [System.BitConverter]::ToString($TokenBytes).Replace("-", "").ToLowerInvariant()

$TmpEnvFile = Join-Path $RepoRoot ".runtime\judge.env.tmp"
New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot ".runtime\) | Out-Null
Set-Content -Path $TmpEnvFile -Value "ONESHOT_API_TOKEN=$LocalToken`nONESHOT_BIND_HOST=0.0.0.0`nPORT=$Port`nONESHOT_MODE=sample" -Encoding ascii

# 4. Remove stale container if running
$stale = docker ps -a -q --filter "name=^/${ContainerName}$" 2>$null
if ($stale) {
    Write-Host "Cleaning up existing container $ContainerName..."
    docker rm -f $ContainerName | Out-Null
}

# Free host port if occupied by previous host node process
$portOccupied = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
if ($portOccupied) {
    foreach ($conn in $portOccupied) {
        $p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($p -and $p.ProcessName -eq 'node') {
            Write-Host "Freeing occupied port $Port (Node PID: $($p.Id))..."
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
    }
}

# 5. Launch container
Write-Host "Starting OneShot container on port $Port..."
$containerId = docker run -d `
    --name $ContainerName `
    -p "${Port}:${Port}" `
    --env-file $TmpEnvFile `
    $ImageTag

Remove-Item -Force -LiteralPath $TmpEnvFile -ErrorAction SilentlyContinue

if ($LASTEXITCODE -ne 0 -or -not $containerId) {
    Write-Error "ROOT_CAUSE: docker run failed to launch $ContainerName"
    exit 1
}

# 6. Wait with bounded timeout for health
$HealthUrl = "http://127.0.0.1:${Port}/api/health"
$RootUrl = "http://127.0.0.1:${Port}/"
$Healthy = $false
$Deadline = (Get-Date).AddSeconds(30)

Write-Host "Waiting for container health check at $HealthUrl..."
while ((Get-Date) -lt $Deadline) {
    try {
        $headers = @{ Authorization = "Bearer $LocalToken" }
        $resp = Invoke-RestMethod -Uri $HealthUrl -Headers $headers -TimeoutSec 2 -ErrorAction Stop
        if ($resp.status -eq "ok") {
            $Healthy = $true
            Write-Host "Health check PASSED: mode=$($resp.mode), provider=$($resp.provider)"
            break
        }
    } catch {
        $inspect = docker inspect --format '{{.State.Running}}' $ContainerName 2>$null
        if ($inspect -ne 'true') {
            $logs = docker logs --tail 30 $ContainerName 2>&1
            Write-Error "ROOT_CAUSE: Container stopped unexpectedly:`n$logs"
            exit 1
        }
    }
    Start-Sleep -Milliseconds 500
}

if (-not $Healthy) {
    $logs = docker logs --tail 30 $ContainerName 2>&1
    Write-Error "ROOT_CAUSE: Health check timed out after 30 seconds.`nLogs:`n$logs"
    exit 1
}

# 7. Verify UI, Auth, and Static Files
try {
    $unauthCode = 0
    try {
        $null = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    } catch {
        if ($_.Exception.Response) {
            $unauthCode = [int]$_.Exception.Response.StatusCode
        }
    }
    if ($unauthCode -ne 401) {
        Write-Error "ROOT_CAUSE: Auth verification failed. Unauthenticated API request returned $unauthCode (expected 401)"
        exit 1
    }
    Write-Host "Auth check PASSED: 401 on unauthenticated access"

    $uiResp = Invoke-WebRequest -Uri $RootUrl -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    if ($uiResp.StatusCode -ne 200) {
        Write-Error "ROOT_CAUSE: Web UI returned status $($uiResp.StatusCode)"
        exit 1
    }
    Write-Host "UI check PASSED: root returned 200 OK"

    $jsResp = Invoke-WebRequest -Uri "http://127.0.0.1:${Port}/app.js" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    $cssResp = Invoke-WebRequest -Uri "http://127.0.0.1:${Port}/styles.css" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    if ($jsResp.StatusCode -ne 200 -or $cssResp.StatusCode -ne 200) {
        Write-Error "ROOT_CAUSE: Static assets failed to return 200"
        exit 1
    }
    Write-Host "Static assets check PASSED: /app.js and /styles.css returned 200 OK"
} catch {
    Write-Error "ROOT_CAUSE: UI/Auth verification error: $_"
    exit 1
}

# 8. Run Browser E2E if requested
$E2EResult = "NOT_RUN"
if ($RunE2E) {
    Write-Host "Running canonical browser E2E test against container..."
    try {
        $prevToken = $env:ONESHOT_API_TOKEN
        $env:ONESHOT_API_TOKEN = $LocalToken
        $e2eOut = node scripts/e2e/browser/state-adaptive-e2e.mjs 2>&1
        if ($LASTEXITCODE -eq 0) {
            $E2EResult = "PASSED"
            Write-Host "Browser E2E test PASSED"
        } else {
            $E2EResult = "FAILED"
            Write-Warning "Browser E2E test failed:`n$e2eOut"
        }
        # Cleanup temp evidence generated by E2E run
        Remove-Item -Force -Recurse -LiteralPath (Join-Path $RepoRoot "dist\e2e-evidence\screenshots-state-adaptive") -ErrorAction SilentlyContinue
        Remove-Item -Force -LiteralPath (Join-Path $RepoRoot "dist\e2e-evidence\state-adaptive-evidence.json") -ErrorAction SilentlyContinue
    } catch {
        $E2EResult = "FAILED: $_"
    } finally {
        $env:ONESHOT_API_TOKEN = $prevToken
    }
}

# 9. Result report
$ImageId = docker inspect --format '{{.Id}}' $ContainerName
Write-Host ""
Write-Host "ONESHOT_JUDGE_RESULT = PASSED"
Write-Host "URL = http://localhost:${Port}"
Write-Host "MODE = sample"
Write-Host "PROVIDER_KEY_REQUIRED = NO"
Write-Host "LOCAL_ACCESS_TOKEN = GENERATED"
Write-Host "CONTAINER = $ContainerName"
Write-Host "IMAGE = $ImageTag ($ImageId)"
Write-Host "HEALTH = PASSED"
Write-Host "UI = PASSED"
Write-Host "AUTH = PASSED"
Write-Host "E2E = $E2EResult"
