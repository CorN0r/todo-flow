# Corrected capture - theme button on RIGHT side, correct cycle order
# Cycle: lumina→light→dark→warm→glass→system (6 themes)
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
if (-not $p) { Write-Output "ERROR: not running"; exit 1 }
$h = $p.MainWindowHandle
[W]::ShowWindow($h, 5) | Out-Null; [W]::SetForegroundWindow($h) | Out-Null; Start-Sleep 2

$r = New-Object R; [W]::GetWindowRect($h, [ref]$r)
$L=$r.L; $T=$r.T; $W=$r.Rt-$r.L
Write-Output "Window: ${W}x$($r.B-$r.T) at ($L,$T)"

# Test capture
$s=[System.Windows.Forms.Screen]::PrimaryScreen
$b=New-Object System.Drawing.Bitmap(100,100); $g=[System.Drawing.Graphics]::FromImage($b)
$g.CopyFromScreen(0,0,0,0,(New-Object System.Drawing.Size(100,100)))
$px=$b.GetPixel(50,50); $g.Dispose(); $b.Dispose()
if($px.R+$px.G+$px.B -eq 0){ Write-Output "SCREEN BLACK"; exit 1 }
Write-Output "Screen OK: R=$($px.R) G=$($px.G) B=$($px.B)"

# Helper functions
function cl($x,$y,$d=500){ [W]::SetCursorPos($x,$y)|Out-Null; Sleep -Milliseconds 50; [W]::mouse_event([W]::DN,0,0,0,[IntPtr]::Zero)|Out-Null; Sleep 30; [W]::mouse_event([W]::UP,0,0,0,[IntPtr]::Zero)|Out-Null; Sleep $d }
function sk([byte]$v){ [W]::keybd_event($v,0,0,[IntPtr]::Zero); Sleep 50; [W]::keybd_event($v,0,[W]::KU,[IntPtr]::Zero); Sleep 50 }
function sck([byte]$v){ [W]::keybd_event([W]::CTRL,0,0,[IntPtr]::Zero); Sleep 40; [W]::keybd_event($v,0,0,[IntPtr]::Zero); Sleep 50; [W]::keybd_event($v,0,[W]::KU,[IntPtr]::Zero); Sleep 40; [W]::keybd_event([W]::CTRL,0,[W]::KU,[IntPtr]::Zero); Sleep 50 }
function nav($i){ cl ($L+120) ($T+83+$i*40) }
function tog{ cl ($L+$W-180) ($T+25) 550 }

# Theme button: RIGHT side of header, after SearchBar, before window controls
# Header is h-10(40px). Window controls ~120px, theme btn ~36px, SearchBar ~240px
# Theme btn center: windowRight - 140, windowTop + 20
function thm{ cl ($L+$W-140) ($T+20) 450 }

function GetBrightness {
    $s=[System.Windows.Forms.Screen]::PrimaryScreen
    $b=New-Object System.Drawing.Bitmap(200,200)
    $g=[System.Drawing.Graphics]::FromImage($b)
    # Sample content area center (not header)
    $sx=$L+$W/2; $sy=$T+300
    $g.CopyFromScreen($sx,$sy,0,0,(New-Object System.Drawing.Size(200,200)))
    $total=0; for($x=0;$x -lt 200;$x+=10){ for($y=0;$y -lt 200;$y+=10){ $p=$b.GetPixel($x,$y); $total+=$p.R+$p.G+$p.B } }
    $g.Dispose(); $b.Dispose()
    return [math]::Round($total/400) # average brightness per pixel
}

