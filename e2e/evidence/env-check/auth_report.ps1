$ErrorActionPreference = 'SilentlyContinue'
$out = @()

# Codex CLI auth state
$codexAuth = "$env:USERPROFILE\.codex\auth.json"
if (Test-Path $codexAuth) {
  $j = Get-Content $codexAuth -Raw | ConvertFrom-Json
  $out += "CODEX_AUTH=present"
  $out += "CODEX_KEYS=" + (($j.PSObject.Properties.Name | Sort-Object) -join ",")
} else { $out += "CODEX_AUTH=absent" }

# Mistral key presence (from HKCU env; do not print value)
$str = (Get-ItemProperty 'HKCU:\Environment').MISTRAL_API_KEY
if ($str) {
  $prefix = $str.Substring(0, [Math]::Min(6, $str.Length))
  $out += "MISTRAL_KEY=present prefix=$prefix length=$($str.Length)"
  # live free-tier validation
  try {
    $r = Invoke-RestMethod -Uri 'https://api.mistral.ai/v1/models' -Headers @{Authorization="Bearer $str"} -TimeoutSec 20
    $out += "MISTRAL_MODELS_HTTP=OK model_count=" + $r.data.Count
  } catch {
    $out += "MISTRAL_MODELS_HTTP=FAIL " + $_.Exception.Message
  }
} else { $out += "MISTRAL_KEY=absent" }

$out | Out-File d:\oneshot_e2e\e2e-evidence\env-check\llm-auth-report.txt -Encoding utf8
Write-Output "written"
