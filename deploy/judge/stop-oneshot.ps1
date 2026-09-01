# ==============================================================================
# OneShot Production 1.3.0 - Stop Script (Windows PowerShell)
# ==============================================================================
[CmdletBinding()]
param()

Write-Host "[INFO] Stopping OneShot container and freeing resources..." -ForegroundColor Yellow
docker compose down
Write-Host "[OK] OneShot stopped successfully." -ForegroundColor Green
