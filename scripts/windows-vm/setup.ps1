# XpieDB Windows test setup. Run ONCE in an *Administrator* PowerShell:
#   powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\xpiedb-vm\setup.ps1"
# Installs: Git, Node.js LTS, Rust (rustup) and the Visual Studio C++ Build Tools, using winget.
# Everything is logged to results\setup.log next to this file. Safe to run again.
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $here "results\setup.log"
Start-Transcript -Path $log -Force | Out-Null

function Step($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }
function Install($id, $extra = @()) {
  Step "winget install $id"
  winget install --id $id -e --accept-source-agreements --accept-package-agreements @extra
}

Step "System"
[Environment]::OSVersion.Version.ToString()
(Get-CimInstance Win32_OperatingSystem).OSArchitecture
Get-PSDrive C | Select-Object Used, Free | Format-List
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Write-Host "winget is not available. Update 'App Installer' from the Microsoft Store and run this again." -ForegroundColor Red
  Stop-Transcript | Out-Null; exit 1
}

Install "Git.Git"
Install "OpenJS.NodeJS.LTS"
Install "Rustlang.Rustup"
# The C++ build tools Rust needs on Windows (x64 and ARM64 compilers plus the Windows SDK).
Install "Microsoft.VisualStudio.2022.BuildTools" @(
  "--override",
  "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --add Microsoft.VisualStudio.Component.VC.Tools.ARM64"
)

Step "Versions (new PATH)"
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
git --version
node --version
npm --version
rustup --version
rustup default stable
rustc --version
cargo --version
Step "Done. Now start runner.ps1 in a normal (non-admin) PowerShell window."
Stop-Transcript | Out-Null
