# All-in-one capture script - run with dot-source: . .\all-capture.ps1
param([string]$OutputDir = "$PSScriptRoot\..\docs\images")

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System; using System.Runtime.InteropServices;
public struct R { public int L,T,Rt,B; }
public class W {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, uint d, IntPtr e);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte s, uint f, IntPtr e);
    public const uint DN=0x0002, UP=0x0004, KU=0x0002;
    public const byte ESC=0x1B, N=0x4E, K3=0x33, OEM2=0xBF, CTRL=0x11, K=0x4B;
}
"@

# Get window
$p = Get-Process -Name "todo-flow" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "TodoFlow" } | Select-Object -First 1
if (-not $p) { Write-Output "ERROR: TodoFlow not found"; return }
$h = $p.MainWindowHandle
[W]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 1500  # Extra warmup time

$r = New-Object R; [W]::GetWindowRect($h, [ref]$r)
$L = $r.L; $T = $r.T; $W = $r.Rt - $r.L
Write-Output "Window: ($L,$T) ${W}x$($r.B-$r.T)"

# Helper functions
function ClickAt([int]$x, [int]$y, [int]$delayMs = 500) {
    [W]::SetCursorPos($x, $y) | Out-Null; Start-Sleep -Milliseconds 50
    [W]::mouse_event([W]::DN, 0, 0, 0, [IntPtr]::Zero) | Out-Null
    Start-Sleep -Milliseconds 30
    [W]::mouse_event([W]::UP, 0, 0, 0, [IntPtr]::Zero) | Out-Null
    Start-Sleep -Milliseconds $delayMs
}
function SendKey([byte]$vk) {
    [W]::keybd_event($vk, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 50
    [W]::keybd_event($vk, 0, [W]::KU, [IntPtr]::Zero); Start-Sleep -Milliseconds 50
}
function SendCtrl([byte]$vk) {
    [W]::keybd_event([W]::CTRL, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 40
    [W]::keybd_event($vk, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 50
    [W]::keybd_event($vk, 0, [W]::KU, [IntPtr]::Zero); Start-Sleep -Milliseconds 40
    [W]::keybd_event([W]::CTRL, 0, [W]::KU, [IntPtr]::Zero); Start-Sleep -Milliseconds 50
}
function NavSidebar([int]$index) { ClickAt ($L + 120) ($T + 83 + $index * 40) }
function ToggleView { ClickAt ($L + $W - 180) ($T + 25) 550 }
function ClickThemeBtn { ClickAt ($L + 40) ($T + 25) 450 }

function TakeScreenshot([string]$filename) {
    $outputFile = Join-Path $OutputDir $filename
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen
    $bmp = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $screen.Bounds.Size)
    $g.Dispose()

    # Crop to window
    $wr = New-Object R
    if ([W]::GetWindowRect($h, [ref]$wr)) {
        $x = [Math]::Max(0, $wr.L); $y = [Math]::Max(0, $wr.T)
        $cw = [Math]::Min($wr.Rt - $wr.L, $bmp.Width - $x)
        $ch = [Math]::Min($wr.B - $wr.T, $bmp.Height - $y)
        if ($cw -gt 0 -and $ch -gt 0) {
            $crop = New-Object System.Drawing.Bitmap($cw, $ch)
            $cg = [System.Drawing.Graphics]::FromImage($crop)
            $cr = New-Object System.Drawing.Rectangle($x, $y, $cw, $ch)
            $cg.DrawImage($bmp, 0, 0, $cr, [System.Drawing.GraphicsUnit]::Pixel)
            $cg.Dispose(); $bmp.Dispose(); $bmp = $crop
        }
    }

    # Resize if too wide
    if ($bmp.Width -gt 1400) {
        $ratio = 1400 / $bmp.Width
        $resized = New-Object System.Drawing.Bitmap(1400, [int]($bmp.Height * $ratio))
        $rg = [System.Drawing.Graphics]::FromImage($resized)
        $rg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $rg.DrawImage($bmp, 0, 0, 1400, [int]($bmp.Height * $ratio))
        $rg.Dispose(); $bmp.Dispose(); $bmp = $resized
    }

    $bmp.Save($outputFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $size = [math]::Round((Get-Item $outputFile).Length / 1KB, 1)
    Write-Output "  $filename ($size KB)"
}

# ===== MAIN =====
Write-Output "`nSwitching to Lumina theme (5 clicks from Light)..."
for ($i = 0; $i -lt 5; $i++) { ClickThemeBtn }
Write-Output "Theme: Lumina`n"

# --- Part 1: Feature screenshots (Lumina) ---
Write-Output "=== Feature Screenshots (Lumina) ==="

NavSidebar 0; Start-Sleep -Milliseconds 500
Write-Output "[01] Main overview (list view)"; TakeScreenshot "01-main-overview.png"
ClickAt ($L + 330) ($T + 120)
Write-Output "[02] Task detail panel"; TakeScreenshot "02-task-detail.png"
SendKey([W]::ESC); Start-Sleep -Milliseconds 500
Write-Output "[03] List view"; TakeScreenshot "03-list-view.png"
ToggleView
Write-Output "[04] Sticky wall"; TakeScreenshot "04-sticky-wall.png"
ToggleView
Write-Output "[05] Unified view"; ClickAt ($L + 330) ($T + 140); TakeScreenshot "05-unified-view.png"
ToggleView

NavSidebar 2; Start-Sleep -Milliseconds 500
Write-Output "[06] Calendar"; TakeScreenshot "06-calendar-month.png"
NavSidebar 3; Start-Sleep -Milliseconds 500
Write-Output "[07] Matrix"; TakeScreenshot "07-matrix.png"
NavSidebar 4; Start-Sleep -Milliseconds 500
Write-Output "[08] Kanban"; TakeScreenshot "08-kanban.png"
NavSidebar 1; Start-Sleep -Milliseconds 500
Write-Output "[09] My Day"; TakeScreenshot "09-myday.png"
NavSidebar 5; Start-Sleep -Milliseconds 500
Write-Output "[10] Habits"; TakeScreenshot "10-habits.png"
NavSidebar 6; Start-Sleep -Milliseconds 500
Write-Output "[11] Dashboard"; TakeScreenshot "11-dashboard.png"
NavSidebar 0; Start-Sleep -Milliseconds 400
SendKey([W]::OEM2); Start-Sleep -Milliseconds 500
Write-Output "[12] Command palette"; TakeScreenshot "12-command-palette.png"
SendKey([W]::ESC); Start-Sleep -Milliseconds 400
SendCtrl([W]::K); Start-Sleep -Milliseconds 500
Write-Output "[13] Search"; TakeScreenshot "13-search.png"
SendKey([W]::ESC); Start-Sleep -Milliseconds 400
SendKey([W]::N); Start-Sleep -Milliseconds 500
Write-Output "[14] Quick add"; TakeScreenshot "14-quick-add.png"
SendKey([W]::ESC); Start-Sleep -Milliseconds 400
SendKey([W]::K3); Start-Sleep -Milliseconds 500
Write-Output "[15] Settings"; TakeScreenshot "15-settings.png"

# --- Part 2: Theme screenshots ---
Write-Output "`n=== Theme Screenshots ==="
NavSidebar 0; Start-Sleep -Milliseconds 500
# From Lumina -> Light (1 click)
ClickThemeBtn
Write-Output "[16] Light"; TakeScreenshot "16-theme-light.png"
ClickThemeBtn
Write-Output "[17] Dark"; TakeScreenshot "17-theme-dark.png"
ClickThemeBtn; Start-Sleep -Milliseconds 100  # System - skip
ClickThemeBtn
Write-Output "[18] Glass"; TakeScreenshot "18-theme-glass.png"
ClickThemeBtn
Write-Output "[19] Warm"; TakeScreenshot "19-theme-warm.png"
ClickThemeBtn
Write-Output "[20] Lumina"; TakeScreenshot "20-theme-lumina.png"

Write-Output "`n=== Complete! ==="
Get-ChildItem $OutputDir -Filter "*.png" | Sort-Object Name | ForEach-Object {
    Write-Output "  $($_.Name): $([math]::Round($_.Length/1KB,1)) KB"
}
