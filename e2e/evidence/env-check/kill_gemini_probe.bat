Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='cmd.exe'" |
  Select-Object ProcessId, Name, CommandLine |
  Format-List | Out-File -FilePath d:\oneshot_e2e\e2e-evidence\env-check\proc-report.txt -Encoding utf8
Write-Output "report written"
