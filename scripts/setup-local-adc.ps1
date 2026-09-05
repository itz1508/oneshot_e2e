param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId,

    [string]$ImpersonateServiceAccount = ""
)

$ErrorActionPreference = "Stop"

function RootCause([string]$Message) {
    Write-Error "ROOT_CAUSE: $Message"
    exit 1
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    RootCause "gcloud CLI is not installed or not on PATH."
}

Write-Host "PROJECT_ID=$ProjectId"
gcloud config set project $ProjectId | Out-Host

gcloud services enable aiplatform.googleapis.com --project $ProjectId | Out-Host

if ($ImpersonateServiceAccount) {
    Write-Host "ADC_MODE=service-account-impersonation"
    Write-Host "IMPERSONATED_SERVICE_ACCOUNT=$ImpersonateServiceAccount"
    gcloud auth application-default login `
        --impersonate-service-account $ImpersonateServiceAccount | Out-Host
} else {
    Write-Host "ADC_MODE=user"
    gcloud auth application-default login | Out-Host
}

gcloud auth application-default set-quota-project $ProjectId | Out-Host

$token = gcloud auth application-default print-access-token
if (-not $token) {
    RootCause "ADC did not produce an access token."
}

Write-Host "ADC_TOKEN_ACQUIRED=true"
Write-Host "ADC_SETUP=PASSED"
Write-Host "Token value intentionally not printed."
