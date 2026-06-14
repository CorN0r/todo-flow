# Gentle capture - slow clicks, long waits
$out = "$PSScriptRoot\..\docs\images"
Get-ChildItem $out -Filter "*.png" -ErrorAction SilentlyContinue | Remove-Item -Force

Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public struct R { public int L,T,Rt,B; }
public class W {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, uint d, IntPtr e);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte s, uint f, IntPtr e);
    public const uint DN=0x0002,UP=0x0004,KU=0x0002;
    public const byte ESC=0x1B,N=0x4E,K3=0x33,OEM2=0xBF,CTRL=0x11,K=0x4B;
}
"@

$p = Get-Process -Name "todo-flow" | Where-Object { $_.MainWindowTitle -eq "TodoFlow" } | Select-Object -First 1
if (-not $p) { Write-Output "ERROR: not running"; exit 1 }
$h = $p.MainWindowHandle
[W]::SetForegroundWindow($h) | Out-Null; Start-Sleep 3

$r = New-Object R; [W]::GetWindowRect($h, [ref]$r)
$L = $r.L; $T = $r.T; $W = $r.Rt - $r.L
Write-Output "Window: ${W}x$($r.B-$r.T)"

function cl($x,$y){[W]::SetCursorPos($x,$y)|Out-Null;Sleep -Milliseconds 80;[W]::mouse_event([W]::DN,0,0,0,[IntPtr]::Zero)|Out-Null;Sleep 50;[W]::mouse_event([W]::UP,0,0,0,[IntPtr]::Zero)|Out-Null;Sleep 800}
function sk([byte]$v){[W]::keybd_event($v,0,0,[IntPtr]::Zero);Sleep 80;[W]::keybd_event($v,0,[W]::KU,[IntPtr]::Zero);Sleep 80}
function sck([byte]$v){[W]::keybd_event([W]::CTRL,0,0,[IntPtr]::Zero);Sleep 60;[W]::keybd_event($v,0,0,[IntPtr]::Zero);Sleep 80;[W]::keybd_event($v,0,[W]::KU,[IntPtr]::Zero);Sleep 60;[W]::keybd_event([W]::CTRL,0,[W]::KU,[IntPtr]::Zero);Sleep 80}
function nav($i){cl ($L+120) ($T+83+$i*40)}
function thm{cl ($L+$W-140) ($T+20)}

