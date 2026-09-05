param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId,

    [string]$ResearchProvider = "adk_gemma2",

    [int]$Port = 8787
)

$ErrorActionPreference = "Stop"

function RootCause([string]$Message) {
    Write-Host "ROOT_CAUSE: $Message"
    exit 1
}

& "$PSScriptRoot\preflight-local-adc.ps1" -ProjectId $ProjectId
if ($LASTEXITCODE -ne 0) {
    RootCause "local ADC preflight failed."
}

$env:GOOGLE_CLOUD_PROJECT = $ProjectId
$env:GOOGLE_CLOUD_LOCATION = "global"
$env:GOOGLE_GENAI_USE_VERTEXAI = "TRUE"

$env:GEMINI_DISTRIBUTION_MODEL = "gemini-3.5-flash-lite"
$env:GEMINI_RESEARCH_MODEL = "gemini-3.6-flash"
$env:GEMINI_SYNTHESIS_MODEL = "gemini-3.7-flash"

$env:ONESHOT_MODE = "production"
$env:ONESHOT_RESEARCH_PROVIDER = $ResearchProvider
$env:ONESHOT_BIND_HOST = "127.0.0.1"
$env:PORT = "$Port"

python "$PSScriptRoot\verify-gemini-models.py"
if ($LASTEXITCODE -ne 0) {
    RootCause "live three-Gemini Vertex probe failed."
}

npm run build:backend
if ($LASTEXITCODE -ne 0) {
    RootCause "backend build failed."
}

Write-Host "STARTING_ONESHOT_LOCAL=true"
Write-Host "URL=http://127.0.0.1:$Port"
Write-Host "PROVIDER=$ResearchProvider"
node dist/backend/index.js
