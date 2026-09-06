# scripts/installation/windows/install-e2e.ps1
[CmdletBinding()]
param(
    [switch]$Docker,
    [switch]$VerifyOnly,
    [switch]$Launch = $true,
    [int]$Port = 8787,
    [string]$Mode = "sample"
)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootScript = Join-Path $ScriptDir "..\..\install-e2e.ps1"
& $RootScript @PSBoundParameters
