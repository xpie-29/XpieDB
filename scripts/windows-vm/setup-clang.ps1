# Adds the "C++ Clang Compiler for Windows" component to the Visual Studio Build Tools (needed to build
# the aws-lc-sys library on Windows ARM). Run in an *Administrator* PowerShell. Logs to results\setup-clang.log.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Transcript -Path (Join-Path $here "results\setup-clang.log") -Force | Out-Null
$installer = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\setup.exe"
$path = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools"
if (-not (Test-Path $installer)) { "Installer not found at $installer"; Stop-Transcript | Out-Null; exit 1 }
$p = Start-Process -FilePath $installer -Wait -PassThru -ArgumentList @(
  "modify", "--installPath", "`"$path`"",
  "--add", "Microsoft.VisualStudio.Component.VC.Llvm.Clang",
  "--add", "Microsoft.VisualStudio.Component.VC.Llvm.ClangToolset",
  "--quiet", "--norestart")
"installer exit code: $($p.ExitCode)  (0 or 3010 = success)"
Get-ChildItem "$path\VC\Tools\Llvm" -Recurse -Filter clang-cl.exe -ErrorAction SilentlyContinue | Select-Object -First 4 FullName
"Done. clang"
Stop-Transcript | Out-Null
