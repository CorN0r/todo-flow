# Final all-in-one capture - run once, capture everything
$ErrorActionPreference = "Stop"
$out = "$PSScriptRoot\..\docs\images"
New-Item -ItemType Directory -Force -Path $out | Out-Null
Get-ChildItem $out -Filter "*.png" | Remove-Item -Force

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public struct R { public int L,T,Rt,B; }
public class W {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, uint d, IntPtr e);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte s, uint f, IntPtr e);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
    public const uint DN=0x0002, UP=0x0004, KU=0x0002; public const int SW_SHOW=5;
    public const byte ESC=0x1B, N=0x4E, K3=0x33, OEM2=0xBF, CTRL=0x11, K=0x4B;
}
"@

$p = Get-Process -Name "todo-flow" | Where-Object { $_.MainWindowTitle -eq "TodoFlow" } | Select-Object -First 1
if (-not $p) { Write-Output "ERROR: TodoFlow not running"; exit 1 }
$h = $p.MainWindowHandle
[W]::ShowWindow($h, 5) | Out-Null
[W]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Seconds 2

$r = New-Object R; [W]::GetWindowRect($h, [ref]$r)
$L = $r.L; $T = $r.T; $W = $r.Rt - $r.L; $Ht = $r.B - $r.T
Write-Output "Window: ${W}x${Ht} at ($L,$T)"

# Verify screen capture works
$s = [System.Windows.Forms.Screen]::PrimaryScreen
$b = New-Object System.Drawing.Bitmap(100, 100)
$g = [System.Drawing.Graphics]::FromImage($b)
$g.CopyFromScreen(0, 0, 0, 0, (New-Object System.Drawing.Size(100, 100)))
$px = $b.GetPixel(50, 50); $g.Dispose(); $b.Dispose()
if ($px.R -eq 0 -and $px.G -eq 0 -and $px.B -eq 0) { Write-Output "ERROR: Screen is black"; exit 1 }
Write-Output "Screen OK: R=$($px.R) G=$($px.G) B=$($px.B)"

