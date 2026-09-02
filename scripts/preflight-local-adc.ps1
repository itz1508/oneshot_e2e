param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId
)

$ErrorActionPreference = "Stop"

function RootCause([string]$Message) {
    Write-Host "ROOT_CAUSE: $Message"
    exit 1
}

foreach ($cmd in @("gcloud", "node", "npm", "python", "git")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        RootCause "$cmd is not installed or not on PATH."
    }
}

Write-Host "REPO_HEAD=$(git rev-parse HEAD)"
Write-Host "NODE_VERSION=$(node --version)"
Write-Host "NPM_VERSION=$(npm --version)"
Write-Host "PYTHON_VERSION=$(python --version 2>&1)"

gcloud config set project $ProjectId | Out-Null

$adcToken = gcloud auth application-default print-access-token 2>$null
if (-not $adcToken) {
    RootCause "ADC is unavailable. Run scripts/setup-local-adc.ps1 first."
}
Remove-Variable adcToken -ErrorAction SilentlyContinue
Write-Host "ADC_AVAILABLE=true"

$enabled = gcloud services list `
    --enabled `
    --project $ProjectId `
    --filter="config.name:aiplatform.googleapis.com" `
    --format="value(config.name)"

if ($enabled -ne "aiplatform.googleapis.com") {
    RootCause "aiplatform.googleapis.com is not enabled for $ProjectId."
}
Write-Host "AIPLATFORM_API_ENABLED=true"

$env:GOOGLE_CLOUD_PROJECT = $ProjectId
$env:GOOGLE_CLOUD_LOCATION = "global"
$env:GOOGLE_GENAI_USE_VERTEXAI = "TRUE"
$env:GEMINI_DISTRIBUTION_MODEL = "gemini-3.5-flash-lite"
$env:GEMINI_RESEARCH_MODEL = "gemini-3.6-flash"
$env:GEMINI_SYNTHESIS_MODEL = "gemini-3.7-flash"

if ($env:GOOGLE_APPLICATION_CREDENTIALS) {
    Write-Host "WARNING: GOOGLE_APPLICATION_CREDENTIALS is set."
    Write-Host "Local ADC login normally does not require this variable."
}

Write-Host "GOOGLE_CLOUD_PROJECT=$env:GOOGLE_CLOUD_PROJECT"
Write-Host "GOOGLE_CLOUD_LOCATION=$env:GOOGLE_CLOUD_LOCATION"
Write-Host "GOOGLE_GENAI_USE_VERTEXAI=$env:GOOGLE_GENAI_USE_VERTEXAI"
Write-Host "MODEL_DISTRIBUTION=$env:GEMINI_DISTRIBUTION_MODEL"
Write-Host "MODEL_RESEARCH=$env:GEMINI_RESEARCH_MODEL"
Write-Host "MODEL_SYNTHESIS=$env:GEMINI_SYNTHESIS_MODEL"

Write-Host "LOCAL_ADC_PREFLIGHT=PASSED"
