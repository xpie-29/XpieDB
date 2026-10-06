# Helpers for driving the Windows app from the runner (physical pixels; DPI aware).
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class W {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@
[void][W]::SetProcessDPIAware()
$script:Out = Join-Path $PSScriptRoot "results"
function Get-App { Get-Process xpiedb -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 }
function Focus-App { $p = Get-App; if ($p) { [void][W]::ShowWindow($p.MainWindowHandle, 9); [void][W]::SetForegroundWindow($p.MainWindowHandle); Start-Sleep -Milliseconds 400 } $p }
function App-Rect { $p = Get-App; $r = New-Object W+RECT; [void][W]::GetWindowRect($p.MainWindowHandle, [ref]$r); $r }
function Place-App($x, $y, $w, $h) { $p = Get-App; [void][W]::ShowWindow($p.MainWindowHandle, 9); [void][W]::MoveWindow($p.MainWindowHandle, $x, $y, $w, $h, $true); Start-Sleep -Milliseconds 600 }
function Shot($name) {
  $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
  $bmp.Save((Join-Path $script:Out "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
  "shot $name $($b.Width)x$($b.Height)"
}
function Click($x, $y, $double = $false) {
  [void][W]::SetCursorPos($x, $y); Start-Sleep -Milliseconds 120
  $n = if ($double) { 2 } else { 1 }
  1..$n | ForEach-Object { [W]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); [W]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 90 }
  Start-Sleep -Milliseconds 700
}
function Keys($s) { [System.Windows.Forms.SendKeys]::SendWait($s); Start-Sleep -Milliseconds 600 }
function Esc-Keys($t) { ($t -replace '([+^%~(){}\[\]])', '{$1}') }
function Scroll($x, $y, $ticks) {
  [void][W]::SetCursorPos($x, $y); Start-Sleep -Milliseconds 150
  $d = [BitConverter]::ToUInt32([BitConverter]::GetBytes([int](-120 * $ticks)), 0)
  [W]::mouse_event(0x0800, 0, 0, $d, [UIntPtr]::Zero); Start-Sleep -Milliseconds 700
}