function cap($name){
    $f = Join-Path $out $name
    $s = [System.Windows.Forms.Screen]::PrimaryScreen
    $b = New-Object System.Drawing.Bitmap($s.Bounds.Width, $s.Bounds.Height)
    $g = [System.Drawing.Graphics]::FromImage($b)
    $g.CopyFromScreen($s.Bounds.X, $s.Bounds.Y, 0, 0, $s.Bounds.Size); $g.Dispose()
    $wr = New-Object R; [W]::GetWindowRect($h, [ref]$wr)
    $x = [Math]::Max(0, $wr.L); $y = [Math]::Max(0, $wr.T)
    $cw = [Math]::Min($wr.Rt - $wr.L, $b.Width - $x)
    $ch = [Math]::Min($wr.B - $wr.T, $b.Height - $y)
    if ($cw -gt 0) {
        $c = New-Object System.Drawing.Bitmap($cw, $ch)
        $cg = [System.Drawing.Graphics]::FromImage($c)
        $cg.DrawImage($b, 0, 0, (New-Object System.Drawing.Rectangle($x, $y, $cw, $ch)), [System.Drawing.GraphicsUnit]::Pixel)
        $cg.Dispose(); $b.Dispose(); $b = $c
    }
    if ($b.Width -gt 1400) {
        $rt = 1400 / $b.Width; $rz = New-Object System.Drawing.Bitmap(1400, [int]($b.Height * $rt))
        $rg = [System.Drawing.Graphics]::FromImage($rz)
        $rg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $rg.DrawImage($b, 0, 0, 1400, [int]($b.Height * $rt)); $rg.Dispose(); $b.Dispose(); $b = $rz
    }
    $b.Save($f, [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
    $sz = [math]::Round((Get-Item $f).Length / 1KB, 1)
    Write-Output "  $name ($sz KB)"
}

# Check brightness at content center
function bright {
    $s = [System.Windows.Forms.Screen]::PrimaryScreen
    $b = New-Object System.Drawing.Bitmap(100, 100)
    $g = [System.Drawing.Graphics]::FromImage($b)
    $g.CopyFromScreen(($L + $W/2), ($T + 300), 0, 0, (New-Object System.Drawing.Size(100, 100)))
    $t = 0
    for ($x = 0; $x -lt 100; $x += 5) { for ($y = 0; $y -lt 100; $y += 5) { $px = $b.GetPixel($x, $y); $t += $px.R + $px.G + $px.B } }
    $g.Dispose(); $b.Dispose()
    return [math]::Round($t / 400)
}

# Switch to Lumina if needed
$b = bright
Write-Output "Brightness: $b"
if ($b -lt 350) {
    Write-Output "Dark theme detected, switching to Lumina..."
    thm; Start-Sleep 2
    $b = bright
    Write-Output "After click: $b"
}

# === Capture ===
Write-Output "`n=== Features (Lumina) ==="

nav 0; Start-Sleep 2
Write-Output "[01] Main overview"; cap "01-main-overview.png"

cl ($L + 330) ($T + 120)
Write-Output "[02] Task detail"; cap "02-task-detail.png"
sk([W]::ESC); Start-Sleep 2
Write-Output "[03] List view"; cap "03-list-view.png"

# Toggle view - click header area view toggle button
cl ($L + $W - 180) ($T + 25)  # view toggle in header
Write-Output "[04] Sticky wall"; cap "04-sticky-wall.png"
cl ($L + $W - 180) ($T + 25)  # toggle again
Write-Output "[05] Unified"; cl ($L + 330) ($T + 140); cap "05-unified-view.png"
cl ($L + $W - 180) ($T + 25)  # back to list

nav 2; Start-Sleep 2; Write-Output "[06] Calendar"; cap "06-calendar-month.png"
nav 3; Start-Sleep 2; Write-Output "[07] Matrix"; cap "07-matrix.png"
nav 4; Start-Sleep 2; Write-Output "[08] Kanban"; cap "08-kanban.png"
nav 1; Start-Sleep 2; Write-Output "[09] MyDay"; cap "09-myday.png"
nav 5; Start-Sleep 2; Write-Output "[10] Habits"; cap "10-habits.png"
nav 6; Start-Sleep 2; Write-Output "[11] Dashboard"; cap "11-dashboard.png"

nav 0; Start-Sleep 2
sk([W]::OEM2); Start-Sleep 2; Write-Output "[12] Palette"; cap "12-command-palette.png"
sk([W]::ESC); Start-Sleep 2
sck([W]::K); Start-Sleep 2; Write-Output "[13] Search"; cap "13-search.png"
sk([W]::ESC); Start-Sleep 2
sk([W]::N); Start-Sleep 2; Write-Output "[14] Quick add"; cap "14-quick-add.png"
sk([W]::ESC); Start-Sleep 2
sk([W]::K3); Start-Sleep 2; Write-Output "[15] Settings"; cap "15-settings.png"

# === Themes ===
Write-Output "`n=== Themes ==="
nav 0; Start-Sleep 2
thm; Start-Sleep 2; Write-Output "[16] Light"; cap "16-theme-light.png"
thm; Start-Sleep 2; Write-Output "[17] Dark"; cap "17-theme-dark.png"
thm; Start-Sleep 2; Write-Output "[18] Warm"; cap "18-theme-warm.png"
thm; Start-Sleep 2; Write-Output "[19] Glass"; cap "19-theme-glass.png"
thm; Start-Sleep 1; thm; Start-Sleep 2; Write-Output "[20] Lumina"; cap "20-theme-lumina.png"

Write-Output "`nDone!"
Get-ChildItem $out -Filter "*.png" | Sort-Object Name | ForEach-Object { Write-Output "  $($_.Name): $([math]::Round($_.Length/1KB,1)) KB" }
