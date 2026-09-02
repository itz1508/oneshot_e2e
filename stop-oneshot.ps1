# ==============================================================================
# OneShot Production 1.3.0 - Stop Script (Windows PowerShell)
# ==============================================================================
[CmdletBinding()]
param()

$composeFile = "docker-compose.yml"
if (Test-Path (Join-Path $PSScriptRoot "docker-compose.judge.yml")) {
    $composeFile = "docker-compose.judge.yml"
}

Write-Host "[INFO] Stopping OneShot container ($composeFile) and freeing resources..." -ForegroundColor Yellow
docker compose -f $composeFile down
Write-Host "[OK] OneShot stopped successfully." -ForegroundColor Green
