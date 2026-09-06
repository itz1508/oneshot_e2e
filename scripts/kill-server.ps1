$targets = @('*run-pipeline-worker.js*')
$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object {
    $cmd = $_.CommandLine
    ($targets | Where-Object { $cmd -like $_ }).Count -gt 0
  }
foreach ($proc in $procs) {
  Stop-Process -Id $proc.ProcessId -Force
  Write-Output ("killed " + $proc.ProcessId)
}
if (-not $procs) { Write-Output "no worker processes found" }
