# Starts the demo with Python's built-in static file server and records
# its PID to pid.txt, so stop.ps1 can shut it down without hunting for the
# port/PID by hand.
param(
  [int]$Port = 8000
)

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $repoRoot "pid.txt"

if (Test-Path $pidFile) {
  $existingPid = Get-Content $pidFile
  if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) {
    Write-Error "Server already running (PID $existingPid, see pid.txt). Run stop.ps1 first."
    exit 1
  }
}

$process = Start-Process -FilePath python -ArgumentList "-m http.server $Port" `
  -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden
$process.Id | Out-File -FilePath $pidFile -Encoding ascii

Write-Output "Started on http://localhost:$Port (PID $($process.Id), recorded in pid.txt)"