# Navigation helpers
function cl($x, $y, $d = 500) {
    [W]::SetCursorPos($x, $y) | Out-Null; Start-Sleep -Milliseconds 50
    [W]::mouse_event([W]::DN, 0, 0, 0, [IntPtr]::Zero) | Out-Null; Start-Sleep -Milliseconds 30
    [W]::mouse_event([W]::UP, 0, 0, 0, [IntPtr]::Zero) | Out-Null; Start-Sleep -Milliseconds $d
}
function sk([byte]$v) {
    [W]::keybd_event($v, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 50
    [W]::keybd_event($v, 0, [W]::KU, [IntPtr]::Zero); Start-Sleep -Milliseconds 50
}
function sck([byte]$v) {
    [W]::keybd_event([W]::CTRL, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 40
    [W]::keybd_event($v, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 50
    [W]::keybd_event($v, 0, [W]::KU, [IntPtr]::Zero); Start-Sleep -Milliseconds 40
    [W]::keybd_event([W]::CTRL, 0, [W]::KU, [IntPtr]::Zero); Start-Sleep -Milliseconds 50
}

function nav($i) { cl ($L + 120) ($T + 83 + $i * 40) }
function tog { cl ($L + $W - 180) ($T + 25) 550 }
function thm { cl ($L + 40) ($T + 25) 450 }

function cap($name) {
    $f = Join-Path $out $name
    $scr = [System.Windows.Forms.Screen]::PrimaryScreen
    $bm = New-Object System.Drawing.Bitmap($scr.Bounds.Width, $scr.Bounds.Height)
    $gf = [System.Drawing.Graphics]::FromImage($bm)
    $gf.CopyFromScreen($scr.Bounds.X, $scr.Bounds.Y, 0, 0, $scr.Bounds.Size)
    $gf.Dispose()
    $wr = New-Object R; [W]::GetWindowRect($h, [ref]$wr)
    $x = [Math]::Max(0, $wr.L); $y = [Math]::Max(0, $wr.T)
    $cw = [Math]::Min($wr.Rt - $wr.L, $bm.Width - $x)
    $ch = [Math]::Min($wr.B - $wr.T, $bm.Height - $y)
    if ($cw -gt 0 -and $ch -gt 0) {
        $cr = New-Object System.Drawing.Bitmap($cw, $ch)
        $cg = [System.Drawing.Graphics]::FromImage($cr)
        $cg.DrawImage($bm, 0, 0, (New-Object System.Drawing.Rectangle($x, $y, $cw, $ch)), [System.Drawing.GraphicsUnit]::Pixel)
        $cg.Dispose(); $bm.Dispose(); $bm = $cr
    }
    if ($bm.Width -gt 1400) {
        $rt = 1400 / $bm.Width; $nw = 1400; $nh = [int]($bm.Height * $rt)
        $rz = New-Object System.Drawing.Bitmap($nw, $nh)
        $rg = [System.Drawing.Graphics]::FromImage($rz)
        $rg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $rg.DrawImage($bm, 0, 0, $nw, $nh)
        $rg.Dispose(); $bm.Dispose(); $bm = $rz
    }
    $bm.Save($f, [System.Drawing.Imaging.ImageFormat]::Png)
    $bm.Dispose()
    $sz = [math]::Round((Get-Item $f).Length / 1KB, 1)
    Write-Output "  $name ($sz KB)"
}

# === Switch to Lumina ===
Write-Output "`nCycling to Lumina theme..."
for ($i = 0; $i -lt 5; $i++) { thm }
Write-Output "Theme: Lumina`n"

# === PART 1: All feature screenshots in Lumina ===
Write-Output "=== PART 1: Feature Screenshots (Lumina) ==="

nav 0; Start-Sleep -Seconds 1
Write-Output "[01] Main overview (list view)"; cap "01-main-overview.png"
cl ($L + 330) ($T + 120)
Write-Output "[02] Task detail panel"; cap "02-task-detail.png"
sk([W]::ESC); Start-Sleep -Seconds 1
Write-Output "[03] List view"; cap "03-list-view.png"
tog
Write-Output "[04] Sticky wall"; cap "04-sticky-wall.png"
tog
Write-Output "[05] Unified view"; cl ($L + 330) ($T + 140); cap "05-unified-view.png"
tog
nav 2; Start-Sleep 1; Write-Output "[06] Calendar"; cap "06-calendar-month.png"
nav 3; Start-Sleep 1; Write-Output "[07] Matrix"; cap "07-matrix.png"
nav 4; Start-Sleep 1; Write-Output "[08] Kanban"; cap "08-kanban.png"
nav 1; Start-Sleep 1; Write-Output "[09] My Day"; cap "09-myday.png"
nav 5; Start-Sleep 1; Write-Output "[10] Habits"; cap "10-habits.png"
nav 6; Start-Sleep 1; Write-Output "[11] Dashboard"; cap "11-dashboard.png"
nav 0; Start-Sleep 1; sk([W]::OEM2); Start-Sleep 1; Write-Output "[12] Command palette"; cap "12-command-palette.png"
sk([W]::ESC); Start-Sleep 1
sck([W]::K); Start-Sleep 1; Write-Output "[13] Search"; cap "13-search.png"
sk([W]::ESC); Start-Sleep 1
sk([W]::N); Start-Sleep 1; Write-Output "[14] Quick add"; cap "14-quick-add.png"
sk([W]::ESC); Start-Sleep 1
sk([W]::K3); Start-Sleep 1; Write-Output "[15] Settings"; cap "15-settings.png"

# === PART 2: Theme screenshots ===
Write-Output "`n=== PART 2: Theme Screenshots ==="
nav 0; Start-Sleep 1
# Lumina -> Light (1 click)
thm; Write-Output "[16] Light"; cap "16-theme-light.png"
thm; Write-Output "[17] Dark"; cap "17-theme-dark.png"
thm; Start-Sleep -Milliseconds 100  # system skip
thm; Write-Output "[18] Glass"; cap "18-theme-glass.png"
thm; Write-Output "[19] Warm"; cap "19-theme-warm.png"
thm; Write-Output "[20] Lumina"; cap "20-theme-lumina.png"

Write-Output "`n=== Complete! ==="
Get-ChildItem $out -Filter "*.png" | Sort-Object Name | ForEach-Object {
    Write-Output "  $($_.Name): $([math]::Round($_.Length/1KB,1)) KB"
}
