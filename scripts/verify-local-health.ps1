param(
    [int]$Port = 8787
)

$ErrorActionPreference = "Stop"

try {
    $health = Invoke-RestMethod `
        -Method Get `
        -Uri "http://127.0.0.1:$Port/api/health"
} catch {
    Write-Host "ROOT_CAUSE: local OneShot health request failed: $($_.Exception.Message)"
    exit 1
}

$health | ConvertTo-Json -Depth 20
if ($health.status -ne "ok") {
    Write-Host "ROOT_CAUSE: local health did not return status=ok"
    exit 1
}

Write-Host "LOCAL_HEALTH=PASSED"
Write-Host "NOTE=Health does not prove live Gemini or full workflow execution."
