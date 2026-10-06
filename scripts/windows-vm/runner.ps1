# XpieDB Windows test runner. Start in a normal PowerShell window and leave it open:
#   powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\xpiedb-vm\runner.ps1"
# It runs each script that appears in the jobs folder, writes its output to results\<name>.log and its
# exit code to results\<name>.exit, then moves the script to done\. Close the window or press Ctrl+C to stop.
# Only scripts placed in this shared folder (jobs\) are run, and only while this window is open.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$jobs = Join-Path $here "jobs"; $results = Join-Path $here "results"; $done = Join-Path $here "done"
New-Item -ItemType Directory -Force $jobs, $results, $done | Out-Null
Write-Host "Runner ready. Watching $jobs  (Ctrl+C to stop)" -ForegroundColor Green
while ($true) {
  foreach ($job in Get-ChildItem $jobs -Filter *.ps1 | Sort-Object Name) {
    $name = $job.BaseName
    Write-Host ("[{0}] running {1}" -f (Get-Date -Format HH:mm:ss), $job.Name)
    $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
    $log = Join-Path $results "$name.log"
    & powershell -NoProfile -ExecutionPolicy Bypass -File $job.FullName *> $log
    Set-Content -Path (Join-Path $results "$name.exit") -Value $LASTEXITCODE
    Move-Item -Force $job.FullName (Join-Path $done $job.Name)
    Write-Host ("[{0}] finished {1} (exit {2})" -f (Get-Date -Format HH:mm:ss), $job.Name, $LASTEXITCODE)
  }
  Start-Sleep -Seconds 2
}
