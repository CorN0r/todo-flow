# Screenshot using PrintWindow API (works even when screen locked)
param([string]$OutputFile = "$PSScriptRoot\..\docs\images\screenshot.png", [int]$Delay = 0)

Add-Type -AssemblyName System.Drawing

Add-Type @"
using System; using System.Runtime.InteropServices; using System.Drawing;
public class PW {
    [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr child, string cls, string title);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr GetWindowDC(IntPtr h);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h, IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr hdcDst, int x, int y, int w, int h, IntPtr hdcSrc, int xs, int ys, uint rop);
    public const uint SRCCOPY = 0x00CC0020; public const uint PW_CLIENTONLY = 0x1; public const int SW_RESTORE = 9;

    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,Rt,B; }
}
"@

if ($Delay -gt 0) { Start-Sleep -Seconds $Delay }

# Find TodoFlow window via process
$p = Get-Process -Name "todo-flow" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "TodoFlow" } | Select-Object -First 1
if (-not $p) { Write-Error "TodoFlow not found"; exit 1 }
$hWnd = $p.MainWindowHandle
if ($hWnd -eq [IntPtr]::Zero) { $p.Refresh(); $hWnd = $p.MainWindowHandle }

if ([PW]::IsIconic($hWnd)) { [PW]::ShowWindow($hWnd, [PW]::SW_RESTORE) | Out-Null }

# Get window size
$rect = New-Object PW+RECT
[PW]::GetWindowRect($hWnd, [ref]$rect) | Out-Null
$w = $rect.Rt - $rect.L; $h = $rect.B - $rect.T

if ($w -le 0 -or $h -le 0) { Write-Error "Window has no size"; exit 1 }

# Capture using PrintWindow
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
[PW]::PrintWindow($hWnd, $hdc, 0) | Out-Null
$g.ReleaseHdc($hdc)
$g.Dispose()

# If PrintWindow got blank (GPU-rendered content), fall back to screen DC
$sample = $bmp.GetPixel($w/2, $h/2)
if ($sample.R -eq 0 -and $sample.G -eq 0 -and $sample.B -eq 0) {
    $bmp.Dispose()
    # Try GetWindowDC + BitBlt as fallback
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $hdcDst = $g.GetHdc()
    $hdcSrc = [PW]::GetWindowDC($hWnd)
    [PW]::BitBlt($hdcDst, 0, 0, $w, $h, $hdcSrc, 0, 0, [PW]::SRCCOPY)
    [PW]::ReleaseDC($hWnd, $hdcSrc)
    $g.ReleaseHdc($hdcDst)
    $g.Dispose()
}

# Resize if too wide
if ($bmp.Width -gt 1400) {
    $r2 = 1400 / $bmp.Width
    $rz = New-Object System.Drawing.Bitmap(1400, [int]($bmp.Height * $r2))
    $rg = [System.Drawing.Graphics]::FromImage($rz)
    $rg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $rg.DrawImage($bmp, 0, 0, 1400, [int]($bmp.Height * $r2))
    $rg.Dispose(); $bmp.Dispose(); $bmp = $rz
}

$outPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputFile)
$dir = Split-Path $outPath -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "Saved: $outPath ($([math]::Round((Get-Item $outPath).Length/1KB,1)) KB)"
