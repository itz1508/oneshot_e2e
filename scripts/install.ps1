# OneShot E2E — Automated Windows 1-Line Installer & Launcher
[CmdletBinding()]
param (
    [string]$InstallDir = (Join-Path $HOME "oneshot_e2e"),
    [switch]$Force,
    [switch]$Quiet,
    [switch]$Yes
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "         OneShot E2E — Automated 1-Click Installer          " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Require Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] git is required to clone and install OneShot." -ForegroundColor Red
    Write-Host "        Please install Git from https://git-scm.com/ and re-run." -ForegroundColor Red
    exit 1
}

# Confirmation hook / popup (bypassed if -Force, -Quiet, -Yes, or CI environment)
if (-not ($Force -or $Quiet -or $Yes -or $env:CI -eq "true" -or $env:DEBIAN_FRONTEND -eq "noninteractive")) {
    $installPrompt = "Do you want to install and launch OneShot E2E at '$InstallDir'?"
    $shouldPromptGui = [Environment]::UserInteractive -and [System.IntPtr]::Size -gt 0 -and (-not [Console]::IsInputRedirected)
    if ($shouldPromptGui) {
        try {
            Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
            $msgResult = [System.Windows.MessageBox]::Show($installPrompt, "OneShot Installation", [System.Windows.MessageBoxButton]::YesNo, [System.Windows.MessageBoxImage]::Question)
            if ($msgResult -ne [System.Windows.MessageBoxResult]::Yes) {
                Write-Host "Installation cancelled by user." -ForegroundColor Yellow
                exit 0
            }
        } catch {
            $confirm = Read-Host "$installPrompt [Y/n]"
            if ($confirm -and $confirm.Trim().ToLower() -notmatch '^(y|yes)$') {
                Write-Host "Installation cancelled by user." -ForegroundColor Yellow
                exit 0
            }
        }
    }
}

# 2. Clone repository via Git (clean clone, no zip unpacking)
if (-not (Test-Path $InstallDir)) {
    Write-Host "[1/2] Cloning repository via git into $InstallDir..." -ForegroundColor Green
    & git clone https://github.com/itz1508/oneshot_e2e.git $InstallDir
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to clone repository." -ForegroundColor Red
        exit $LASTEXITCODE
    }
} else {
    Write-Host "[1/2] Using existing directory: $InstallDir" -ForegroundColor Green
}

Set-Location -Path $InstallDir

Write-Host ""
Write-Host "📍 Project Folder: $(Get-Location)" -ForegroundColor Cyan
Write-Host "🌐 Launching OneShot console..." -ForegroundColor Cyan
Write-Host ""
$startScript = Join-Path $InstallDir "scripts\start-web.ps1"
if (Test-Path $startScript) {
    & $startScript
} elseif ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot "start-web.ps1"))) {
    & (Join-Path $PSScriptRoot "start-web.ps1")
} else {
    & .\scripts\start-web.ps1
}
