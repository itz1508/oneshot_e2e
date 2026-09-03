$targets = Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='cmd.exe'" |
  Where-Object { $_.CommandLine -match 'gemini_probe|gemini\.js' }
foreach ($t in $targets) {
  Write-Output ("killing " + $t.ProcessId + " " + $t.Name)
  Stop-Process -Id $t.ProcessId -Force -ErrorAction SilentlyContinue
}
Write-Output "cleanup done"