function cap($name){
    $f=Join-Path $out $name
    $s=[System.Windows.Forms.Screen]::PrimaryScreen
    $b=New-Object System.Drawing.Bitmap($s.Bounds.Width,$s.Bounds.Height)
    $g=[System.Drawing.Graphics]::FromImage($b)
    $g.CopyFromScreen($s.Bounds.X,$s.Bounds.Y,0,0,$s.Bounds.Size); $g.Dispose()
    $wr=New-Object R; [W]::GetWindowRect($h,[ref]$wr)
    $x=[Math]::Max(0,$wr.L); $y=[Math]::Max(0,$wr.T); $cw=[Math]::Min($wr.Rt-$wr.L,$b.Width-$x); $ch=[Math]::Min($wr.B-$wr.T,$b.Height-$y)
    if($cw -gt 0 -and $ch -gt 0){ $c=New-Object System.Drawing.Bitmap($cw,$ch); $cg=[System.Drawing.Graphics]::FromImage($c); $cg.DrawImage($b,0,0,(New-Object System.Drawing.Rectangle($x,$y,$cw,$ch)),[System.Drawing.GraphicsUnit]::Pixel); $cg.Dispose(); $b.Dispose(); $b=$c }
    if($b.Width -gt 1400){ $rt=1400/$b.Width; $rz=New-Object System.Drawing.Bitmap(1400,[int]($b.Height*$rt)); $rg=[System.Drawing.Graphics]::FromImage($rz); $rg.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; $rg.DrawImage($b,0,0,1400,[int]($b.Height*$rt)); $rg.Dispose(); $b.Dispose(); $b=$rz }
    $b.Save($f,[System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
    Write-Output "  $name ($([math]::Round((Get-Item $f).Length/1KB,1)) KB)"
}

# === Detect current theme and switch to Lumina ===
Write-Output "`nDetecting theme..."
$bright = GetBrightness
Write-Output "Current brightness: $bright"
# Light theme: brightness > 400. Dark themes: < 200
# Lumina is light (~500+). Warm is dark (~100-150). Dark is ~50-100.
# We need Lumina. If dark, cycle until light+bright.

$clicks = 0
while ($bright -lt 350 -and $clicks -lt 6) {
    thm; $clicks++
    $bright = GetBrightness
    Write-Output "  Click $clicks -> brightness: $bright"
}
Write-Output "After $clicks clicks, brightness: $bright (target Lumina: >400)"

# ===== PART 1: Feature screenshots (all Lumina) =====
Write-Output "`n=== PART 1: Feature Screenshots ==="

nav 0; Sleep 1
Write-Output "[01] Main overview"; cap "01-main-overview.png"
cl ($L+330) ($T+120)
Write-Output "[02] Task detail"; cap "02-task-detail.png"
sk([W]::ESC); Sleep 1
Write-Output "[03] List view"; cap "03-list-view.png"
tog; Write-Output "[04] Sticky wall"; cap "04-sticky-wall.png"
tog; Write-Output "[05] Unified view"; cl ($L+330) ($T+140); cap "05-unified-view.png"
tog
nav 2; Sleep 1; Write-Output "[06] Calendar"; cap "06-calendar-month.png"
nav 3; Sleep 1; Write-Output "[07] Matrix"; cap "07-matrix.png"
nav 4; Sleep 1; Write-Output "[08] Kanban"; cap "08-kanban.png"
nav 1; Sleep 1; Write-Output "[09] My Day"; cap "09-myday.png"
nav 5; Sleep 1; Write-Output "[10] Habits"; cap "10-habits.png"
nav 6; Sleep 1; Write-Output "[11] Dashboard"; cap "11-dashboard.png"
nav 0; Sleep 1; sk([W]::OEM2); Sleep 1; Write-Output "[12] Cmd palette"; cap "12-command-palette.png"
sk([W]::ESC); Sleep 1
sck([W]::K); Sleep 1; Write-Output "[13] Search"; cap "13-search.png"
sk([W]::ESC); Sleep 1
sk([W]::N); Sleep 1; Write-Output "[14] Quick add"; cap "14-quick-add.png"
sk([W]::ESC); Sleep 1
sk([W]::K3); Sleep 1; Write-Output "[15] Settings"; cap "15-settings.png"

# ===== PART 2: Theme screenshots =====
Write-Output "`n=== PART 2: Theme Screenshots ==="
nav 0; Sleep 1
# We should be at Lumina. Cycle through all themes.
# Cycle order: lumina(0)→light(1)→dark(2)→warm(3)→glass(4)→system(5)

# Current: Lumina. Click 1x → Light
thm; Write-Output "[16] Light"; cap "16-theme-light.png"
# Light → Dark
thm; Write-Output "[17] Dark"; cap "17-theme-dark.png"
# Dark → Warm
thm; Write-Output "[18] Warm"; cap "18-theme-warm.png"
# Warm → Glass
thm; Write-Output "[19] Glass"; cap "19-theme-glass.png"
# Glass → System (skip)
thm; Sleep 100
# System → Lumina
thm; Write-Output "[20] Lumina"; cap "20-theme-lumina.png"

Write-Output "`n=== Complete! ==="
Get-ChildItem $out -Filter "*.png" | Sort-Object Name | ForEach-Object { Write-Output "  $($_.Name): $([math]::Round($_.Length/1KB,1)) KB" }
