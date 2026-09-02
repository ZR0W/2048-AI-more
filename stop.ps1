# Stops the demo server started by start.ps1, using the PID recorded in
# pid.txt instead of hunting for the port/PID by hand.
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $repoRoot "pid.txt"

if (-not (Test-Path $pidFile)) {
  Write-Error "pid.txt not found - is the server running? (start it with start.ps1)"
  exit 1
}

$serverPid = Get-Content $pidFile
if (Get-Process -Id $serverPid -ErrorAction SilentlyContinue) {
  Stop-Process -Id $serverPid -Force
  Write-Output "Stopped server (PID $serverPid)"
} else {
  Write-Output "No process with PID $serverPid was running (stale pid.txt)"
}

Remove-Item $pidFile
